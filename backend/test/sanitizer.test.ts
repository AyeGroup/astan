import assert from 'node:assert/strict';
import { test } from 'node:test';
import { containsCredentials, normalizeDigits, sanitizeUserText } from '../src/policy-engine/sanitizer.js';

test('normalises Persian and Arabic digits', () => {
  assert.equal(normalizeDigits('۰۹۱۲۳۴۵۶۷۸۹'), '09123456789');
  assert.equal(normalizeDigits('٠١٢٣'), '0123');
});

test('masks an Iranian mobile number but keeps its shape', () => {
  const { text, redactions } = sanitizeUserText('شماره من 09123456789 است');
  assert.match(text, /09\*{6}6789/);
  assert.ok(redactions.includes('mobile'));
});

test('masks a Persian-digit mobile number too', () => {
  const { text } = sanitizeUserText('شماره‌ام ۰۹۱۲۳۴۵۶۷۸۹');
  assert.ok(!text.includes('09123456789'));
});

test('drops an OTP the user pasted into the chat', () => {
  const { text, redactions } = sanitizeUserText('رمز من 84213 است');
  assert.ok(!text.includes('84213'));
  assert.ok(redactions.includes('otp'));
  assert.ok(containsCredentials(redactions));
});

test('masks a national ID', () => {
  const { text, redactions } = sanitizeUserText('کد ملی 0079542211');
  assert.ok(!text.includes('0079542211'));
  assert.ok(redactions.includes('national_id'));
});

test('masks a bank card number', () => {
  const { redactions } = sanitizeUserText('کارت 6037-9911-2233-4455');
  assert.ok(redactions.includes('bank_card'));
});

test('strips a session token', () => {
  const { text, redactions } = sanitizeUserText('توکن eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abcdef');
  assert.ok(!text.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abcdef'));
  assert.ok(redactions.includes('token'));
});

test('leaves an ordinary question untouched', () => {
  const { text, redactions } = sanitizeUserText('ابلاغیه‌ام را چطور ببینم؟');
  assert.equal(text, 'ابلاغیه‌ام را چطور ببینم؟');
  assert.equal(redactions.length, 0);
});
