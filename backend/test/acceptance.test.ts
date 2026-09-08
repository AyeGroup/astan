import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { Server } from 'node:http';
import { createApp } from '../src/app.js';
import type { AssistantResponse, ContextResponse } from '@astan/contracts';
import { ctx, TARGETS } from './helpers.js';

/**
 * Acceptance criteria (سند §40), driven over the real HTTP API exactly as the
 * SDK drives it — page syncs, events, and messages, in the order the portal
 * emits them.
 */
let server: Server;
let base: string;
let sessionId: string;

before(async () => {
  const { app } = createApp({ apiKey: undefined, port: 0 });
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  base = `http://127.0.0.1:${port}`;
});

after(() => {
  server.close();
});

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  assert.equal(res.status, 200, `${path} returned ${res.status}`);
  return (await res.json()) as T;
}

test('the portal opens a session', async () => {
  const res = await post<{ session_id: string }>('/assistant/session', {});
  sessionId = res.session_id;
  assert.ok(sessionId.length >= 8);
});

test('user asks to see their notification → the workflow starts and the service card is highlighted', async () => {
  const res = await post<AssistantResponse>('/assistant/message', {
    session_id: sessionId,
    message: 'ابلاغیه‌ام را می‌خواهم ببینم',
    context: ctx('PAGE_HOME', TARGETS.home!),
  });
  assert.equal(res.workflow.workflow_id, 'VIEW_NOTIFICATION');
  const highlight = res.actions.find((a) => a.type === 'highlight_element');
  assert.ok(highlight && 'target' in highlight && highlight.target === 'notification_service_card');
});

test('the login page is detected and the login form is highlighted', async () => {
  const res = await post<{ workflow: AssistantResponse['workflow']; actions: AssistantResponse['actions'] }>(
    '/assistant/event',
    { session_id: sessionId, event: { type: 'LOGIN_PAGE_OPENED' }, context: ctx('PAGE_LOGIN', TARGETS.login!) },
  );
  assert.equal(res.workflow.current_step, 'LOGIN');
  assert.equal(res.workflow.position, 1);
  const highlight = res.actions.find((a) => a.type === 'highlight_element');
  assert.ok(highlight && 'target' in highlight && highlight.target === 'login_form');
});

test('a failed login is reported with an error code and answered with guidance', async () => {
  const res = await post<{ message: string | null }>('/assistant/event', {
    session_id: sessionId,
    event: { type: 'LOGIN_FAILED' },
    context: ctx('PAGE_LOGIN', TARGETS.login!, { error_code: 'INVALID_CREDENTIALS' }),
    error_code: 'INVALID_CREDENTIALS',
  });
  assert.ok(res.message);
  assert.match(res.message!, /رمز شخصی/);
});

test('after a successful login the workflow advances to the OTP step', async () => {
  const res = await post<{ workflow: AssistantResponse['workflow']; message: string | null }>('/assistant/event', {
    session_id: sessionId,
    event: { type: 'LOGIN_SUCCESS' },
    context: ctx('PAGE_OTP', TARGETS.otp!),
  });
  assert.equal(res.workflow.current_step, 'OTP_VERIFICATION');
  assert.equal(res.workflow.position, 2);
  assert.match(res.message!, /رمز موقت/);
});

test('«رمز برایم نیامده» yields the KB answer plus a confirmed resend request', async () => {
  const res = await post<AssistantResponse>('/assistant/message', {
    session_id: sessionId,
    message: 'رمز برای من ارسال نشده',
    context: ctx('PAGE_OTP', TARGETS.otp!),
  });
  assert.equal(res.intent, 'OTP_NOT_RECEIVED');
  assert.equal(res.response.grounded, true);
  const op = res.actions.find((a) => a.type === 'request_operation');
  assert.ok(op && 'requires_confirmation' in op && op.requires_confirmation === true);
});

