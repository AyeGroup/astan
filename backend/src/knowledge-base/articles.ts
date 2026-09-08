import type { ErrorCode, HelpTopic, Intent } from '@astan/contracts';

/**
 * Curated knowledge base (سند §26). Answers about judicial processes come from
 * here or from the workflow definition — never from the model's own general
 * knowledge, which is exactly the failure mode this product cannot afford.
 */
export interface Article {
  id: string;
  category:
    | 'Authentication'
    | 'OTP'
    | 'Notifications'
    | 'LoginProblems'
    | 'CommonErrors'
    | 'Navigation'
    | 'Downloads'
    | 'Printing'
    | 'FAQ';
  title: string;
  body: string;
  /** Simpler restatement for the «متوجه نشدم» flow (سند §21). */
  simple_body: string;
  keywords: string[];
  intents: Intent[];
  error_codes: ErrorCode[];
  topics: HelpTopic[];
}

export const ARTICLES: Article[] = [
  {
    id: 'kb_otp_not_received',
    category: 'OTP',
    title: 'رمز موقت برایم ارسال نشده است',
    body:
      'رمز موقت به شماره تلفن همراهی پیامک می‌شود که در سامانه ثنا ثبت شده است. ابتدا مطمئن شوید همان گوشی در دسترس شماست و آنتن دارد. اگر تا یک دقیقه پیامک نرسید، می‌توانید گزینه «ارسال مجدد رمز موقت» را در همان صفحه انتخاب کنید. اگر شماره ثبت‌شده دیگر در اختیار شما نیست، تغییر آن باید حضوری در دفاتر خدمات الکترونیک قضایی انجام شود.',
    simple_body:
      'پیامک رمز به همان شماره‌ای می‌آید که موقع ثبت‌نام ثنا داده‌اید. کمی صبر کنید؛ اگر نیامد دکمه «ارسال مجدد رمز موقت» را بزنید. من آن را برایتان مشخص می‌کنم.',
    keywords: ['رمز', 'نیامد', 'ارسال نشد', 'پیامک', 'کد', 'otp', 'موقت', 'دریافت نکردم'],
    intents: ['OTP_NOT_RECEIVED'],
    error_codes: ['OTP_NOT_RECEIVED'],
    topics: ['otp_not_received'],
  },
  {
    id: 'kb_otp_invalid',
    category: 'OTP',
    title: 'رمز موقت اشتباه یا منقضی است',
    body:
      'رمز موقت فقط چند دقیقه اعتبار دارد و تنها یک بار قابل استفاده است. اگر پیام «رمز نامعتبر» دیدید، آخرین پیامکی که دریافت کرده‌اید را وارد کنید، نه پیامک‌های قبلی. در صورت منقضی‌شدن، رمز تازه‌ای درخواست کنید.',
    simple_body:
      'کدی که وارد کرده‌اید درست نیست یا دیگر معتبر نیست. آخرین پیامک را نگاه کنید و همان عدد را وارد کنید. اگر باز هم نشد، رمز تازه بگیرید.',
    keywords: ['رمز اشتباه', 'نامعتبر', 'منقضی', 'قبول نمی‌کند', 'invalid'],
    intents: ['OTP_INVALID'],
    error_codes: ['INVALID_OTP', 'OTP_EXPIRED'],
    topics: ['otp_not_received'],
  },
  {
    id: 'kb_login_problem',
    category: 'LoginProblems',
    title: 'نمی‌توانم وارد سامانه شوم',
    body:
      'برای ورود، در سامانه احراز هویت ثنا نوع شخص (حقیقی ایرانی، حقوقی، حقیقی غیرایرانی) را درست انتخاب کنید، سپس شماره ملی و رمز شخصی خود را وارد کنید. رمز شخصی همان رمزی است که هنگام ثبت‌نام ثنا انتخاب کرده‌اید و با رمز موقت پیامکی فرق دارد. اگر رمز شخصی را فراموش کرده‌اید، از گزینه «رمز خود را فراموش کرده‌اید؟» در همان صفحه استفاده کنید.',
    simple_body:
      'دو رمز وجود دارد: «رمز شخصی» که خودتان ساخته‌اید و «رمز موقت» که پیامک می‌شود. در این صفحه رمز شخصی لازم است. اگر یادتان نیست، روی «رمز خود را فراموش کرده‌اید؟» بزنید.',
    keywords: ['ورود', 'لاگین', 'وارد نمی‌شوم', 'رمز شخصی', 'فراموش', 'شماره ملی'],
    intents: ['LOGIN_PROBLEM'],
    error_codes: ['LOGIN_FAILED', 'INVALID_CREDENTIALS'],
    topics: ['login_problem'],
  },
  {
    id: 'kb_session_expired',
    category: 'CommonErrors',
    title: 'نشست شما منقضی شده است',
    body:
      'به دلایل امنیتی، اگر مدتی در سامانه فعالیتی نداشته باشید نشست شما بسته می‌شود. کافی است دوباره وارد شوید؛ اطلاعات ابلاغیه‌های شما از بین نمی‌رود.',
    simple_body: 'مدتی بی‌کار مانده‌اید و سامانه شما را بیرون آورده است. دوباره وارد شوید؛ چیزی پاک نشده.',
    keywords: ['منقضی', 'خارج شدم', 'session', 'دوباره وارد'],
    intents: ['LOGIN_PROBLEM'],
    error_codes: ['SESSION_EXPIRED'],
    topics: ['session_expired'],
  },
  {
    id: 'kb_find_notification',
    category: 'Notifications',
    title: 'ابلاغیه‌ام را پیدا نمی‌کنم',
    body:
      'ابلاغیه‌های تازه در بخش «ابلاغیه جدید» قرار می‌گیرند. اگر قبلاً ابلاغیه را باز کرده‌اید، دیگر در فهرست ابلاغیه‌های جدید نیست و باید در «ابلاغیه‌های مشاهده‌شده» دنبال آن بگردید. اگر شماره یا رمز ابلاغیه را در اختیار دارید، می‌توانید از «دریافت ابلاغیه با شماره» یا «دریافت ابلاغیه با رمز» استفاده کنید.',
    simple_body:
      'اگر ابلاغیه را قبلاً باز کرده‌اید، در بخش «ابلاغیه‌های مشاهده شده» است، نه «ابلاغیه جدید». هر دو کادر در همین صفحه هستند.',
    keywords: ['پیدا نمی‌کنم', 'ابلاغیه نیست', 'کجاست', 'مشاهده شده', 'خالی'],
    intents: ['CANNOT_FIND_NOTIFICATION'],
    error_codes: ['NOTIFICATION_NOT_FOUND'],
    topics: ['find_notification'],
  },
  {
    id: 'kb_download_notification',
    category: 'Downloads',
    title: 'چگونه ابلاغیه را ذخیره یا چاپ کنم؟',
    body:
      'در صفحه «اطلاعات ابلاغیه»، دکمه «نسخه چاپی ابلاغیه» نسخه قابل چاپ را باز می‌کند. در آن صفحه با دکمه «چاپ اطلاعات» می‌توانید چاپ بگیرید یا در پنجره چاپ مرورگر گزینه ذخیره به‌صورت PDF را انتخاب کنید. اگر ابلاغیه پیوست دارد، دکمه «نسخه فایل پیوست» فایل را جداگانه باز می‌کند.',
    simple_body:
      'دکمه «نسخه چاپی ابلاغیه» را بزنید؛ صفحه‌ای باز می‌شود که دکمه چاپ دارد. در پنجره چاپ می‌توانید به‌جای چاپگر، «ذخیره به‌صورت PDF» را انتخاب کنید.',
    keywords: ['ذخیره', 'دانلود', 'چاپ', 'pdf', 'پرینت', 'پیوست'],
    intents: ['DOWNLOAD_NOTIFICATION', 'PRINT_NOTIFICATION'],
    error_codes: ['DOWNLOAD_FAILED'],
    topics: ['download_notification', 'print_notification'],
  },
  {
    id: 'kb_service_unavailable',
    category: 'CommonErrors',
    title: 'سامانه پاسخ نمی‌دهد',
    body:
      'گاهی سرویس‌های سامانه به‌صورت موقت در دسترس نیستند. چند دقیقه بعد دوباره تلاش کنید. اگر مشکل ادامه داشت، می‌توانید از دفاتر خدمات الکترونیک قضایی یا مرکز پشتیبانی کمک بگیرید.',
    simple_body: 'مشکل از سامانه است، نه از شما. چند دقیقه دیگر دوباره امتحان کنید.',
    keywords: ['قطع', 'خطا', 'بالا نمی‌آید', 'کار نمی‌کند', 'لود نمی‌شود'],
    intents: ['PAGE_CONFUSION'],
    error_codes: ['SERVICE_UNAVAILABLE', 'NETWORK_ERROR', 'UNKNOWN_ERROR'],
    topics: ['service_unavailable'],
  },
  {
    id: 'kb_what_is_sana',
    category: 'Authentication',
    title: 'سامانه ثنا چیست؟',
    body:
      'ثنا سامانه ثبت نام الکترونیک قضایی است. با ثبت‌نام در آن، یک حساب کاربری و رمز شخصی می‌گیرید و پس از آن ابلاغیه‌های شما به‌جای کاغذ، به‌صورت الکترونیکی در همین سامانه در دسترس قرار می‌گیرد.',
    simple_body: 'ثنا حساب کاربری شما در دستگاه قضایی است. با آن، نامه‌های رسمی پرونده‌تان را آنلاین می‌بینید.',
    keywords: ['ثنا چیست', 'ثنا', 'ثبت نام', 'حساب'],
    intents: ['WHAT_IS_THIS'],
    error_codes: [],
    topics: ['what_is_sana'],
  },
  {
    id: 'kb_what_is_notification',
    category: 'FAQ',
    title: 'ابلاغیه چیست؟',
    body:
      'ابلاغیه، اطلاع‌رسانی رسمی مرجع قضایی به شماست؛ مثلاً دعوت به جلسه دادگاه یا اعلام یک تصمیم. مشاهده ابلاغیه در سامانه، به‌منزله دریافت رسمی آن است و مهلت‌های قانونی از همان زمان محاسبه می‌شود.',
    simple_body: 'ابلاغیه یعنی نامه رسمی دادگاه به شما. وقتی آن را باز کنید، رسماً به دست شما رسیده حساب می‌شود.',
    keywords: ['ابلاغیه چیست', 'ابلاغ یعنی چه', 'این چیست'],
    intents: ['WHAT_IS_THIS'],
    error_codes: [],
    topics: ['what_is_notification'],
  },
];
