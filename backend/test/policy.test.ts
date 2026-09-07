import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allowedTargets, enforce, shouldOfferHumanHandoff } from '../src/policy-engine/index.js';
import { applyEvent, startWorkflow } from '../src/workflow-engine/index.js';
import { ctx, TARGETS } from './helpers.js';

function atOtp() {
  let state = startWorkflow('VIEW_NOTIFICATION', true);
  state = applyEvent(state, 'LOGIN_PAGE_OPENED');
  state = applyEvent(state, 'LOGIN_SUCCESS');
  return state;
}

test('allowed targets are step policy ∩ what the page rendered', () => {
  const state = atOtp();
  // The page did not render a resend button this time.
  const targets = allowedTargets(state, ctx('PAGE_OTP', ['otp_form', 'otp_input', 'otp_submit']));
  assert.ok(targets.includes('otp_input'));
  assert.ok(!targets.includes('otp_resend'));
});

test('rejects a target that is not allowed on the current step', () => {
  const state = atOtp();
  const decision = enforce({
    actions: [{ type: 'highlight_element', target: 'login_password' }],
    state,
    context: ctx('PAGE_OTP', [...TARGETS.otp!, 'login_password']),
  });
  assert.equal(decision.allowed.length, 0);
  assert.equal(decision.rejected.length, 1);
});

test('rejects an action shape that is not in the whitelist at all', () => {
  const state = atOtp();
  const decision = enforce({
    actions: [
      { type: 'execute_javascript', code: 'alert(1)' },
      { type: 'read_field', target: 'otp_input' },
      { type: 'navigate', route: 'https://evil.example.com' },
    ],
    state,
    context: ctx('PAGE_OTP', TARGETS.otp!),
  });
  assert.equal(decision.allowed.length, 0, 'no arbitrary action may survive the policy engine');
  assert.equal(decision.rejected.length, 3);
});

test('forces confirmation on a privileged operation even if the model waives it', () => {
  const state = atOtp();
  const decision = enforce({
    actions: [{ type: 'request_operation', operation: 'RESEND_OTP', requires_confirmation: false }],
    state,
    context: ctx('PAGE_OTP', TARGETS.otp!),
  });
  assert.equal(decision.allowed.length, 1);
  const action = decision.allowed[0]!;
  assert.ok(action.type === 'request_operation' && action.requires_confirmation === true);
});

test('rejects RESEND_OTP outside the OTP step', () => {
  const state = startWorkflow('VIEW_NOTIFICATION', true);
  const decision = enforce({
    actions: [{ type: 'request_operation', operation: 'RESEND_OTP', requires_confirmation: true }],
    state,
    context: ctx('PAGE_HOME', TARGETS.home!),
  });
  assert.equal(decision.allowed.length, 0);
});

test('rejects navigation to the page the user is already on', () => {
  const state = atOtp();
  const decision = enforce({
    actions: [{ type: 'navigate', route: '/otp' }],
    state,
    context: ctx('PAGE_OTP', TARGETS.otp!),
  });
  assert.equal(decision.allowed.length, 0);
});

test('caps the action budget at four per turn', () => {
  const state = atOtp();
  const decision = enforce({
    actions: [
      { type: 'highlight_element', target: 'otp_input' },
      { type: 'scroll_to_element', target: 'otp_input' },
      { type: 'show_tooltip', target: 'otp_submit', message: 'اینجا' },
      { type: 'show_instruction', title: 'الف', body: 'ب' },
      { type: 'offer_human_support' },
    ],
    state,
    context: ctx('PAGE_OTP', TARGETS.otp!),
  });
  assert.equal(decision.allowed.length, 4);
  assert.equal(decision.rejected.length, 1);
});

test('offers a human after three failures', () => {
  const state = { ...atOtp(), failure_count: 3 };
  assert.equal(shouldOfferHumanHandoff(state, ctx('PAGE_OTP', TARGETS.otp!)), true);
});
