import { reddit, context } from '@devvit/web/server';
import { getTodayDateKey, getCaseByDate, updateCasePostId, saveCase } from '../services/redis';
import { getSeedCaseForDate } from '../data/seed-cases';
import { CASE_OPEN_HOURS, REVEAL_DELAY_HOURS } from '../../shared/types';

/**
 * Create a Daily Verdict post for today's case.
 */
export async function createDailyPost(): Promise<{ id: string }> {
  const subId = context.subredditName;
  if (!subId) {
    throw new Error('Cannot create post: missing subreddit context');
  }
  const dateKey = getTodayDateKey();

  // Ensure case exists
  let caseData = await getCaseByDate(subId, dateKey);

  if (!caseData) {
    const seed = getSeedCaseForDate(dateKey);
    const now = Date.now();
    const caseId = `${subId}-${dateKey}`;

    caseData = {
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

    await saveCase(caseData);
  }

  // Format date for title
  const d = new Date();
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const dateStr = `${months[d.getMonth()]} ${d.getDate()}`;

  const post = await reddit.submitCustomPost({
    title: `Daily Verdict ${dateStr}: ${caseData.title}`,
  });

  // Link case to post
  await updateCasePostId(caseData.caseId, post.id);

  return post;
}