test('the site reports the resend outcome; the assistant only relays it', async () => {
  const res = await post<{ message: string }>('/assistant/operation', {
    session_id: sessionId,
    operation: 'RESEND_OTP',
    allowed: false,
    reason: 'محدودیت زمانی ۳۰ ثانیه',
  });
  assert.match(res.message, /اجازه این کار را نداد/);
});

test('after OTP verification the user is guided to the notification tile', async () => {
  const res = await post<{ workflow: AssistantResponse['workflow']; actions: AssistantResponse['actions'] }>(
    '/assistant/event',
    { session_id: sessionId, event: { type: 'OTP_VERIFIED' }, context: ctx('PAGE_DASHBOARD', TARGETS.dashboard!) },
  );
  assert.equal(res.workflow.current_step, 'AUTHENTICATED');
  const highlight = res.actions.find((a) => a.type === 'highlight_element');
  assert.ok(highlight && 'target' in highlight && highlight.target === 'tile_new_notification');
});

test('the notification list is recognised and the first row is pointed at', async () => {
  const res = await post<{ workflow: AssistantResponse['workflow']; actions: AssistantResponse['actions'] }>(
    '/assistant/event',
    { session_id: sessionId, event: { type: 'NOTIFICATION_LIST_LOADED' }, context: ctx('PAGE_NOTIFICATION_LIST', TARGETS.list!) },
  );
  assert.equal(res.workflow.current_step, 'NOTIFICATION_LIST');
  const highlight = res.actions.find((a) => a.type === 'highlight_element');
  assert.ok(highlight && 'target' in highlight && highlight.target === 'notification_list_first_row');
});

test('opening a notification advances to the detail step', async () => {
  const res = await post<{ workflow: AssistantResponse['workflow'] }>('/assistant/event', {
    session_id: sessionId,
    event: { type: 'NOTIFICATION_OPENED' },
    context: ctx('PAGE_NOTIFICATION_DETAIL', TARGETS.detail!),
  });
  assert.equal(res.workflow.current_step, 'NOTIFICATION_DETAIL');
  assert.equal(res.workflow.position, 4);
});

test('the workflow completes after the download finishes', async () => {
  await post('/assistant/event', {
    session_id: sessionId,
    event: { type: 'DOWNLOAD_STARTED' },
    context: ctx('PAGE_NOTIFICATION_PRINT', TARGETS.print!),
  });
  const res = await post<{ workflow: AssistantResponse['workflow']; message: string | null }>('/assistant/event', {
    session_id: sessionId,
    event: { type: 'DOWNLOAD_COMPLETED' },
    context: ctx('PAGE_NOTIFICATION_PRINT', TARGETS.print!),
  });
  assert.equal(res.workflow.completed, true);
  assert.match(res.message!, /دریافت شد/);
});

test('analytics recorded the whole journey', async () => {
  const res = await fetch(`${base}/assistant/analytics`);
  const snapshot = (await res.json()) as {
    workflow: { started: Record<string, number>; completed: Record<string, number>; drop_off_rate: Record<string, number> };
    assistant: { messages: number; grounded_ratio: number };
  };
  assert.equal(snapshot.workflow.started.VIEW_NOTIFICATION, 1);
  assert.equal(snapshot.workflow.completed.VIEW_NOTIFICATION, 1);
  assert.equal(snapshot.workflow.drop_off_rate.VIEW_NOTIFICATION, 0);
  assert.ok(snapshot.assistant.messages >= 2);
  assert.equal(snapshot.assistant.grounded_ratio, 1);
});

test('context sync exposes only targets that are both step-allowed and on the page', async () => {
  const res = await post<ContextResponse>('/assistant/context', {
    session_id: sessionId,
    context: ctx('PAGE_NOTIFICATION_DETAIL', ['notification_body', 'login_password']),
  });
  assert.ok(!res.allowed_targets.includes('login_password'));
});

test('malformed requests are rejected, not guessed at', async () => {
  const res = await fetch(`${base}/assistant/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, message: '', context: {} }),
  });
  assert.equal(res.status, 400);
});
