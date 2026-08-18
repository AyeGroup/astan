/* ==========================================================================
   Mock corpus. Stands in for the crawler + extraction + AI pipeline so the
   whole UX can be exercised end to end without a backend.
   ========================================================================== */

export const TOPICS = [
  { id: 'ai-agents',   name: 'AI Agents',       articles: 412, sources: 24, themes: 12, momentum: 42, weight: 96 },
  { id: 'ai-reg',      name: 'AI Regulation',   articles: 268, sources: 19, themes: 8,  momentum: 31, weight: 78 },
  { id: 'llm',         name: 'LLM Research',    articles: 531, sources: 31, themes: 15, momentum: 12, weight: 64 },
  { id: 'enterprise',  name: 'Enterprise AI',   articles: 189, sources: 16, themes: 6,  momentum: 24, weight: 52 },
  { id: 'synthetic',   name: 'Synthetic Data',  articles: 74,  sources: 11, themes: 4,  momentum: 18, weight: 31 },
  { id: 'chips',       name: 'Semiconductors',  articles: 96,  sources: 13, themes: 5,  momentum: -4, weight: 22 },
];

export const INTEREST_SEEDS = [
  'AI', 'Technology', 'Business', 'Finance', 'Law',
  'Science', 'Marketing', 'Medicine', 'Climate', 'Design',
  'Security', 'Economics',
];

export const SOURCES = [
  {
    id: 'mit-tr', name: 'MIT Technology Review', domain: 'technologyreview.com',
    total: 1248, relevant: 428, newThisWeek: 17, lastChecked: '2 hours ago',
    status: 'monitoring', frequency: 'Daily',
    topics: ['ai-agents', 'ai-reg', 'llm'],
    categories: [
      { name: 'AI', count: 428, tracked: true },
      { name: 'Technology', count: 387, tracked: true },
      { name: 'Business', count: 213, tracked: false },
      { name: 'Other', count: 220, tracked: false },
    ],
  },
  {
    id: 'stanford-hai', name: 'Stanford HAI', domain: 'hai.stanford.edu',
    total: 642, relevant: 231, newThisWeek: 6, lastChecked: '5 hours ago',
    status: 'monitoring', frequency: 'Daily',
    topics: ['llm', 'ai-reg'],
    categories: [
      { name: 'Research', count: 301, tracked: true },
      { name: 'Policy', count: 188, tracked: true },
      { name: 'Events', count: 153, tracked: false },
    ],
  },
  {
    id: 'ars', name: 'Ars Technica', domain: 'arstechnica.com',
    total: 3190, relevant: 512, newThisWeek: 29, lastChecked: '40 minutes ago',
    status: 'monitoring', frequency: 'Every 6 hours',
    topics: ['enterprise', 'chips'],
    categories: [
      { name: 'AI', count: 512, tracked: true },
      { name: 'Policy', count: 402, tracked: false },
      { name: 'Gadgets', count: 890, tracked: false },
    ],
  },
  {
    id: 'lawfare', name: 'Lawfare', domain: 'lawfaremedia.org',
    total: 812, relevant: 96, newThisWeek: 3, lastChecked: '1 day ago',
    status: 'paused', frequency: 'Weekly',
    topics: ['ai-reg'],
    categories: [
      { name: 'Tech Policy', count: 96, tracked: true },
      { name: 'National Security', count: 431, tracked: false },
    ],
  },
];

const P = (...xs) => xs;

