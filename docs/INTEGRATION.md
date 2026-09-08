# راهنمای اتصال سایت به دستیار

اتصال یک صفحه به دستیار سه کار دارد: **اعلام صفحه**، **Tag کردن عناصر**،
**انتشار رویداد**. سایت هرگز به دستیار نمی‌گوید چه بگوید.

## ۱. افزودن SDK

```html
<script src="https://assistant.example.ir/sdk/assistant-sdk.js"></script>
<script>
  AssistantSDK.init({
    apiBase: 'https://assistant.example.ir',
    pageId: 'PAGE_LOGIN',

    // مسیریابی دست خود سایت است؛ دستیار فقط درخواست می‌دهد.
    onNavigate: function (route) { router.push(route); },

    // عملیات ممتاز: سایت تصمیم می‌گیرد، دستیار فقط نتیجه را می‌گوید.
    onOperationRequest: function (operation) {
      if (operation === 'RESEND_OTP') return otpService.resend();  // boolean
      return false;
    },

    onHumanSupport: function () { router.push('/support'); }
  });
</script>
```

## ۲. Tag کردن عناصر

```html
<form data-assistant-target="login_form">
  <input data-assistant-target="login_national_id" />
  <button data-assistant-target="login_submit">مرحله بعد</button>
</form>
```

فهرست معتبر در `shared/contracts/src/actions.ts` → `ACTION_TARGETS`.

**عناصری که نباید Tag شوند:** ورودی رمز عبور، ورودی رمز موقت، هر فیلدی که
مقدار حساس می‌گیرد. SDK هم `type="password"` و `type="hidden"` را رد می‌کند،
اما بهترین کار Tag نکردن آن‌هاست.

## ۳. اعلام تغییر صفحه

```js
AssistantSDK.setPage('PAGE_OTP');
```

در SPA، این را در Hook مسیریاب صدا بزنید. در سایت چندصفحه‌ای، `pageId` را در
`init` بدهید.

## ۴. انتشار رویداد

```js
AssistantSDK.emit('LOGIN_SUCCESS');
AssistantSDK.emit({ type: 'NOTIFICATION_LIST_LOADED', meta: { count: 2 } });
```

فهرست کامل در `shared/contracts/src/events.ts`.

`meta` فقط عدد، بولین یا رشته کوتاه می‌پذیرد — هرگز مقدار فرم یا داده هویتی.

## ۵. گزارش خطا

```js
AssistantSDK.reportError('INVALID_OTP');
AssistantSDK.reportError(null);   // خطا برطرف شد
```

فقط **کد** خطا ارسال می‌شود، نه پیام خطای سرور و نه ورودی کاربر.

## ۶. چک‌لیست امنیتی برای تیم Front-end

- [ ] هیچ ورودی حساسی `data-assistant-target` ندارد.
- [ ] هیچ مقدار فرمی در `meta` رویدادها نیست.
- [ ] `onOperationRequest` قواعد خود سایت (Rate limit، مجوز) را اعمال می‌کند.
- [ ] `onNavigate` فقط مسیرهای داخلی را می‌پذیرد.
- [ ] `ALLOWED_ORIGINS` در Backend روی دامنه واقعی تنظیم شده، نه `*`.

## ۷. تعریف یک Workflow تازه

1. یک فایل در `backend/src/workflow-engine/definitions/` بسازید.
2. Targetهای تازه را به `ACTION_TARGETS` اضافه کنید.
3. رویدادهای تازه را به `SYSTEM_EVENTS` اضافه کنید.
4. Workflow را در `workflow-engine/index.ts` ثبت کنید.
5. مقالات مرتبط را به Knowledge Base اضافه کنید.

نه SDK تغییر می‌کند، نه قرارداد Action، نه Policy Engine.
