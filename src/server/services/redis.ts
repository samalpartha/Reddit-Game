import { redis, reddit, context } from '@devvit/web/server';
import type {
  Case,
  Vote,
  Aggregate,
  Snapshot,
  ScoreBreakdown,
  Streak,
  CaseSubmission,
  CaseStatus,
} from '../../shared/types';

// ─── Key Helpers ─────────────────────────────────────────────────────────────

const keys = {
  caseDateLookup: (subId: string, dateKey: string) => `case:sub:${subId}:date:${dateKey}`,
  case: (caseId: string) => `case:${caseId}`,
  vote: (caseId: string, userId: string) => `vote:${caseId}:${userId}`,
  aggregate: (caseId: string) => `agg:${caseId}`,
  snapshot: (caseId: string, ts: number) => `snap:${caseId}:${ts}`,
  snapshotIndex: (caseId: string) => `snapidx:${caseId}`,
  score: (caseId: string, userId: string) => `score:${caseId}:${userId}`,
  caseLeaderboard: (caseId: string) => `lb:case:${caseId}`,
  weeklyLeaderboard: (subId: string, weekKey: string) => `lb:sub:${subId}:week:${weekKey}`,
  streak: (subId: string, userId: string) => `streak:${subId}:${userId}`,
  submission: (submissionId: string) => `sub:${submissionId}`,
  pendingSubmissions: (subId: string) => `submissions:pending:${subId}`,
  approvedDate: (subId: string, dateKey: string) => `submissions:approved:${subId}:${dateKey}`,
  userSubmissionCount: (subId: string, userId: string, dateKey: string) =>
    `subcount:${subId}:${userId}:${dateKey}`,
  openCases: () => 'cases:open',
  allCaseDates: (subId: string) => `casedates:${subId}`,
  usernameCache: (userId: string) => `username:${userId}`,
};

// ─── Case Operations ─────────────────────────────────────────────────────────

export async function saveCase(c: Case): Promise<void> {
  await redis.set(keys.case(c.caseId), JSON.stringify(c));
  await redis.set(keys.caseDateLookup(c.subId, c.dateKey), c.caseId);
  // Track in open cases set if open
  if (c.status === 'open') {
    await redis.zAdd(keys.openCases(), { member: c.caseId, score: c.closeTs });
  }
  // Track date in subreddit's case date index
  await redis.zAdd(keys.allCaseDates(c.subId), {
    member: c.dateKey,
    score: c.openTs,
  });
}

export async function getCase(caseId: string): Promise<Case | null> {
  const raw = await redis.get(keys.case(caseId));
  return raw ? (JSON.parse(raw) as Case) : null;
}

export async function getCaseByDate(subId: string, dateKey: string): Promise<Case | null> {
  const caseId = await redis.get(keys.caseDateLookup(subId, dateKey));
  if (!caseId) return null;
  return getCase(caseId);
}

export async function updateCaseStatus(caseId: string, status: CaseStatus): Promise<Case | null> {
  const c = await getCase(caseId);
  if (!c) return null;
  c.status = status;
  await redis.set(keys.case(caseId), JSON.stringify(c));

  if (status !== 'open') {
    // Remove from open cases set
    await redis.zRem(keys.openCases(), [caseId]);
  }
  return c;
}

export async function updateCasePostId(caseId: string, postId: string): Promise<void> {
  const c = await getCase(caseId);
  if (!c) return;
  c.postId = postId;
  await redis.set(keys.case(caseId), JSON.stringify(c));
}

export async function getOpenCases(): Promise<string[]> {
  const now = Date.now();
  // Get all cases that haven't been closed yet (closeTs in the future or past)
  const entries = await redis.zRange(keys.openCases(), 0, -1);
  return entries.map((e) => e.member);
}

// ─── Vote Operations ─────────────────────────────────────────────────────────

