import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';

export const forms = new Hono();

forms.post('/submit-case', async (c) => {
  // Case submission is handled through the game UI, not forms
  return c.json<UiResponse>(
    {
      showToast: 'Please submit cases through the Daily Verdict game interface.',
    },
    200
  );
});
