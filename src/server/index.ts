import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createServer, getServerPort } from '@devvit/web/server';
import { api } from './routes/api';
import { forms } from './routes/forms';
import { menu } from './routes/menu';
import { triggers } from './routes/triggers';
import { scheduler } from './routes/scheduler';

const app = new Hono();
const internal = new Hono();

// Internal routes (menu, forms, triggers, scheduler)
internal.route('/menu', menu);
internal.route('/form', forms);
internal.route('/triggers', triggers);
internal.route('/scheduler', scheduler);

// Public API routes
app.route('/api', api);
app.route('/internal', internal);

// Health check endpoint
app.get('/health', (c) => c.json({ status: 'ok', app: 'daily-verdict' }));

// 404 handler for unknown routes
app.notFound((c) => {
  return c.json({ error: 'Not found', path: c.req.path }, 404);
});

// Global error handler
app.onError((err, c) => {
  console.error('Unhandled server error:', err);
  return c.json(
    { error: 'Internal server error', message: err instanceof Error ? err.message : 'Unknown error' },
    500
  );
});

serve({
  fetch: app.fetch,
  createServer,
  port: getServerPort(),
});