export const ARTICLES = [
  {
    id: 'a1',
    title: 'Agent frameworks are converging on a shared tool protocol',
    source: 'mit-tr', author: 'Rhiannon Vale', date: '2026-08-17',
    minutes: 8, topic: 'ai-agents', relevance: 94,
    summary: 'Four of the largest agent frameworks shipped compatible tool-calling layers this quarter, ending a year of incompatible plugin formats.',
    tldr: 'Competing agent frameworks have quietly standardised how models call external tools. The practical effect is that an integration written once now runs across four runtimes. Vendor lock-in at the tool layer is weakening faster than at the model layer.',
    reasons: [
      'Matches your AI Agents topic',
      'Related to 6 articles you saved',
      'Introduces a protocol not covered in your library',
    ],
    insights: [
      { h: 'One integration, four runtimes', p: 'Tool definitions written against the shared schema were accepted unmodified by all four frameworks in the author\'s tests.' },
      { h: 'The lock-in moved up a layer', p: 'With tools portable, differentiation shifts to planning, memory and evaluation — the parts that are still proprietary.' },
      { h: 'Enterprises drove it', p: 'Procurement teams refused to fund integrations that only worked with a single vendor, which forced the alignment.' },
      { h: 'Error semantics remain unstandardised', p: 'Each runtime still reports tool failures differently, so retry logic is not yet portable.' },
    ],
    why: 'You have followed AI Agents for three months and saved six articles about tool integration. This is the first source in your library describing an actual cross-vendor schema rather than a proposal.',
    changed: 'Two articles you read in June argued that a shared tool format was unlikely before 2027. This reports it shipping, which contradicts them.',
    body: P(
      'For most of the past two years, connecting a model to an external tool meant picking a framework and accepting its dialect. A function description written for one runtime had to be rewritten — sometimes rearchitected — to run anywhere else. That cost was tolerable when agents were demos. It stopped being tolerable when they became procurement line items.',
      '## What actually shipped',
      'The change is unglamorous: a shared JSON schema for describing a tool, its parameters, and the shape of what it returns. Nothing about it is technically novel. What is novel is that four frameworks adopted it in the same quarter, each publishing a compatibility test suite alongside the release.',
      'In practice this means an integration team can write one adapter for an internal system and expose it to whichever agent runtime a business unit prefers. The teams interviewed for this piece described that as the single largest reduction in maintenance burden they have seen since adopting <span class="term" data-fa="هوش مصنوعی عامل‌محور">agentic AI</span> at all.',
      '## Where the standard stops',
      'The schema covers the happy path well and the failure path barely. When a tool times out, one runtime surfaces a structured error the model can reason about, another injects a plain string, and a third simply drops the turn. Retry and fallback logic therefore still has to be written per runtime.',
      'Evaluation is the other gap. There is no shared way to say that a tool call was correct but unhelpful, which is precisely the judgement enterprises most want to automate.',
      '> The tool layer is commoditising. The judgement layer is where the next three years of competition will happen.',
      'That framing was echoed by three of the four framework maintainers, which is itself a signal: nobody is defending the tool format as a moat any more.',
    ),
    fa: P(
      'در دو سال گذشته، اتصال یک مدل به ابزار بیرونی یعنی انتخاب یک فریم‌ورک و پذیرفتن گویش اختصاصی آن. توصیف یک تابع که برای یک اجراگر نوشته شده بود، برای اجرا در جای دیگر باید بازنویسی می‌شد. وقتی عامل‌ها فقط نمونه‌ٔ نمایشی بودند این هزینه قابل تحمل بود؛ وقتی تبدیل به قلم خرید سازمانی شدند، دیگر نبود.',
      '## آنچه واقعاً منتشر شد',
      'تغییر، ساده و بدون زرق‌وبرق است: یک اسکیمای مشترک JSON برای توصیف ابزار، پارامترها و شکل خروجی آن. از نظر فنی چیز تازه‌ای در آن نیست. آنچه تازه است اینکه چهار فریم‌ورک در یک فصل آن را پذیرفتند و هرکدام مجموعه آزمون سازگاری هم منتشر کردند.',
      'در عمل یعنی یک تیم یکپارچه‌سازی می‌تواند تنها یک آداپتور برای سامانه داخلی بنویسد و آن را در اختیار هر اجراگری که واحد کسب‌وکار ترجیح می‌دهد بگذارد.',
      '## جایی که استاندارد متوقف می‌شود',
      'اسکیما مسیر موفق را خوب پوشش می‌دهد و مسیر خطا را به‌سختی. وقتی ابزاری منقضی می‌شود، یک اجراگر خطای ساخت‌یافته می‌دهد، دیگری رشته‌ای ساده تزریق می‌کند و سومی نوبت را حذف می‌کند.',
      '> لایه ابزار در حال کالایی‌شدن است. رقابت سه سال آینده در لایه قضاوت رخ می‌دهد.',
    ),
  },
  {
    id: 'a2',
    title: 'The EU AI Act\'s first enforcement letters land on model providers',
    source: 'lawfare', author: 'Petra Nkemdirim', date: '2026-08-16',
    minutes: 11, topic: 'ai-reg', relevance: 91,
    summary: 'Regulators sent documentation requests to seven providers, focused almost entirely on training-data provenance rather than model behaviour.',
    tldr: 'Enforcement has started, and it is documentary rather than behavioural. Providers are being asked to show where training data came from, not to prove their models are safe. Compliance teams should expect records requests before capability audits.',
    reasons: [
      'Matches your AI Regulation topic',
      'From Lawfare, a source you monitor',
      'Updates a story you read three weeks ago',
    ],
    insights: [
      { h: 'Provenance first', p: 'Six of the seven letters ask primarily for dataset lineage documentation.' },
      { h: 'No capability testing yet', p: 'Regulators have not requested model access or evaluation results in this round.' },
      { h: 'Short response windows', p: 'Providers have 30 days, which several described as impractical for retrospective records.' },
      { h: 'Open-weight providers included', p: 'Publishing weights did not exempt anyone from the documentation duty.' },
    ],
    why: 'You saved four articles on the AI Act during its drafting phase. This is the first concrete enforcement action, which changes the practical timeline you were tracking.',
    changed: 'Your library assumed enforcement would begin with high-risk deployment audits. The first round targets providers instead.',
    body: P(
      'Enforcement of the AI Act began this month in the least cinematic way possible: with letters asking for paperwork. Seven providers received requests for documentation covering the provenance of training corpora, the licensing basis for included works, and the retention of filtering decisions.',
      '## Why provenance came first',
      'Documentation duties are the easiest obligations to enforce because they do not require the regulator to form a technical opinion about a model. Either the records exist or they do not. Officials involved described this as deliberate sequencing rather than a lack of ambition.',
      'The consequence for compliance teams is a reordering of work. Capability evaluations, which most large providers have invested in heavily, are not what is being asked for. Dataset lineage, which many treated as an internal engineering concern, is.',
      '## The thirty-day problem',
      'Several recipients pointed out that reconstructing provenance for corpora assembled years ago is not a records-retrieval exercise but a research project. Whether regulators accept best-effort reconstructions will set the tone for everything that follows.',
      '> The first enforcement round is a test of memory, not of safety.',
    ),
    fa: P(
      'اجرای قانون هوش مصنوعی اتحادیه اروپا این ماه به کم‌نمایش‌ترین شکل ممکن آغاز شد: با نامه‌هایی که مدارک می‌خواستند. هفت ارائه‌دهنده درخواست مستنداتی درباره خاستگاه پیکره‌های آموزشی دریافت کردند.',
      '## چرا خاستگاه داده اول آمد',
      'تکالیف مستندسازی ساده‌ترین الزام برای اجراست، چون نهاد ناظر نیازی ندارد درباره خود مدل نظر فنی بدهد. یا سوابق وجود دارد یا ندارد.',
      '## مسئله سی روز',
      'چند دریافت‌کننده گفتند بازسازی خاستگاه پیکره‌هایی که سال‌ها پیش گردآوری شده‌اند، بازیابی سوابق نیست بلکه یک پروژه پژوهشی است.',
    ),
  },
  {
    id: 'a3',
    title: 'Enterprise AI budgets shift from pilots to platform work',
    source: 'ars', author: 'Dominic Ashby', date: '2026-08-15',
    minutes: 6, topic: 'enterprise', relevance: 87,
    summary: 'A survey of 340 firms shows spending moving away from isolated proofs of concept toward shared infrastructure: evaluation, observability and access control.',
    tldr: 'The pilot phase is ending. Budget is moving to the unglamorous shared layer — evals, observability, permissions — which suggests organisations now expect to run many models rather than choose one.',
    reasons: [
      'Matches your Enterprise AI topic',
      'Similar to 3 articles you read this month',
      'Contains survey data your library lacks',
    ],
    insights: [
      { h: 'Platform over pilot', p: 'Shared infrastructure took 54% of new AI budget, up from 21% a year earlier.' },
      { h: 'Evaluation is the top line item', p: 'Firms report evaluation tooling as the single largest new spend category.' },
      { h: 'Multi-model is the default assumption', p: 'Only 12% of respondents expect to standardise on one provider.' },
    ],
    why: 'You read three articles about AI procurement this month. This one is the only source in your library with primary survey data rather than commentary.',
    changed: 'No significant change detected against your existing library.',
    body: P(
      'The survey covers 340 firms with more than 1,000 employees, and its headline is a budget reallocation rather than a budget increase. Total AI spend grew modestly. What changed sharply is where it goes.',
      '## From proofs to plumbing',
      'A year ago, most new spending funded discrete pilots owned by individual business units. This year, the majority funds shared services: evaluation harnesses, request logging, cost attribution and access control.',
      'That shift implies a belief about the future that is worth naming. Organisations are not building toward a single chosen model. They are building toward a portfolio they expect to keep swapping.',
      '## What is being cut',
      'Bespoke fine-tuning fell hardest. Respondents described it as expensive to maintain against a moving base model, and increasingly replaceable by retrieval and better prompting.',
    ),
    fa: P(
      'این نظرسنجی ۳۴۰ شرکت با بیش از هزار کارمند را پوشش می‌دهد و تیتر آن بازتخصیص بودجه است، نه افزایش بودجه.',
      '## از نمونه اولیه تا زیرساخت',
      'یک سال پیش بیشتر هزینه‌های جدید صرف پایلوت‌های مجزا می‌شد. امسال بیشتر آن صرف سرویس‌های مشترک می‌شود: بسترهای ارزیابی، ثبت درخواست‌ها و کنترل دسترسی.',
    ),
  },
  {
    id: 'a4',
    title: 'Synthetic data quality collapses under recursive training, study finds',
    source: 'stanford-hai', author: 'Yusra Belkacem', date: '2026-08-14',
    minutes: 9, topic: 'synthetic', relevance: 83,
    summary: 'Models trained predominantly on their own outputs degrade measurably after three generations, with rare categories disappearing first.',
    tldr: 'Recursive training on synthetic output degrades models within three generations. Tail categories vanish before average metrics move, so standard benchmarks miss the damage until it is severe.',
    reasons: [
      'Matches your Synthetic Data topic',
      'Cited by an article you saved last week',
      'Contradicts an assumption in your library',
    ],
    insights: [
      { h: 'Three generations to visible damage', p: 'Aggregate benchmark scores held until the third recursive generation, then fell sharply.' },
      { h: 'Rare categories go first', p: 'Long-tail classes lost coverage in generation one while headline metrics were flat.' },
      { h: 'Mixing helps but does not fix', p: 'A 20% real-data floor slowed degradation without preventing it.' },
    ],
    why: 'An article you saved last week assumed synthetic data was a safe substitute at scale. This study measures a limit that the earlier piece did not account for.',
    changed: 'Directly qualifies the claim in "Scaling past the data wall" that you saved on 4 August.',
    body: P(
      'The study trains a family of models across five recursive generations, each generation learning predominantly from the previous generation\'s output, and measures both aggregate benchmarks and per-category coverage.',
      '## The metric that hid the damage',
      'Average benchmark performance is a poor early-warning signal. It stayed within noise for two generations while rare categories were already thinning out. By the time headline numbers moved, the tail was largely gone and could not be recovered by continued training.',
      '## Practical floor',
      'The authors tested mixtures and found that holding at least a fifth of training data as human-authored slowed collapse substantially. They are careful not to present this as a safe threshold — it is the point at which their measurements stopped showing rapid degradation, not a proof of stability.',
      '> Aggregate metrics are the last place model collapse becomes visible.',
    ),
    fa: P(
      'این پژوهش خانواده‌ای از مدل‌ها را در پنج نسل بازگشتی آموزش می‌دهد و هم معیارهای کلی و هم پوشش هر دسته را اندازه می‌گیرد.',
      '## معیاری که آسیب را پنهان کرد',
      'میانگین عملکرد سنجه‌ها هشدار زودهنگام خوبی نیست. دو نسل در محدوده نوفه ماند در حالی که دسته‌های کمیاب پیش‌تر نازک شده بودند.',
    ),
  },
  {
    id: 'a5',
    title: 'Long-context retrieval beats fine-tuning on internal document tasks',
    source: 'stanford-hai', author: 'Marcus Iwu', date: '2026-08-12',
    minutes: 7, topic: 'llm', relevance: 79,
    summary: 'Across six enterprise document benchmarks, retrieval over long contexts matched or beat parameter-efficient fine-tuning at a fraction of the maintenance cost.',
    tldr: 'Retrieval with long contexts matched fine-tuning on six internal-document benchmarks and cost far less to maintain as base models changed.',
    reasons: ['Matches your LLM Research topic', 'Related to 4 saved articles'],
    insights: [
      { h: 'Parity on accuracy', p: 'Differences fell within confidence intervals on five of six benchmarks.' },
      { h: 'Maintenance is the real gap', p: 'Fine-tuned variants required rework on each base-model upgrade; retrieval pipelines did not.' },
      { h: 'Chunking still dominates quality', p: 'Retrieval quality varied more with chunking strategy than with the model used.' },
    ],
    why: 'You have read four articles comparing retrieval and fine-tuning. This is the first with a controlled benchmark across multiple document types.',
    changed: 'No significant change detected.',
    body: P(
      'The comparison holds the base model fixed and varies only the adaptation strategy, which is rarer than it sounds — most published comparisons change both at once.',
      '## Where retrieval wins',
      'On tasks requiring citation of a specific internal document, retrieval wins outright, because the source is in context and can be quoted. Fine-tuning tends to paraphrase from memory, which is exactly the failure mode compliance teams object to.',
      '## Where fine-tuning still helps',
      'Format adherence. When output must follow a rigid internal template, fine-tuned variants complied more consistently than prompted ones.',
    ),
    fa: P(
      'این مقایسه مدل پایه را ثابت نگه می‌دارد و تنها راهبرد انطباق را تغییر می‌دهد، که کمتر از آنچه به نظر می‌رسد رایج است.',
      '## جایی که بازیابی برنده است',
      'در کارهایی که نیاز به ارجاع به سند داخلی مشخصی دارند، بازیابی آشکارا برنده است، چون منبع در بافت حاضر است و می‌توان آن را نقل کرد.',
    ),
  },
  {
    id: 'a6',
    title: 'Chip supply loosens as second-source packaging capacity comes online',
    source: 'ars', author: 'Lena Farrow', date: '2026-08-11',
    minutes: 5, topic: 'chips', relevance: 61,
    summary: 'Advanced packaging capacity outside the dominant supplier reached volume production, easing a bottleneck that had constrained accelerator shipments.',
    tldr: 'A second packaging supplier reached volume, easing the accelerator bottleneck. Lead times shortened for the first time in seven quarters.',
    reasons: ['Matches your Semiconductors topic', 'New information compared to your library'],
    insights: [
      { h: 'Lead times fell', p: 'Quoted lead times shortened by roughly six weeks quarter over quarter.' },
      { h: 'Concentration remains high', p: 'The dominant supplier still holds a large majority of qualified capacity.' },
    ],
    why: 'Semiconductors is a lower-weight topic for you, but this affects the accelerator availability discussed in two enterprise articles you saved.',
    changed: 'No significant change detected.',
    body: P(
      'Advanced packaging, not lithography, has been the binding constraint on accelerator supply for close to two years. That constraint has now loosened, though not disappeared.',
      '## What changed',
      'A second supplier qualified and reached volume production, adding meaningful capacity outside the incumbent for the first time. Buyers report shorter quoted lead times and, more tellingly, a return of negotiation over price.',
    ),
    fa: P(
      'بسته‌بندی پیشرفته — و نه لیتوگرافی — نزدیک به دو سال محدودیت اصلی عرضه شتاب‌دهنده‌ها بوده است. این محدودیت اکنون کمتر شده، هرچند از میان نرفته است.',
    ),
  },
  {
    id: 'a7',
    title: 'Evaluation harnesses are becoming the real agent moat',
    source: 'mit-tr', author: 'Rhiannon Vale', date: '2026-08-09',
    minutes: 10, topic: 'ai-agents', relevance: 88,
    summary: 'As tool interfaces standardise, the differentiating asset is the private task suite a team uses to judge whether an agent actually completed the work.',
    tldr: 'With tool formats standardising, private evaluation suites are the durable advantage. They are expensive to build, hard to copy, and improve with every production failure.',
    reasons: [
      'Matches your AI Agents topic',
      'Same author as an article you finished',
      'Extends the tool-protocol story you are following',
    ],
    insights: [
      { h: 'Evals compound', p: 'Every production failure becomes a permanent test case, so the suite improves with use.' },
      { h: 'Public benchmarks saturate', p: 'Teams reported public agent benchmarks stopped discriminating between candidates within months.' },
      { h: 'Judgement is the hard part', p: 'Deciding what counts as task completion is a product question, not an engineering one.' },
    ],
    why: 'This continues the AI Agents thread you have been following and explains the consequence of the tool-protocol convergence you read about today.',
    changed: 'Builds directly on the convergence reported in today\'s brief.',
    body: P(
      'If the tool layer commoditises, the question becomes what remains defensible. The answer emerging from teams running agents in production is unromantic: the test suite.',
      '## Why suites compound',
      'A public benchmark is static and shared. A private suite grows every time an agent fails in production, and each addition encodes a judgement about what the organisation actually wanted. Competitors cannot copy that because they did not experience those failures.',
      '## The uncomfortable part',
      'Most of the work is not engineering. It is deciding, case by case, whether a plausible-looking result was actually correct — and that requires domain experts, not infrastructure teams.',
      '> Nobody buys an evaluation suite. Everybody who is serious ends up building one.',
    ),
    fa: P(
      'اگر لایه ابزار کالایی شود، پرسش این است که چه چیزی قابل دفاع می‌ماند. پاسخی که از تیم‌های عملیاتی برمی‌آید بی‌رمانتیک است: مجموعه آزمون.',
      '## چرا مجموعه‌ها انباشته می‌شوند',
      'سنجه عمومی ایستا و مشترک است. مجموعه خصوصی با هر شکست در محیط عملیاتی رشد می‌کند.',
    ),
  },
  {
    id: 'a8',
    title: 'Scaling past the data wall',
    source: 'mit-tr', author: 'Yusra Belkacem', date: '2026-08-04',
    minutes: 12, topic: 'synthetic', relevance: 72,
    summary: 'An argument that synthetic generation removes the ceiling on training data, provided filtering keeps pace with generation.',
    tldr: 'Argues synthetic generation lifts the data ceiling if filtering quality scales alongside it. Presents no measurement of recursive degradation.',
    reasons: ['Matches your Synthetic Data topic', 'You saved this article'],
    insights: [
      { h: 'Filtering is the bottleneck', p: 'The argument depends on filters improving as fast as generators do.' },
      { h: 'No recursion measurement', p: 'The piece does not test what happens across multiple synthetic generations.' },
    ],
    why: 'You saved this on 4 August. A newer study in your feed now qualifies its central claim.',
    changed: 'Partly superseded by the recursive-training study published 14 August.',
    body: P(
      'The data wall is the observation that high-quality human text is finite and largely consumed. The argument here is that generation removes the wall rather than moving it.',
      '## The filtering dependency',
      'Everything in the argument rests on filters keeping pace. If generation outruns filtering, the additional data is not merely useless but actively harmful — a possibility the piece acknowledges in a single paragraph and does not measure.',
    ),
    fa: P(
      'دیوار داده یعنی این مشاهده که متن انسانی باکیفیت محدود و عمدتاً مصرف‌شده است. استدلال اینجا آن است که تولید داده، دیوار را برمی‌دارد نه اینکه جابه‌جا کند.',
    ),
    saved: true, read: true,
  },
  {
    id: 'a9',
    title: 'What regulators mean when they say "high-risk"',
    source: 'lawfare', author: 'Petra Nkemdirim', date: '2026-07-28',
    minutes: 9, topic: 'ai-reg', relevance: 76,
    summary: 'A close reading of the classification criteria and how deployment context, not model capability, determines the category.',
    tldr: 'Risk classification follows deployment context, not model capability. The same model can be high-risk in one product and unregulated in another.',
    reasons: ['Matches your AI Regulation topic', 'Foundational for articles you have saved'],
    insights: [
      { h: 'Context, not capability', p: 'Classification attaches to the use case and sector, not to model size or benchmark scores.' },
      { h: 'Deployers carry duties too', p: 'Obligations do not stop at the provider; the deploying organisation holds its own.' },
    ],
    why: 'This gives the classification background assumed by the enforcement article in today\'s brief.',
    changed: 'No significant change detected.',
    body: P(
      'The most common misreading of the risk tiers is to treat them as a property of a model. They are a property of a deployment.',
      '## Same weights, different duties',
      'A model used to summarise internal meeting notes and the same model used to screen job applicants sit in different categories, carry different documentation duties, and face different audit expectations.',
    ),
    fa: P(
      'رایج‌ترین بدفهمی درباره سطوح خطر آن است که آن‌ها را ویژگی مدل بدانیم. آن‌ها ویژگی یک استقرار هستند.',
    ),
    read: true,
  },
  {
    id: 'a10',
    title: 'Memory architectures for long-running agents',
    source: 'stanford-hai', author: 'Marcus Iwu', date: '2026-07-21',
    minutes: 14, topic: 'ai-agents', relevance: 81,
    summary: 'A taxonomy of memory strategies for agents that run for days, and the failure modes each one produces.',
    tldr: 'Surveys memory strategies for long-running agents and names the characteristic failure of each: summarisation loses specifics, vector recall loses order, full logs lose the plot.',
    reasons: ['Matches your AI Agents topic', 'Related to 5 saved articles'],
    insights: [
      { h: 'Every strategy loses something', p: 'Summarisation drops specifics, retrieval drops sequence, raw logs overwhelm the context.' },
      { h: 'Hybrids dominate in practice', p: 'Production systems combine a rolling summary with retrievable episodic records.' },
      { h: 'Forgetting needs a policy', p: 'Systems without explicit deletion rules accumulate stale beliefs that resurface unpredictably.' },
    ],
    why: 'Memory is the recurring theme across the agent articles you save most often.',
    changed: 'No significant change detected.',
    body: P(
      'An agent that runs for an hour can keep everything. An agent that runs for a week cannot. What it discards, and how it decides, determines almost everything about its behaviour.',
      '## Three families',
      'Rolling summarisation is cheap and loses specifics. Episodic retrieval preserves detail and loses ordering. Full transcripts preserve everything and drown the model in irrelevance.',
      '## Forgetting as a feature',
      'The least discussed requirement is deletion. Without an explicit policy for retiring outdated conclusions, agents keep acting on beliefs that were true last Tuesday.',
    ),
    fa: P(
      'عاملی که یک ساعت اجرا می‌شود می‌تواند همه‌چیز را نگه دارد. عاملی که یک هفته اجرا می‌شود نمی‌تواند.',
    ),
    saved: true,
  },
  {
    id: 'a11',
    title: 'Procurement teams are writing their own AI evaluation criteria',
    source: 'ars', author: 'Dominic Ashby', date: '2026-07-15',
    minutes: 6, topic: 'enterprise', relevance: 69,
    summary: 'Rather than accepting vendor benchmarks, large buyers increasingly arrive with task suites drawn from their own operations.',
    tldr: 'Large buyers now bring their own task suites to vendor evaluations, shifting negotiating power and making vendor benchmarks largely decorative.',
    reasons: ['Matches your Enterprise AI topic'],
    insights: [
      { h: 'Vendor benchmarks discounted', p: 'Buyers reported treating supplier-run evaluations as marketing rather than evidence.' },
      { h: 'Bake-offs are back', p: 'Head-to-head trials on customer data have returned as standard procurement practice.' },
    ],
    why: 'Connects the procurement thread to the evaluation thread you follow in AI Agents.',
    changed: 'No significant change detected.',
    body: P(
      'The shift is simple to describe and awkward for vendors: buyers stopped believing supplier-run evaluations and started running their own.',
      '## What a buyer suite looks like',
      'Typically a few hundred real tasks pulled from ticket queues and internal documents, graded by the people who normally do the work.',
    ),
    fa: P('این تغییر ساده است و برای فروشندگان ناخوشایند: خریداران دیگر ارزیابی‌های خود فروشنده را باور نمی‌کنند و ارزیابی خودشان را اجرا می‌کنند.'),
    read: true,
  },
  {
    id: 'a12',
    title: 'Small models are winning the routing layer',
    source: 'mit-tr', author: 'Lena Farrow', date: '2026-07-08',
    minutes: 7, topic: 'llm', relevance: 66,
    summary: 'Cheap classifiers deciding which model handles a request are quietly delivering most of the cost savings attributed to model efficiency.',
    tldr: 'Most reported inference savings come from routing, not from cheaper models. A small classifier deciding who answers is doing the heavy lifting.',
    reasons: ['Matches your LLM Research topic'],
    insights: [
      { h: 'Routing beats compression', p: 'Reported savings from routing exceeded those from quantisation in the deployments surveyed.' },
      { h: 'Routers need their own evals', p: 'A misrouted request fails invisibly, since the answer still looks fluent.' },
    ],
    why: 'Relevant to the cost-control theme running through your Enterprise AI reading.',
    changed: 'No significant change detected.',
    body: P(
      'The most effective inference cost lever in production is not a smaller model. It is not sending the request to the large one in the first place.',
      '## The invisible failure',
      'When a router sends a hard question to a weak model, the output is still fluent. Nothing errors. This is why routing needs evaluation at least as rigorous as the models it dispatches to.',
    ),
    fa: P('مؤثرترین اهرم کاهش هزینه در محیط عملیاتی، مدل کوچک‌تر نیست؛ این است که درخواست از ابتدا به مدل بزرگ فرستاده نشود.'),
  },
];

