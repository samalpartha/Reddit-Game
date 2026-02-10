import { Hono } from 'hono';
import { context, redis, reddit } from '@devvit/web/server';
import type {
  TodayResponse,
  VoteRequest,
  VoteResponse,
  RevealResponse,
  ArchiveEntry,
  SubmitCaseRequest,
  CommentMarkRequest,
  Vote,
  LeaderboardResponse,
} from '../../shared/types';
import { DEFAULT_LABELS, CASE_OPEN_HOURS, REVEAL_DELAY_HOURS, CYCLE_HOURS } from '../../shared/types';
import {
  getCaseByDate,
  getCase,
  getVote,
  saveVote,
  getAggregate,
  getScore,
  getStreak,
  updateStreak,
  saveCase,
  getTodayDateKey,
  formatDateKey,
  formatCycleKey,
  getWeekKey,
  dateKeyToDate,
  getRecentCaseDates,
  saveSubmission,
  getPendingSubmissions,
  approveSubmission,
  rejectSubmission,
  getUserSubmissionCount,
  incrementUserSubmissionCount,
  cacheUsername,
  saveScore,
  addToWeeklyLeaderboard,
  markCommentTime,
  updateCaseStatus,
  setMinigameScore,
  getMinigameScore,
} from '../services/redis';
import {
  computeUserScore,
  computeMajority,
  buildLeaderboardResponse,
} from '../services/scoring';
import {
  validateVoteInput,
  validateSubmission,
  validateLabelsOverride,
  checkSubmissionRateLimit,
} from '../services/validation';
import { getSeedCaseForDate } from '../data/seed-cases';

export const api = new Hono();

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getUsername(): Promise<string> {
  const username = await reddit.getCurrentUsername();
  return username ?? 'anonymous';
}

async function getUserId(): Promise<string> {
  return context.userId ?? 'anonymous';
}

async function ensureAuth(): Promise<{ userId: string; username: string } | null> {
  const userId = await getUserId();
  const username = await getUsername();
  if (userId === 'anonymous' || !context.userId) return null;
  // Cache username for leaderboard display
  await cacheUsername(userId, username);
  return { userId, username };
}

function getSubId(): string {
  if (!context.subredditName) {
    // This shouldn't happen in production, but handle gracefully
    console.warn('Missing subredditName in context, using fallback');
  }
  return context.subredditName ?? '_global';
}

async function requireMod(): Promise<{ userId: string; username: string }> {
  const auth = await ensureAuth();
  if (!auth) {
    throw new ModError('Login required', 401);
  }

  try {
    if (context.subredditName && context.userId) {
      const user = await reddit.getUserById(context.userId);
      if (user) {
        const modPermissions = await user.getModPermissionsForSubreddit(context.subredditName);
        if (modPermissions !== undefined && modPermissions !== null) {
          return auth;
        }
      }
    }
  } catch {
    // Fall through to error
  }

  throw new ModError('Moderator access required', 403);
}

class ModError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// ─── Ensure today's case exists (auto-create from seed if needed) ────────────

async function ensureTodayCase(subId: string): Promise<string | null> {
  const dateKey = getTodayDateKey();
  let todayCase = await getCaseByDate(subId, dateKey);

  if (!todayCase) {
    // Auto-create from seed data
    const seed = getSeedCaseForDate(dateKey);
    const now = Date.now();
    const caseId = `${subId}-${dateKey}`;

    todayCase = {
      caseId,
      subId,
      dateKey,
      title: seed.title,
      text: seed.text,
      labels: seed.labels,
      openTs: now,
      closeTs: now + CASE_OPEN_HOURS * 60 * 60 * 1000,
      revealTs: now + (CASE_OPEN_HOURS + REVEAL_DELAY_HOURS) * 60 * 60 * 1000,
      status: 'open',
      source: 'seed',
      createdBy: 'app',
    };

    await saveCase(todayCase);
  }

  return todayCase.caseId;
}

// ─── GET /api/init ───────────────────────────────────────────────────────────

api.get('/init', async (c) => {
  const { postId } = context;
  const username = await getUsername();
  const userId = await getUserId();

  if (userId !== 'anonymous') {
    await cacheUsername(userId, username);
  }

  // Check if user is a moderator
  let isMod = false;
  try {
    if (userId !== 'anonymous' && context.subredditName) {
      const user = context.userId ? await reddit.getUserById(context.userId) : null;
      if (user) {
        const modPermissions = await user.getModPermissionsForSubreddit(context.subredditName);
        isMod = modPermissions !== undefined && modPermissions !== null;
      }
    }
  } catch {
    // Not a mod or API call failed - default to false
    isMod = false;
  }

  return c.json({
    type: 'init' as const,
    postId: postId ?? '',
    username,
    userId,
    isMod,
  });
});

