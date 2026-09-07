import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InMemoryAnalytics } from '../src/analytics/index.js';
import { AgentOrchestrator } from '../src/agent-orchestrator/index.js';
import { LlmClient } from '../src/agent-orchestrator/llm.js';
import { detectIntent } from '../src/agent-orchestrator/intent.js';
import { SessionStore } from '../src/session/store.js';
import { ctx, TARGETS } from './helpers.js';

/** No API key → the orchestrator runs purely on the rule engine. */
function build() {
  const sessions = new SessionStore(60_000);
  const analytics = new InMemoryAnalytics();
  const llm = new LlmClient({ apiKey: undefined, model: 'claude-opus-5', effort: 'low', timeoutMs: 1000 });
  return { sessions, analytics, orchestrator: new AgentOrchestrator(sessions, llm, analytics) };
}

test('detects intents from natural Persian phrasing', () => {
  const home = ctx('PAGE_HOME', TARGETS.home!);
  assert.equal(detectIntent('ابلاغیه‌ام را می‌خواهم ببینم', home).intent, 'VIEW_NOTIFICATION');
  assert.equal(detectIntent('رمز برای من ارسال نشده', ctx('PAGE_OTP', TARGETS.otp!)).intent, 'OTP_NOT_RECEIVED');
  assert.equal(detectIntent('متوجه نشدم', home).intent, 'SIMPLE_EXPLANATION');
  assert.equal(detectIntent('بعدش چی؟', home).intent, 'NEXT_STEP');
  assert.equal(detectIntent('می‌خواهم با پشتیبانی صحبت کنم', home).intent, 'HUMAN_SUPPORT');
});

test('routes a legal-advice request out of scope instead of answering it', () => {
  const { sessions, orchestrator } = build();
  const session = sessions.create();
  return orchestrator
    .handleMessage(session, 'نظرت درباره رای دادگاه من چیست؟', ctx('PAGE_DASHBOARD', TARGETS.dashboard!))
    .then((res) => {
      assert.equal(res.intent, 'OUT_OF_SCOPE');
      assert.match(res.response.message, /اظهارنظر نمی‌کنم/);
    });
});

test('«ابلاغیه‌ام را ببینم» starts the workflow and points at the service card', async () => {
  const { sessions, orchestrator } = build();
  const session = sessions.create();
  const res = await orchestrator.handleMessage(session, 'ابلاغیه‌ام را می‌خواهم ببینم', ctx('PAGE_HOME', TARGETS.home!));
  assert.equal(res.workflow.workflow_id, 'VIEW_NOTIFICATION');
  assert.equal(res.workflow.guided_mode, true);
  const highlight = res.actions.find((a) => a.type === 'highlight_element');
  assert.ok(highlight && 'target' in highlight && highlight.target === 'notification_service_card');
});

test('warns and redacts when a user pastes their OTP into the chat', async () => {
  const { sessions, orchestrator, analytics } = build();
  const session = sessions.create();
  const res = await orchestrator.handleMessage(session, 'رمز من 84213 است، حالا چه کار کنم؟', ctx('PAGE_OTP', TARGETS.otp!));
  assert.match(res.response.message, /نیست رمز|لازم نیست/);
  assert.ok(!res.response.message.includes('84213'));
  assert.ok((analytics.snapshot().ux.redactions.otp ?? 0) > 0);
});

test('«متوجه نشدم» restates the last instruction more simply and highlights it', async () => {
  const { sessions, orchestrator } = build();
  const session = sessions.create();
  await orchestrator.handleMessage(session, 'ابلاغیه‌ام را ببینم', ctx('PAGE_HOME', TARGETS.home!));
  orchestrator.handleEvent(session, { type: 'LOGIN_PAGE_OPENED' }, ctx('PAGE_LOGIN', TARGETS.login!), null);
  const res = await orchestrator.handleMessage(session, 'متوجه نشدم', ctx('PAGE_LOGIN', TARGETS.login!));
  assert.equal(res.intent, 'SIMPLE_EXPLANATION');
  assert.match(res.response.message, /شماره ملی/);
  assert.ok(res.actions.some((a) => a.type === 'highlight_element'));
});

test('answers «بعدش چی؟» from the page the user is on', async () => {
  const { sessions, orchestrator } = build();
  const session = sessions.create();
  await orchestrator.handleMessage(session, 'ابلاغیه‌ام را ببینم', ctx('PAGE_HOME', TARGETS.home!));
  orchestrator.handleContext(session, ctx('PAGE_NOTIFICATION_LIST', TARGETS.list!));
  const res = await orchestrator.handleMessage(session, 'بعدش چی؟', ctx('PAGE_NOTIFICATION_LIST', TARGETS.list!));
  assert.match(res.response.message, /انتخاب کنید/);
  assert.equal(res.workflow.current_step, 'NOTIFICATION_LIST');
});

test('offers a resend as a confirmed request, never as a direct action', async () => {
  const { sessions, orchestrator } = build();
  const session = sessions.create();
  await orchestrator.handleMessage(session, 'ابلاغیه‌ام را ببینم', ctx('PAGE_HOME', TARGETS.home!));
  orchestrator.handleEvent(session, { type: 'LOGIN_PAGE_OPENED' }, ctx('PAGE_LOGIN', TARGETS.login!), null);
  orchestrator.handleEvent(session, { type: 'LOGIN_SUCCESS' }, ctx('PAGE_OTP', TARGETS.otp!), null);
  const res = await orchestrator.handleMessage(session, 'رمز برای من ارسال نشده', ctx('PAGE_OTP', TARGETS.otp!));
  const op = res.actions.find((a) => a.type === 'request_operation');
  assert.ok(op && 'operation' in op && op.operation === 'RESEND_OTP');
  assert.ok(op && 'requires_confirmation' in op && op.requires_confirmation === true);
});

test('offers a human handoff after three consecutive failures', async () => {
  const { sessions, orchestrator } = build();
  const session = sessions.create();
  await orchestrator.handleMessage(session, 'ابلاغیه‌ام را ببینم', ctx('PAGE_HOME', TARGETS.home!));
  orchestrator.handleEvent(session, { type: 'LOGIN_PAGE_OPENED' }, ctx('PAGE_LOGIN', TARGETS.login!), null);
  orchestrator.handleEvent(session, { type: 'LOGIN_SUCCESS' }, ctx('PAGE_OTP', TARGETS.otp!), null);
  for (let i = 0; i < 3; i++) {
    orchestrator.handleEvent(session, { type: 'OTP_FAILED' }, ctx('PAGE_OTP', TARGETS.otp!), 'INVALID_OTP');
  }
  const res = await orchestrator.handleMessage(session, 'باز هم نشد', ctx('PAGE_OTP', TARGETS.otp!));
  assert.equal(res.human_handoff_offered, true);
  assert.match(res.response.message, /پشتیبانی/);
});

test('every response is grounded and rule-sourced when no model is configured', async () => {
  const { sessions, orchestrator } = build();
  const session = sessions.create();
  const res = await orchestrator.handleMessage(session, 'چطور ابلاغیه را چاپ کنم؟', ctx('PAGE_NOTIFICATION_DETAIL', TARGETS.detail!));
  assert.equal(res.source, 'rules');
  assert.equal(res.response.grounded, true);
  assert.match(res.response.message, /نسخه چاپی/);
});
