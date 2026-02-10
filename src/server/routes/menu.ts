import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context } from '@devvit/web/server';
import { createDailyPost } from '../core/post';

export const menu = new Hono();

menu.post('/post-create', async (c) => {
  try {
    const post = await createDailyPost();

    return c.json<UiResponse>(
      {
        navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${post.id}`,
      },
      200
    );
  } catch (error) {
    console.error(`Error creating Daily Verdict post: ${error}`);
    return c.json<UiResponse>(
      {
        showToast: 'Failed to create Daily Verdict post',
      },
      400
    );
  }
});

menu.post('/mod-queue', async (c) => {
  try {
    // This will navigate to the subreddit where mods can see the queue
    // The actual mod queue is accessed through the game UI
    return c.json<UiResponse>(
      {
        showToast: 'Open any Daily Verdict post and tap "Mod Queue" to review submissions.',
      },
      200
    );
  } catch (error) {
    console.error(`Error: ${error}`);
    return c.json<UiResponse>(
      {
        showToast: 'Failed to open mod queue',
      },
      400
    );
  }
});