// ─── GET /api/today ──────────────────────────────────────────────────────────

api.get('/today', async (c) => {
  const auth = await ensureAuth();
  const subId = getSubId();
  const dateKey = getTodayDateKey();

  // Ensure case exists
  await ensureTodayCase(subId);
  const todayCase = await getCaseByDate(subId, dateKey);

  if (!todayCase) {
    return c.json({ error: 'No case available today' }, 404);
  }

  // Auto-transition status based on time
  const now = Date.now();
  if (todayCase.status === 'open' && now >= todayCase.closeTs) {
    await updateCaseStatus(todayCase.caseId, 'closed');
    todayCase.status = 'closed';
  }
  if (todayCase.status === 'closed' && now >= todayCase.revealTs) {
    await updateCaseStatus(todayCase.caseId, 'revealed');
    todayCase.status = 'revealed';
  }

  const userId = auth?.userId ?? 'anonymous';
  const username = auth?.username ?? 'anonymous';

  // Get user's vote if they've voted
  const userVote = userId !== 'anonymous' ? await getVote(todayCase.caseId, userId) : null;

  // Get aggregate (only show if case is revealed or user has voted)
  let aggregate = null;
  if (todayCase.status === 'revealed') {
    aggregate = await getAggregate(todayCase.caseId);
  }

  // Get score and streak (only if revealed)
  let score = null;
  let streak = null;
  let leaderboard = null;

  if (todayCase.status === 'revealed' && userId !== 'anonymous') {
    score = await getScore(todayCase.caseId, userId);

    // If score hasn't been computed yet, compute it now
    if (!score && userVote) {
      score = await computeUserScore(todayCase, userId);
      if (score) {
        await saveScore(score);
        // Update streak
        streak = await updateStreak(subId, userId, todayCase.dateKey);
        // Add to weekly leaderboard
        const weekKey = getWeekKey(dateKeyToDate(todayCase.dateKey));
        await addToWeeklyLeaderboard(subId, weekKey, userId, score.total);
      }
    }

    streak = streak ?? (await getStreak(subId, userId));
    leaderboard = await buildLeaderboardResponse(todayCase.caseId, userId);
  }

  const response: TodayResponse = {
    case: todayCase,
    userVote,
    aggregate,
    score,
    streak,
    leaderboard,
    username,
    userId,
  };

  return c.json(response);
});

// ─── POST /api/vote ──────────────────────────────────────────────────────────

api.post('/vote', async (c) => {
  const auth = await ensureAuth();
  if (!auth) {
    return c.json({ error: 'Login required' }, 401);
  }

  let body: VoteRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  // Validate input
  const validationError = validateVoteInput(body);
  if (validationError) {
    return c.json({ error: validationError }, 400);
  }

  // Get the case
  const caseData = await getCase(body.caseId);
  if (!caseData) {
    return c.json({ error: 'Case not found' }, 404);
  }

  // Check case is still open
  const now = Date.now();
  if (caseData.status !== 'open' || now >= caseData.closeTs) {
    return c.json({ error: 'Voting is closed for this case' }, 403);
  }

  // Create vote
  const vote: Vote = {
    caseId: body.caseId,
    userId: auth.userId,
    verdictIndex: body.verdictIndex,
    predictionIndex: body.predictionIndex,
    voteTs: now,
  };

  try {
    const aggregate = await saveVote(vote);

    const response: VoteResponse = {
      success: true,
      vote,
      aggregate,
    };

    return c.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save vote';
    return c.json({ error: message }, 400);
  }
});

// ─── GET /api/reveal ─────────────────────────────────────────────────────────

api.get('/reveal', async (c) => {
  const auth = await ensureAuth();
  if (!auth) {
    return c.json({ error: 'Login required' }, 401);
  }

  const caseId = c.req.query('caseId');
  if (!caseId) {
    return c.json({ error: 'caseId is required' }, 400);
  }

  const caseData = await getCase(caseId);
  if (!caseData) {
    return c.json({ error: 'Case not found' }, 404);
  }

  // Auto-transition status
  const now = Date.now();
  if (caseData.status === 'open' && now >= caseData.closeTs) {
    await updateCaseStatus(caseId, 'closed');
    caseData.status = 'closed';
  }
  if (caseData.status === 'closed' && now >= caseData.revealTs) {
    await updateCaseStatus(caseId, 'revealed');
    caseData.status = 'revealed';
  }

  if (caseData.status !== 'revealed') {
    return c.json({ error: 'Results not yet revealed' }, 403);
  }

  const aggregate = await getAggregate(caseId);
  if (!aggregate) {
    return c.json({ error: 'No votes recorded' }, 404);
  }

  const { majorityIndex, percentages } = computeMajority(aggregate);

  // Compute score if not already done
  let score = await getScore(caseId, auth.userId);
  if (!score) {
    score = await computeUserScore(caseData, auth.userId);
    if (score) {
      await saveScore(score);
      const weekKey = getWeekKey(dateKeyToDate(caseData.dateKey));
      await addToWeeklyLeaderboard(caseData.subId, weekKey, auth.userId, score.total);
    }
  }

  // Update streak
  const streak = await updateStreak(caseData.subId, auth.userId, caseData.dateKey);

  // Build leaderboard
  const leaderboard = await buildLeaderboardResponse(caseId, auth.userId);

  const response: RevealResponse = {
    case: caseData,
    aggregate,
    majorityIndex,
    majorityLabel: caseData.labels[majorityIndex]!,
    percentages,
    score: score ?? {
      caseId,
      userId: auth.userId,
      predictionMatch: 0,
      verdictMatch: 0,
      timingBonus: 0,
      influenceBonus: 0,
      streakBonus: 0,
      miniGameBonus: 0,
      total: 0,
    },
    streak,
    leaderboard,
  };

  return c.json(response);
});

