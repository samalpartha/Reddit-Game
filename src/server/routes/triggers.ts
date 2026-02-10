import { Hono } from 'hono';
import type { OnAppInstallRequest, TriggerResponse } from '@devvit/web/shared';
import { context } from '@devvit/web/server';
import { createDailyPost } from '../core/post';

export const triggers = new Hono();

triggers.post('/on-app-install', async (c) => {
  // Parse the trigger input first
  let input: OnAppInstallRequest | null = null;
  try {
    input = await c.req.json<OnAppInstallRequest>();
  } catch {
    // Trigger body may be empty or malformed; that's ok
  }

  try {
    const post = await createDailyPost();

    const triggerInfo = input?.type ? `, trigger: ${input.type}` : '';
    return c.json<TriggerResponse>(
      {
        status: 'success',
        message: `Daily Verdict installed! First post created in r/${context.subredditName ?? 'unknown'} (post: ${post.id}${triggerInfo})`,
      },
      200
    );
  } catch (error) {
    console.error('Error creating initial Daily Verdict post:', error);
    return c.json<TriggerResponse>(
      {
        status: 'error',
        message: 'Failed to create initial post. Use the "Create Daily Verdict Post" menu item.',
      },
      400
    );
  }
});