export async function getVote(caseId: string, userId: string): Promise<Vote | null> {
  const raw = await redis.get(keys.vote(caseId, userId));
  return raw ? (JSON.parse(raw) as Vote) : null;
}

export async function saveVote(vote: Vote): Promise<Aggregate> {
  const existingVote = await getVote(vote.caseId, vote.userId);
  if (existingVote) {
    throw new Error('User has already voted on this case');
  }

  await redis.set(keys.vote(vote.caseId, vote.userId), JSON.stringify(vote));

  // Update aggregate
  return incrementAggregate(vote.caseId, vote.verdictIndex);
}

export async function markCommentTime(
  caseId: string,
  userId: string,
  ts: number
): Promise<void> {
  const vote = await getVote(caseId, userId);
  if (!vote) return;
  if (vote.firstCommentTs) return; // Already marked
  vote.firstCommentTs = ts;
  await redis.set(keys.vote(caseId, userId), JSON.stringify(vote));
}

// ─── Aggregate Operations ────────────────────────────────────────────────────

export async function getAggregate(caseId: string): Promise<Aggregate | null> {
  const raw = await redis.get(keys.aggregate(caseId));
  return raw ? (JSON.parse(raw) as Aggregate) : null;
}

async function incrementAggregate(caseId: string, verdictIndex: number): Promise<Aggregate> {
  const existing = await getAggregate(caseId);
  const agg: Aggregate = existing ?? {
    caseId,
    counts: [0, 0, 0, 0],
    voters: 0,
    lastUpdatedTs: Date.now(),
  };

  agg.counts[verdictIndex]!++;
  agg.voters++;
  agg.lastUpdatedTs = Date.now();

  await redis.set(keys.aggregate(caseId), JSON.stringify(agg));
  return agg;
}

// ─── Snapshot Operations ─────────────────────────────────────────────────────

export async function takeSnapshot(caseId: string): Promise<Snapshot> {
  const agg = await getAggregate(caseId);
  const now = Date.now();
  const snap: Snapshot = {
    ts: now,
    counts: agg ? [...agg.counts] as [number, number, number, number] : [0, 0, 0, 0],
    voters: agg?.voters ?? 0,
  };

  await redis.set(keys.snapshot(caseId, now), JSON.stringify(snap));
  // Index snapshots for this case
  await redis.zAdd(keys.snapshotIndex(caseId), { member: String(now), score: now });

  return snap;
}

export async function getSnapshots(caseId: string): Promise<Snapshot[]> {
  const entries = await redis.zRange(keys.snapshotIndex(caseId), 0, -1);
  const snapshots: Snapshot[] = [];

  for (const entry of entries) {
    const raw = await redis.get(keys.snapshot(caseId, Number(entry.member)));
    if (raw) {
      snapshots.push(JSON.parse(raw) as Snapshot);
    }
  }

  return snapshots;
}

export async function getSnapshotAfterTs(caseId: string, ts: number): Promise<Snapshot | null> {
  // Get the first snapshot after the given timestamp using score-based range.
  // Devvit Redis zRange with numeric start/stop and sorted set uses scores.
  // Fetch all snapshots (by rank) then filter by timestamp.
  const allEntries = await redis.zRange(keys.snapshotIndex(caseId), 0, -1);
  if (allEntries.length === 0) return null;

  // Find the first snapshot with ts >= given ts
  for (const entry of allEntries) {
    const snapTs = Number(entry.member);
    if (snapTs >= ts) {
      const raw = await redis.get(keys.snapshot(caseId, snapTs));
      return raw ? (JSON.parse(raw) as Snapshot) : null;
    }
  }

  return null;
}

// ─── Score Operations ────────────────────────────────────────────────────────

export async function saveScore(score: ScoreBreakdown): Promise<void> {
  await redis.set(keys.score(score.caseId, score.userId), JSON.stringify(score));

  // Add to case leaderboard
  await redis.zAdd(keys.caseLeaderboard(score.caseId), {
    member: score.userId,
    score: score.total,
  });
}