// ─── GET /api/archive ────────────────────────────────────────────────────────

api.get('/archive', async (c) => {
  const auth = await ensureAuth();
  const subId = getSubId();
  // 'days' param now means number of recent rounds to return
  const rounds = Math.min(parseInt(c.req.query('days') ?? '24', 10), 100);

  const dateKeys = await getRecentCaseDates(subId, rounds);
  const entries: ArchiveEntry[] = [];

  for (const dateKey of dateKeys) {
    const caseData = await getCaseByDate(subId, dateKey);
    if (!caseData || caseData.status !== 'revealed') continue;

    const aggregate = await getAggregate(caseData.caseId);
    if (!aggregate) continue;

    const { majorityIndex } = computeMajority(aggregate);

    let userScore = undefined;
    if (auth) {
      const s = await getScore(caseData.caseId, auth.userId);
      if (s) userScore = s;
    }

    entries.push({
      case: caseData,
      aggregate,
      majorityIndex,
      majorityLabel: caseData.labels[majorityIndex]!,
      userScore,
    });
  }

  return c.json({ entries });
});

// ─── POST /api/submit-case ───────────────────────────────────────────────────

api.post('/submit-case', async (c) => {
  const auth = await ensureAuth();
  if (!auth) {
    return c.json({ error: 'Login required' }, 401);
  }

  let body: SubmitCaseRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  // Validate text
  const textError = validateSubmission(body.text);
  if (textError) {
    return c.json({ error: textError }, 400);
  }

  // Validate labels if provided
  if (body.labelsOverride) {
    const labelsError = validateLabelsOverride(body.labelsOverride);
    if (labelsError) {
      return c.json({ error: labelsError }, 400);
    }
  }

  // Rate limit check
  const subId = getSubId();
  const dateKey = getTodayDateKey();
  const count = await getUserSubmissionCount(subId, auth.userId, dateKey);
  const rateLimitError = checkSubmissionRateLimit(count);
  if (rateLimitError) {
    return c.json({ error: rateLimitError }, 429);
  }

  // Create submission
  const submissionId = `sub-${auth.userId}-${Date.now()}`;
  await saveSubmission({
    submissionId,
    subId,
    userId: auth.userId,
    username: auth.username,
    text: body.text.trim(),
    title: body.title?.trim(),
    labelsOverride: body.labelsOverride,
    status: 'pending',
    submittedAt: Date.now(),
  });

  await incrementUserSubmissionCount(subId, auth.userId, dateKey);

  return c.json({ success: true, submissionId });
});

// ─── GET /api/mod/pending ────────────────────────────────────────────────────

api.get('/mod/pending', async (c) => {
  try {
    await requireMod();
  } catch (err) {
    if (err instanceof ModError) return c.json({ error: err.message }, err.status as 401 | 403);
    return c.json({ error: 'Access denied' }, 403);
  }

  const subId = getSubId();
  const submissions = await getPendingSubmissions(subId);
  return c.json({ submissions });
});

// ─── POST /api/mod/approve ───────────────────────────────────────────────────

