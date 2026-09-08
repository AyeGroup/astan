import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyEvent, getStep, progress, reconcileWithPage, startWorkflow, stepGuidance, toView } from '../src/workflow-engine/index.js';
import { ctx, TARGETS } from './helpers.js';

test('walks the full VIEW_NOTIFICATION happy path', () => {
  let state = startWorkflow('VIEW_NOTIFICATION', true);
  assert.equal(state.current_step, 'START');

  state = applyEvent(state, 'LOGIN_PAGE_OPENED');
  assert.equal(state.current_step, 'LOGIN');

  state = applyEvent(state, 'LOGIN_SUCCESS');
  assert.equal(state.current_step, 'OTP_VERIFICATION');

  state = applyEvent(state, 'OTP_VERIFIED');
  assert.equal(state.current_step, 'AUTHENTICATED');

  state = applyEvent(state, 'NOTIFICATION_LIST_LOADED');
  assert.equal(state.current_step, 'NOTIFICATION_LIST');

  state = applyEvent(state, 'NOTIFICATION_OPENED');
  assert.equal(state.current_step, 'NOTIFICATION_DETAIL');

  state = applyEvent(state, 'DOWNLOAD_STARTED');
  assert.equal(state.current_step, 'DOWNLOAD_OR_VIEW');

  state = applyEvent(state, 'DOWNLOAD_COMPLETED');
  assert.equal(state.current_step, 'COMPLETED');
  assert.equal(state.completed, true);
});

test('ignores an event that is not declared on the current step', () => {
  let state = startWorkflow('VIEW_NOTIFICATION', true);
  state = applyEvent(state, 'LOGIN_PAGE_OPENED');
  const before = state.current_step;
  state = applyEvent(state, 'DOWNLOAD_COMPLETED');
  assert.equal(state.current_step, before, 'a stray event must not teleport the user');
});

test('counts consecutive failures and resets them on progress', () => {
  let state = startWorkflow('VIEW_NOTIFICATION', true);
  state = applyEvent(state, 'LOGIN_PAGE_OPENED');
  state = applyEvent(state, 'LOGIN_SUCCESS');
  state = applyEvent(state, 'OTP_FAILED');
  state = applyEvent(state, 'OTP_FAILED');
  assert.equal(state.failure_count, 2);
  state = applyEvent(state, 'OTP_VERIFIED');
  assert.equal(state.failure_count, 0);
});

test('reconciles the step when the page contradicts recorded state', () => {
  let state = startWorkflow('VIEW_NOTIFICATION', true);
  state = applyEvent(state, 'LOGIN_PAGE_OPENED');
  state = applyEvent(state, 'LOGIN_SUCCESS');
  assert.equal(state.current_step, 'OTP_VERIFICATION');

  // The user hit "back" — the page is ground truth, not our record.
  state = reconcileWithPage(state, ctx('PAGE_LOGIN', TARGETS.login!));
  assert.equal(state.current_step, 'LOGIN');
});

test('reports «مرحله n از m» over the visible steps only', () => {
  let state = startWorkflow('VIEW_NOTIFICATION', true);
  assert.deepEqual(progress(state), { position: 0, total: 5 });
  state = applyEvent(state, 'LOGIN_PAGE_OPENED');
  assert.deepEqual(progress(state), { position: 1, total: 5 });
  state = applyEvent(state, 'LOGIN_SUCCESS');
  assert.deepEqual(progress(state), { position: 2, total: 5 });
});

test('guidance points at the step primary target when it is on the page', () => {
  let state = startWorkflow('VIEW_NOTIFICATION', true);
  state = applyEvent(state, 'LOGIN_PAGE_OPENED');
  const guidance = stepGuidance(state, ctx('PAGE_LOGIN', TARGETS.login!));
  assert.ok(guidance);
  const highlight = guidance!.suggested_actions.find((a) => a.type === 'highlight_element');
  assert.ok(highlight && 'target' in highlight && highlight.target === 'login_form');
});

test('guidance navigates instead of pointing when the user is on the wrong page', () => {
  let state = startWorkflow('VIEW_NOTIFICATION', true);
  state = applyEvent(state, 'LOGIN_PAGE_OPENED');
  const guidance = stepGuidance(state, ctx('PAGE_HOME', TARGETS.home!));
  const navigate = guidance!.suggested_actions.find((a) => a.type === 'navigate');
  assert.ok(navigate && 'route' in navigate && navigate.route === '/login');
});

test('the view exposes step titles for the widget', () => {
  let state = startWorkflow('VIEW_NOTIFICATION', true);
  state = applyEvent(state, 'LOGIN_PAGE_OPENED');
  const view = toView(state);
  assert.equal(view.workflow_title, 'مشاهده ابلاغیه');
  assert.equal(view.step_title, getStep(state)!.title);
  assert.equal(view.next_step, 'OTP_VERIFICATION');
});