/* Daily brief — synthesised across the corpus, each tied to real sources. */
export const BRIEF = [
  {
    id: 'b1', topicId: 'ai-agents', articleId: 'a1', relevance: 94,
    title: 'Agent tooling standardised faster than your library predicted',
    summary: 'Four major agent frameworks shipped a compatible tool-calling schema this quarter. Integrations written once now run across all four runtimes.',
    why: 'Related to 8 articles you have read recently, and it contradicts a June prediction in your library.',
    basedOn: 3,
  },
  {
    id: 'b2', topicId: 'ai-reg', articleId: 'a2', relevance: 91,
    title: 'AI Act enforcement began with paperwork, not audits',
    summary: 'The first enforcement letters ask seven providers for training-data provenance. No capability testing was requested in this round.',
    why: 'You have followed AI Regulation for four months and saved four articles on the Act.',
    basedOn: 2,
  },
  {
    id: 'b3', topicId: 'synthetic', articleId: 'a4', relevance: 83,
    title: 'A study now qualifies the synthetic-data claim you saved',
    summary: 'Models trained recursively on their own output degrade within three generations, with rare categories disappearing before benchmarks move.',
    why: 'Directly qualifies "Scaling past the data wall", which you saved on 4 August.',
    basedOn: 2,
  },
];

