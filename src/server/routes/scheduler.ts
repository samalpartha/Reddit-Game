import { Hono } from 'hono';
import { context } from '@devvit/web/server';
import { createDailyPost } from '../core/post';
import {
  getOpenCases,
  getCase,
  takeSnapshot,
  updateCaseStatus,
  getAggregate,
  getCaseByDate,
  getTodayDateKey,
  getApprovedSubmissionForDate,
  saveCase,
  formatCycleKey,
} from '../services/redis';
import { computeUserScore, computeMajority } from '../services/scoring';
import { CASE_OPEN_HOURS, REVEAL_DELAY_HOURS, CYCLE_HOURS, DEFAULT_LABELS, REVEAL_SCAN_DAYS } from '../../shared/types';
import { getSeedCaseForDate } from '../data/seed-cases';
import type { Case } from '../../shared/types';

export const scheduler = new Hono();

// ─── POST /internal/scheduler/daily-post ─────────────────────────────────────
// Creates the current round's case and post. Runs every 2 hours.

scheduler.post('/daily-post', async (c) => {
  try {
    const subId = context.subredditName;
    if (!subId) {
      return c.json({ status: 'error', message: 'Missing subreddit context' }, 400);
    }
    const dateKey = getTodayDateKey();

    // Check if a post already exists for today
    const existing = await getCaseByDate(subId, dateKey);
    if (existing?.postId) {
      return c.json({
        status: 'skipped',
        message: `Post already exists for ${dateKey}`,
      });
    }

    // Check for approved user submission for today
    const approvedSub = await getApprovedSubmissionForDate(subId, dateKey);
    const now = Date.now();

    if (approvedSub) {
      // Prefer approved UGC submission over any auto-created seed case
      const caseId = existing?.caseId ?? `${subId}-${dateKey}`;
      const caseData: Case = {
        caseId,
        subId,
        dateKey,
        title: approvedSub.title ?? 'Community Case',
        text: approvedSub.text,
        labels: approvedSub.labelsOverride ?? DEFAULT_LABELS,
        openTs: now,
        closeTs: now + CASE_OPEN_HOURS * 60 * 60 * 1000,
        revealTs: now + (CASE_OPEN_HOURS + REVEAL_DELAY_HOURS) * 60 * 60 * 1000,
        status: 'open',
        source: 'user',
        createdBy: approvedSub.userId,
      };
      await saveCase(caseData);
    }

    // Create the Reddit post
    const post = await createDailyPost();

    return c.json({
      status: 'success',
      message: `Daily post created for ${dateKey}`,
      postId: post.id,
    });
  } catch (error) {
    console.error('Scheduler daily-post error:', error);
    return c.json({ status: 'error', message: String(error) }, 500);
  }
});

// ─── POST /internal/scheduler/snapshots ──────────────────────────────────────
// Takes vote distribution snapshots for all open cases. Runs every 10 minutes.

scheduler.post('/snapshots', async (c) => {
  try {
    const openCaseIds = await getOpenCases();
    let snapshotCount = 0;

    for (const caseId of openCaseIds) {
      const caseData = await getCase(caseId);
      if (!caseData) continue;

      // Only snapshot open cases
      if (caseData.status === 'open' && Date.now() < caseData.closeTs) {
        await takeSnapshot(caseId);
        snapshotCount++;
      }
    }

    return c.json({
      status: 'success',
      message: `Took ${snapshotCount} snapshots`,
    });
  } catch (error) {
    console.error('Scheduler snapshots error:', error);
    return c.json({ status: 'error', message: String(error) }, 500);
  }
});

// ─── POST /internal/scheduler/close ──────────────────────────────────────────
// Closes cases whose voting window has ended. Runs every 5 minutes.

scheduler.post('/close', async (c) => {
  try {
    const openCaseIds = await getOpenCases();
    const now = Date.now();
    let closedCount = 0;

    for (const caseId of openCaseIds) {
      const caseData = await getCase(caseId);
      if (!caseData) continue;

      if (caseData.status === 'open' && now >= caseData.closeTs) {
        await updateCaseStatus(caseId, 'closed');
        // Take a final snapshot
        await takeSnapshot(caseId);
        closedCount++;
      }
    }

    return c.json({
      status: 'success',
      message: `Closed ${closedCount} cases`,
    });
  } catch (error) {
    console.error('Scheduler close error:', error);
    return c.json({ status: 'error', message: String(error) }, 500);
  }
});

// ─── POST /internal/scheduler/reveal ─────────────────────────────────────────
// Reveals cases whose reveal time has passed. Runs every 5 minutes.

scheduler.post('/reveal', async (c) => {
  try {
    // We need to check closed cases. Since we removed them from open set,
    // we'll check based on today and recent dates.
    const subId = context.subredditName;
    if (!subId) {
      return c.json({ status: 'error', message: 'Missing subreddit context' }, 400);
    }
    const now = Date.now();
    let revealedCount = 0;

    // Check recent cycles for potential reveals (scan last 36 cycles = 3 days worth)
    const cyclesToScan = REVEAL_SCAN_DAYS * Math.ceil(24 / CYCLE_HOURS);
    for (let cyclesAgo = 0; cyclesAgo < cyclesToScan; cyclesAgo++) {
      const d = new Date(now - cyclesAgo * CYCLE_HOURS * 3600000);
      const cycleKey = formatCycleKey(d);

      const caseData = await getCaseByDate(subId, cycleKey);
      if (!caseData) continue;

      if (caseData.status === 'closed' && now >= caseData.revealTs) {
        await updateCaseStatus(caseData.caseId, 'revealed');
        revealedCount++;
      }
    }

    return c.json({
      status: 'success',
      message: `Revealed ${revealedCount} cases`,
    });
  } catch (error) {
    console.error('Scheduler reveal error:', error);
    return c.json({ status: 'error', message: String(error) }, 500);
  }
});