export async function getScore(caseId: string, userId: string): Promise<ScoreBreakdown | null> {
  const raw = await redis.get(keys.score(caseId, userId));
  return raw ? (JSON.parse(raw) as ScoreBreakdown) : null;
}

export async function addToWeeklyLeaderboard(
  subId: string,
  weekKey: string,
  userId: string,
  points: number
): Promise<void> {
  const lbKey = keys.weeklyLeaderboard(subId, weekKey);
  const existing = await redis.zScore(lbKey, userId);
  const newScore = (existing !== undefined && existing !== null ? Number(existing) : 0) + points;
  await redis.zAdd(lbKey, { member: userId, score: newScore });
}

// ─── Leaderboard Operations ─────────────────────────────────────────────────

export async function getCaseLeaderboard(
  caseId: string,
  limit: number = 10
): Promise<{ member: string; score: number }[]> {
  return redis.zRange(keys.caseLeaderboard(caseId), 0, limit - 1);
}

export async function getWeeklyLeaderboard(
  subId: string,
  weekKey: string,
  limit: number = 10
): Promise<{ member: string; score: number }[]> {
  return redis.zRange(keys.weeklyLeaderboard(subId, weekKey), 0, limit - 1);
}

export async function getCaseLeaderboardSize(caseId: string): Promise<number> {
  return Number(await redis.zCard(keys.caseLeaderboard(caseId)));
}

export async function getUserRank(
  caseId: string,
  userId: string
): Promise<number | null> {
  const rank = await redis.zRank(keys.caseLeaderboard(caseId), userId);
  if (rank === null || rank === undefined) return null;
  const total = Number(await redis.zCard(keys.caseLeaderboard(caseId)));
  return total - 1 - Number(rank); // Convert ascending rank to descending
}

// ─── Streak Operations ───────────────────────────────────────────────────────

export async function getStreak(subId: string, userId: string): Promise<Streak> {
  const raw = await redis.get(keys.streak(subId, userId));
  if (raw) return JSON.parse(raw) as Streak;
  return { current: 0, best: 0, lastPlayedDate: '' };
}

export async function updateStreak(
  subId: string,
  userId: string,
  dateKey: string
): Promise<Streak> {
  const streak = await getStreak(subId, userId);

  if (streak.lastPlayedDate === dateKey) {
    return streak; // Already counted today
  }

  const yesterday = getPreviousDateKey(dateKey);

  if (streak.lastPlayedDate === yesterday) {
    // Consecutive day
    streak.current++;
  } else {
    // Streak broken, restart
    streak.current = 1;
  }

  streak.best = Math.max(streak.best, streak.current);
  streak.lastPlayedDate = dateKey;

  await redis.set(keys.streak(subId, userId), JSON.stringify(streak));
  return streak;
}

// ─── Submission Operations ───────────────────────────────────────────────────

export async function saveSubmission(sub: CaseSubmission): Promise<void> {
  await redis.set(keys.submission(sub.submissionId), JSON.stringify(sub));
  if (sub.status === 'pending') {
    await redis.zAdd(keys.pendingSubmissions(sub.subId), {
      member: sub.submissionId,
      score: sub.submittedAt,
    });
  }
}

export async function getSubmission(submissionId: string): Promise<CaseSubmission | null> {
  const raw = await redis.get(keys.submission(submissionId));
  return raw ? (JSON.parse(raw) as CaseSubmission) : null;
}

export async function getPendingSubmissions(subId: string): Promise<CaseSubmission[]> {
  const entries = await redis.zRange(keys.pendingSubmissions(subId), 0, -1);
  const submissions: CaseSubmission[] = [];

  for (const entry of entries) {
    const sub = await getSubmission(entry.member);
    if (sub && sub.status === 'pending') {
      submissions.push(sub);
    }
  }

  return submissions;
}