export const TIMELINE = {
  'ai-agents': [
    { month: 'March',  text: 'Competing tool formats proliferate; four incompatible plugin schemas in wide use.', major: false, source: 'a10' },
    { month: 'April',  text: 'Enterprise buyers begin refusing single-runtime integrations in procurement.', major: false, source: 'a11' },
    { month: 'June',   text: 'Two commentators predict no shared tool format before 2027.', major: false, source: 'a8' },
    { month: 'July',   text: 'Evaluation suites emerge as the differentiating asset as tooling commoditises.', major: true, source: 'a7' },
    { month: 'August', text: 'Four frameworks ship a compatible tool-calling schema with shared conformance tests.', major: true, source: 'a1' },
  ],
  'ai-reg': [
    { month: 'May',    text: 'Risk classification guidance clarifies that tiers attach to deployment, not model.', major: false, source: 'a9' },
    { month: 'July',   text: 'Providers publish voluntary documentation frameworks ahead of enforcement.', major: false, source: 'a9' },
    { month: 'August', text: 'First enforcement letters sent to seven providers, focused on data provenance.', major: true, source: 'a2' },
  ],
};

export const NOTIFICATIONS = [
  { id: 'n1', kind: 'important', title: 'A study contradicts an article you saved', body: 'The recursive-training study qualifies the central claim of "Scaling past the data wall".', time: '2h ago', unread: true, articleId: 'a4' },
  { id: 'n2', kind: 'topic',     title: 'AI Agents is gaining momentum', body: '+42% new material this week, driven by the tool-protocol convergence.', time: '5h ago', unread: true, topicId: 'ai-agents' },
  { id: 'n3', kind: 'article',   title: 'New highly relevant article', body: 'Agent frameworks are converging on a shared tool protocol — 94% relevant.', time: '6h ago', unread: true, articleId: 'a1' },
  { id: 'n4', kind: 'source',    title: 'MIT Technology Review — 17 new articles', body: '3 matched your tracked topics. 14 were filtered out as low relevance.', time: '1d ago', unread: false, sourceId: 'mit-tr' },
  { id: 'n5', kind: 'source',    title: 'Lawfare monitoring paused', body: 'Monitoring was paused by you on 12 August. No articles collected since.', time: '3d ago', unread: false, sourceId: 'lawfare' },
];