api.post('/mod/approve', async (c) => {
  let auth: { userId: string; username: string };
  try {
    auth = await requireMod();
  } catch (err) {
    if (err instanceof ModError) return c.json({ error: err.message }, err.status as 401 | 403);
    return c.json({ error: 'Access denied' }, 403);
  }

  let body: { submissionId: string; dateKey: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  if (!body.submissionId || !body.dateKey) {
    return c.json({ error: 'submissionId and dateKey are required' }, 400);
  }

  const result = await approveSubmission(body.submissionId, body.dateKey, auth.userId);
  if (!result) {
    return c.json({ error: 'Submission not found or already reviewed' }, 404);
  }

  return c.json({ success: true, submission: result });
});

// ─── POST /api/mod/reject ────────────────────────────────────────────────────

api.post('/mod/reject', async (c) => {
  let auth: { userId: string; username: string };
  try {
    auth = await requireMod();
  } catch (err) {
    if (err instanceof ModError) return c.json({ error: err.message }, err.status as 401 | 403);
    return c.json({ error: 'Access denied' }, 403);
  }

  let body: { submissionId: string; reason: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  if (!body.submissionId || !body.reason) {
    return c.json({ error: 'submissionId and reason are required' }, 400);
  }

  const result = await rejectSubmission(body.submissionId, body.reason, auth.userId);
  if (!result) {
    return c.json({ error: 'Submission not found or already reviewed' }, 404);
  }

  return c.json({ success: true, submission: result });
});

// ─── POST /api/comment-mark ──────────────────────────────────────────────────

api.post('/comment-mark', async (c) => {
  const auth = await ensureAuth();
  if (!auth) {
    return c.json({ error: 'Login required' }, 401);
  }

  let body: CommentMarkRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  if (!body.caseId) {
    return c.json({ error: 'caseId is required' }, 400);
  }

  await markCommentTime(body.caseId, auth.userId, Date.now());
  return c.json({ success: true });
});

// ─── GET /api/case ───────────────────────────────────────────────────────────

api.get('/case', async (c) => {
  const caseId = c.req.query('caseId');
  if (!caseId) {
    return c.json({ error: 'caseId is required' }, 400);
  }

  const caseData = await getCase(caseId);
  if (!caseData) {
    return c.json({ error: 'Case not found' }, 404);
  }

  return c.json({ case: caseData });
});

// ─── GET /api/leaderboard/weekly ─────────────────────────────────────────────

api.get('/leaderboard/weekly', async (c) => {
  const auth = await ensureAuth();
  const subId = getSubId();
  const now = new Date();
  const weekKey = getWeekKey(now);

  const { getWeeklyLeaderboard, getCachedUsername } = await import('../services/redis');
  const entries = await getWeeklyLeaderboard(subId, weekKey, 15);

  const top = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const username = await getCachedUsername(entry.member);
    top.push({
      rank: i + 1,
      username,
      score: Number(entry.score),
      userId: entry.member,
    });
  }

  let me = null;
  if (auth) {
    const userEntry = entries.find((e) => e.member === auth.userId);
    if (userEntry) {
      const idx = entries.indexOf(userEntry);
      me = {
        rank: idx + 1,
        username: auth.username,
        score: Number(userEntry.score),
        userId: auth.userId,
      };
    }
  }

  return c.json({ top, me });
});

// ─── POST /api/minigame-score ────────────────────────────────────────────────
// Stores best minigame score for the current case.

api.post('/minigame-score', async (c) => {
  const auth = await ensureAuth();
  if (!auth) {
    return c.json({ error: 'Login required' }, 401);
  }

  let body: { caseId: string; score: number };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  if (!body.caseId || typeof body.score !== 'number' || body.score < 0) {
    return c.json({ error: 'caseId and valid score are required' }, 400);
  }

  // Cap score at a reasonable max to prevent cheating
  const cappedScore = Math.min(Math.round(body.score), 9999);

  await setMinigameScore(body.caseId, auth.userId, cappedScore);
  const best = await getMinigameScore(body.caseId, auth.userId);

  return c.json({ success: true, bestScore: best });
});

// ─── POST /api/mod/delete-case ───────────────────────────────────────────────
// Mod override: delete a case and roll to seed case for the same date.

api.post('/mod/delete-case', async (c) => {
  try {
    await requireMod();
  } catch (err) {
    if (err instanceof ModError) return c.json({ error: err.message }, err.status as 401 | 403);
    return c.json({ error: 'Access denied' }, 403);
  }

  let body: { caseId: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  if (!body.caseId) {
    return c.json({ error: 'caseId is required' }, 400);
  }

  const caseData = await getCase(body.caseId);
  if (!caseData) {
    return c.json({ error: 'Case not found' }, 404);
  }

  // Replace with seed case
  const seed = getSeedCaseForDate(caseData.dateKey);
  const now = Date.now();

  caseData.title = seed.title;
  caseData.text = seed.text;
  caseData.labels = seed.labels;
  caseData.source = 'seed';
  caseData.createdBy = 'app';
  caseData.status = 'open';
  caseData.openTs = now;
  caseData.closeTs = now + CASE_OPEN_HOURS * 60 * 60 * 1000;
  caseData.revealTs = now + (CASE_OPEN_HOURS + REVEAL_DELAY_HOURS) * 60 * 60 * 1000;

  await saveCase(caseData);

  return c.json({ success: true, message: 'Case replaced with seed case' });
});