export async function approveSubmission(
  submissionId: string,
  dateKey: string,
  reviewedBy: string
): Promise<CaseSubmission | null> {
  const sub = await getSubmission(submissionId);
  if (!sub || sub.status !== 'pending') return null;

  sub.status = 'approved';
  sub.assignedDate = dateKey;
  sub.reviewedAt = Date.now();
  sub.reviewedBy = reviewedBy;

  await redis.set(keys.submission(submissionId), JSON.stringify(sub));
  await redis.zRem(keys.pendingSubmissions(sub.subId), [submissionId]);
  await redis.set(keys.approvedDate(sub.subId, dateKey), submissionId);

  return sub;
}

export async function rejectSubmission(
  submissionId: string,
  reason: string,
  reviewedBy: string
): Promise<CaseSubmission | null> {
  const sub = await getSubmission(submissionId);
  if (!sub || sub.status !== 'pending') return null;

  sub.status = 'rejected';
  sub.rejectReason = reason;
  sub.reviewedAt = Date.now();
  sub.reviewedBy = reviewedBy;

  await redis.set(keys.submission(submissionId), JSON.stringify(sub));
  await redis.zRem(keys.pendingSubmissions(sub.subId), [submissionId]);

  return sub;
}

export async function getUserSubmissionCount(
  subId: string,
  userId: string,
  dateKey: string
): Promise<number> {
  const raw = await redis.get(keys.userSubmissionCount(subId, userId, dateKey));
  return raw ? parseInt(raw, 10) : 0;
}

export async function incrementUserSubmissionCount(
  subId: string,
  userId: string,
  dateKey: string
): Promise<void> {
  const count = await getUserSubmissionCount(subId, userId, dateKey);
  await redis.set(keys.userSubmissionCount(subId, userId, dateKey), String(count + 1));
}

export async function getApprovedSubmissionForDate(
  subId: string,
  dateKey: string
): Promise<CaseSubmission | null> {
  const submissionId = await redis.get(keys.approvedDate(subId, dateKey));
  if (!submissionId) return null;
  return getSubmission(submissionId);
}

// ─── Username Cache ──────────────────────────────────────────────────────────

export async function cacheUsername(userId: string, username: string): Promise<void> {
  await redis.set(keys.usernameCache(userId), username);
}

export async function getCachedUsername(userId: string): Promise<string> {
  const cached = await redis.get(keys.usernameCache(userId));
  return cached ?? 'anonymous';
}

// ─── Recent Cases (for archive) ──────────────────────────────────────────────

export async function getRecentCaseDates(subId: string, days: number): Promise<string[]> {
  const entries = await redis.zRange(keys.allCaseDates(subId), 0, -1);
  // Return most recent dates
  return entries
    .map((e) => e.member)
    .reverse()
    .slice(0, days);
}

// ─── Date Utilities ──────────────────────────────────────────────────────────

export function getTodayDateKey(): string {
  const now = new Date();
  return formatDateKey(now);
}

export function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

export function getWeekKey(d: Date): string {
  const y = d.getFullYear();
  const start = new Date(y, 0, 1);
  const diff = d.getTime() - start.getTime();
  const week = Math.ceil((diff / 86400000 + start.getDay() + 1) / 7);
  return `${y}-W${String(week).padStart(2, '0')}`;
}

function getPreviousDateKey(dateKey: string): string {
  const y = parseInt(dateKey.slice(0, 4), 10);
  const m = parseInt(dateKey.slice(4, 6), 10) - 1;
  const d = parseInt(dateKey.slice(6, 8), 10);
  const date = new Date(y, m, d);
  date.setDate(date.getDate() - 1);
  return formatDateKey(date);
}

export function dateKeyToDate(dateKey: string): Date {
  const y = parseInt(dateKey.slice(0, 4), 10);
  const m = parseInt(dateKey.slice(4, 6), 10) - 1;
  const d = parseInt(dateKey.slice(6, 8), 10);
  return new Date(y, m, d);
}