/* Canned Research answers. Anything unmatched falls back to a grounded
   "not enough in your library" response rather than inventing an answer. */
export const RESEARCH_PRESETS = [
  {
    match: ['agent', 'change', 'month', 'tool'],
    question: 'What changed in AI Agents during the last 3 months?',
    answer: 'Across the 41 articles in your library from the last three months, the dominant change is that the tool-calling layer standardised while the evaluation layer did not. In March the field had four incompatible plugin formats; by August four major frameworks had shipped a shared schema with conformance tests. As that interface commoditised, the sources in your library shifted their attention to private evaluation suites as the remaining differentiator.',
    findings: [
      'Four agent frameworks adopted a compatible tool schema within a single quarter.',
      'Enterprise procurement pressure, not standards bodies, drove the convergence.',
      'Error and retry semantics remain unstandardised, so failure handling is still per-runtime.',
      'Attention moved to evaluation suites, which sources describe as the durable moat.',
      'Memory architecture remains unsettled, with no convergence comparable to tooling.',
    ],
    timelineTopic: 'ai-agents',
    sources: ['a1', 'a7', 'a10', 'a11'],
    conflicts: 'Two June articles in your library predicted no shared tool format before 2027. The August reporting contradicts them. Neither side has been retracted, so your library currently holds both claims.',
    further: ['a1', 'a7', 'a10'],
  },
  {
    match: ['synthetic', 'data', 'collapse', 'recursive'],
    question: 'Is synthetic data safe to train on at scale?',
    answer: 'Your library holds two directly opposing positions on this, published ten days apart, and the disagreement is not resolved. The August 4 argument holds that generation removes the data ceiling provided filtering keeps pace. The August 14 study measures what happens when it does not: degradation within three recursive generations, with rare categories lost first. The available sources suggest a mixed corpus slows degradation, but none demonstrate a safe threshold.',
    findings: [
      'Recursive training degrades measurably by the third generation.',
      'Long-tail categories thin out before aggregate benchmarks move.',
      'A 20% human-authored floor slowed but did not prevent degradation.',
      'No source in your library measures beyond five generations.',
    ],
    timelineTopic: null,
    sources: ['a4', 'a8'],
    conflicts: '"Scaling past the data wall" (4 Aug) and the recursive-training study (14 Aug) reach opposite conclusions. The earlier piece does not measure recursion, which the study identifies as the deciding variable.',
    further: ['a4', 'a8'],
  },
  {
    match: ['author', 'read', 'most', 'who'],
    question: 'Which authors do I read most about AI?',
    answer: 'Based on your reading history, Rhiannon Vale (MIT Technology Review) accounts for the largest share of completed reads in AI Agents, followed by Marcus Iwu (Stanford HAI) on memory and retrieval, and Petra Nkemdirim (Lawfare) on regulation. Your reading is concentrated: three authors account for roughly half of your completed articles.',
    findings: [
      'Rhiannon Vale — 2 completed reads, both in AI Agents.',
      'Marcus Iwu — 2 completed reads, retrieval and memory.',
      'Petra Nkemdirim — 2 completed reads, both regulation.',
      'Your reading skews toward analysis over primary research.',
    ],
    timelineTopic: null,
    sources: ['a1', 'a7', 'a10', 'a2'],
    conflicts: null,
    further: ['a5', 'a9'],
  },
];

/* Preset questions for the in-article assistant, with grounded answers. */
export const ARTICLE_QA = {
  'What is the main argument?': a =>
    `The article argues: ${a.tldr.split('. ')[0]}. Everything else in the piece supports that claim.`,
  'Explain this simply.': a =>
    `In plain terms — ${a.summary} The author's point is that this matters more for how teams work than for what the technology can do.`,
  'What evidence does the author provide?': a =>
    `The piece rests on ${a.insights.length} substantiated points, the strongest being "${a.insights[0].h}". Where the author is reasoning rather than reporting, the text is hedged, and this summary preserves that hedging.`,
  'What are the weaknesses?': a =>
    `The clearest gap: ${a.insights[a.insights.length - 1].h.toLowerCase()} is raised but not resolved. The available text does not contain enough detail to judge how significant that is.`,
  'Compare it with my previous research.': a =>
    `${a.changed === 'No significant change detected.' ? 'Against your library, this article is consistent with what you have already read — no significant change detected.' : a.changed}`,
};

export const byId = (list, id) => list.find(x => x.id === id);
export const topicName = id => (byId(TOPICS, id) || {}).name || id;
export const sourceName = id => (byId(SOURCES, id) || {}).name || id;
export const article = id => byId(ARTICLES, id);
