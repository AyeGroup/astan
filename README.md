# دستیار هوشمند ایجنتیک خدمات قضایی

پیاده‌سازی کامل سند طراحی «دستیار هوشمند ایجنتیک خدمات قضایی» — یک
**پلتفرم Agentic Guidance** برای خدمات قضایی، نه یک چت‌بات تک‌صفحه‌ای.

نسخه فعلی Workflow «**مشاهده ابلاغیه**» را به‌صورت کامل پوشش می‌دهد (MVP تا Phase 2)
و معماری آن طوری است که افزودن خدمات بعدی، فقط تعریف یک State Machine تازه است.

---

## اجرای سریع

```bash
npm install
npm run build
npm start                 # http://localhost:8787
```

سپس `http://localhost:8787` را باز کنید: یک نمونه از درگاه خدمات قضایی
(درگاه → ثنا → رمز موقت → سامانه ابلاغ → فهرست → ابلاغیه → چاپ) با دستیار
یکپارچه‌شده روی آن.

**بدون کلید API هم کار می‌کند.** در این حالت Orchestrator روی موتور قاعده‌محور
اجرا می‌شود: همان راهنمایی، همان Actionها، فقط بدون بازنویسی زبانی مدل. برای
فعال‌کردن لایه LLM:

```bash
cp .env.example .env      # ANTHROPIC_API_KEY را مقداردهی کنید
npm start
```

```bash
npm test                  # ۴۷ تست: workflow، policy، sanitizer، orchestrator، acceptance
```

---

## معماری

```
                          USER
                            │
                  ┌─────────▼─────────┐
                  │  Assistant Widget │  چت / Quick Action / Guided Mode
                  └─────────┬─────────┘
                  ┌─────────▼─────────┐
                  │   Assistant SDK   │  یک <script>، بدون وابستگی
                  └────┬─────────┬────┘
        ┌──────────────▼──┐   ┌──▼─────────────────┐
        │ Page Context    │   │ Action Controller  │
        │ page / step /   │   │ highlight / scroll │
        │ present targets │   │ tooltip / navigate │
        └──────────────┬──┘   └──┬─────────────────┘
                       └────┬────┘
                    ┌───────▼────────┐
                    │  Assistant API │  /context /message /event /operation
                    └───────┬────────┘
                    ┌───────▼────────────┐
                    │ Agent Orchestrator │
                    └─┬────┬────┬─────┬──┘
          ┌───────────▼┐ ┌─▼──────┐ ┌▼───────────┐ ┌▼──────────┐
          │  Workflow  │ │ Policy │ │ Knowledge  │ │  LLM      │
          │  Engine    │ │ Engine │ │ Base       │ │  (Claude) │
          └────────────┘ └────────┘ └────────────┘ └───────────┘
```

جزئیات در [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) و راهنمای اتصال سایت در
[docs/INTEGRATION.md](docs/INTEGRATION.md).

---

## سه تصمیم معماری که همه‌چیز روی آن بنا شده است

### ۱. مدل فقط پیشنهاد می‌دهد؛ اجرا نمی‌کند

هیچ مسیری از خروجی مدل به DOM یا به API داخلی وجود ندارد. مدل یک شیء JSON
تولید می‌کند، Policy Engine آن را دوباره Parse و اعتبارسنجی می‌کند، و فقط
Actionهایی که هم در فهرست سفید مرحله‌اند و هم واقعاً روی صفحه رندر شده‌اند
اجرا می‌شوند. یک Action ساختگی مثل `execute_javascript` حتی Parse نمی‌شود،
چون در واژگان `ActionSchema` وجود ندارد.

### ۲. موتور قاعده‌محور قبل از مدل اجرا می‌شود، نه به‌جای آن

برای هر پیام، ابتدا پاسخ قاعده‌محور از روی Workflow و Knowledge Base ساخته
می‌شود، سپس به‌عنوان `BASELINE_ANSWER` به مدل داده می‌شود تا آن را روان‌تر
بنویسد. نتیجه:

- پاسخ همیشه **Grounded** است (مدل منبع تازه نمی‌سازد).
- اگر مدل در دسترس نباشد، Refuse کند یا Timeout بخورد، همان Baseline ارسال
  می‌شود. یک درگاه قضایی نباید با قطعی یک Endpoint استنتاج، لال شود.

### ۳. اطلاعات حساس اصلاً وارد مسیر نمی‌شود

Context Contract هیچ فیلدی برای مقدار فرم، توکن یا هویت ندارد؛ SDK هم اصلاً
API خواندن مقدار فیلد را ندارد. Sanitizer فقط برای متنی است که کاربر خودش در
چت می‌نویسد — جایی که واقعاً ممکن است رمز یکبارمصرف Paste کند.

---

## چه چیزی پیاده‌سازی شده است

| بخش سند | وضعیت |
|---|---|
| §2 Conversational AI / Workflow Engine / Page Context | ✅ |
| §4 فهرست سفید Action | ✅ `shared/contracts/src/actions.ts` |
| §5–7 SDK و Context Contract | ✅ `frontend/assistant-sdk` |
| §8 عدم ارسال داده حساس + Mask | ✅ `policy-engine/sanitizer.ts` |
| §9–10 State Machine و تعریف Step | ✅ `workflow-engine/definitions` |
| §11 معماری رویدادمحور | ✅ ۲۱ رویداد |
| §12 منطق Agent | ✅ `agent-orchestrator` |
| §14–15 Action System و Policy Layer | ✅ `policy-engine` |
| §16–17 UI و Guided Mode | ✅ `assistant-sdk/widget` |
| §18 تشخیص خطا با Error Code | ✅ ۱۲ کد خطا |
| §19–21 Intentها، Quick Action، «متوجه نشدم» | ✅ |
| §22–23 Context Awareness و Session | ✅ |
| §24–25 Backend API و Response Contract | ✅ |
| §26 Knowledge Base | ✅ ۹ مقاله در ۹ دسته |
| §27 System Prompt | ✅ `agent-orchestrator/system-prompt.ts` |
| §30 Human Handoff | ✅ پس از ۳ شکست یا خطای ناشناخته |
| §32–33 Analytics و KPI | ✅ `GET /assistant/analytics` |
| §40 Acceptance Criteria | ✅ تست End-to-End روی همان سناریو |
| §31 Voice | ⛔ خارج از این نسخه (اختیاری در سند) |

---

## ساختار پروژه

```
shared/contracts/     قرارداد مشترک: Action، Event، Error، Intent، Context، Workflow، API
backend/
  workflow-engine/    State Machine و تعریف Workflowها
  policy-engine/      اعتبارسنجی Action + Sanitizer داده حساس
  knowledge-base/     مقالات تأییدشده + بازیابی
  agent-orchestrator/ Intent، قواعد، System Prompt، اتصال به Claude
  routes/             Assistant API
  session/ analytics/ نشست ناشناس و سنجه‌ها
frontend/assistant-sdk/
  page-context/       تشخیص صفحه و ساخت Context امن
  action-controller/  اجرای Actionهای مجاز روی صفحه
  widget/             رابط کاربری فارسی و RTL
demo/                 نمونه درگاه خدمات قضایی برای آزمایش End-to-End
```

---

## گام بعدی (Phase 3)

معماری برای Service Agent آماده است: افزودن `request_operation`های تازه به
`REQUESTABLE_OPERATIONS`، اتصال آن‌ها به سرویس رسمی از طریق Policy Engine، و
تعریف Workflowهای جدید در `workflow-engine/definitions/`. هیچ‌کدام نیازمند
تغییر در SDK یا در قرارداد Action نیست.
