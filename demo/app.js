/**
 * Demo judicial portal.
 *
 * Stands in for the real adliran/ثنا flow so the assistant can be exercised
 * end-to-end. Note how thin the integration is: the portal declares its page,
 * tags its elements, and emits events. It never tells the assistant what to
 * say, and the assistant never reaches into the portal's state.
 */
(function () {
  'use strict';

  var ROUTES = {
    '/':                    { view: 'home',          page: 'PAGE_HOME' },
    '/login':               { view: 'login',         page: 'PAGE_LOGIN',              auth: false },
    '/otp':                 { view: 'otp',           page: 'PAGE_OTP',                needs: 'login' },
    '/dashboard':           { view: 'dashboard',     page: 'PAGE_DASHBOARD',          needs: 'auth' },
    '/notifications':       { view: 'notifications', page: 'PAGE_NOTIFICATION_LIST',  needs: 'auth' },
    '/notifications/detail':{ view: 'detail',        page: 'PAGE_NOTIFICATION_DETAIL',needs: 'auth' },
    '/print':               { view: 'print',         page: 'PAGE_NOTIFICATION_PRINT', needs: 'auth' },
    '/support':             { view: 'support',       page: 'PAGE_HOME' },
    '/help':                { view: 'support',       page: 'PAGE_HOME' }
  };

  var NOTIFICATIONS = [
    { id: '140012345678', type: 'ابلاغ اخطاریه — دعوت به جلسه دادگاه', date: '۱۴۰۳/۰۹/۱۲',
      body: 'پیرو درخواست شما به کلاسه ۱۴۰۰۱۲۳۴۵۶۷۸ مبنی بر مطالبه وجه، به موجب گواهی عدم امکان سازش، مقتضی است ظرف مهلت مقرر در نشانی الکترونیک قضایی خود مراجعه فرمایید. کیفیت اثر ابلاغ ثابت از تاریخ مشاهده این ابلاغیه محاسبه می‌گردد.' },
    { id: '140012345901', type: 'ابلاغ دادنامه', date: '۱۴۰۳/۰۸/۲۹',
      body: 'بدینوسیله دادنامه صادره در پرونده کلاسه ۱۴۰۰۱۲۳۴۵۹۰۱ جهت اطلاع شما ابلاغ می‌گردد. در صورت اعتراض، مهلت قانونی از تاریخ مشاهده این ابلاغیه آغاز می‌شود.' }
  ];

  var state = { loggedIn: false, awaitingOtp: false, otp: null, selected: null, otpAttempts: 0, seenMode: false };

  var $ = function (sel) { return document.querySelector(sel); };
  var views = {};
  document.querySelectorAll('[data-view]').forEach(function (el) { views[el.getAttribute('data-view')] = el; });

  function parseHash() {
    var raw = (location.hash || '#/').slice(1);
    var qi = raw.indexOf('?');
    return { path: qi >= 0 ? raw.slice(0, qi) : raw, query: qi >= 0 ? raw.slice(qi + 1) : '' };
  }

  function show(viewName) {
    Object.keys(views).forEach(function (name) { views[name].hidden = name !== viewName; });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function route() {
    var parsed = parseHash();
    var target = ROUTES[parsed.path] || ROUTES['/'];

    // Guard rails mirror the real portal: no dashboard without a session.
    if (target.needs === 'auth' && !state.loggedIn) { location.hash = '#/login'; return; }
    if (target.needs === 'login' && !state.awaitingOtp) { location.hash = '#/login'; return; }

    state.seenMode = parsed.query.indexOf('seen=1') >= 0;
    show(target.view);
    $('#dev-page').textContent = target.page;
    $('#logout').hidden = !state.loggedIn;

    // 1) Tell the assistant which page we are on.
    AssistantSDK.setPage(target.page);

    // 2) Emit the page-specific events it needs to advance the workflow.
    switch (target.view) {
      case 'login':  AssistantSDK.emit('LOGIN_PAGE_OPENED'); break;
      case 'dashboard': AssistantSDK.emit('DASHBOARD_LOADED'); break;
      case 'notifications': renderList(); break;
      case 'detail': renderDetail(); break;
      case 'print': renderPrint(); break;
      default: break;
    }
  }

  // ── ورود ───────────────────────────────────────────────────────────────
  $('#login-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var nid = $('#nid').value.trim();
    var pwd = $('#pwd').value;
    var error = $('#login-error');
    AssistantSDK.emit('LOGIN_SUBMITTED');

    if (!/^\d{10}$/.test(nid) || pwd !== '1234') {
      error.hidden = false;
      error.textContent = 'شماره ملی یا رمز شخصی نادرست است.';
      AssistantSDK.emit('LOGIN_FAILED');
      // Note: only the CODE travels, never the values the user typed.
      AssistantSDK.reportError('INVALID_CREDENTIALS');
      return;
    }

    error.hidden = true;
    AssistantSDK.reportError(null);
    state.awaitingOtp = true;
    state.otp = '12345';
    AssistantSDK.emit('LOGIN_SUCCESS');
    location.hash = '#/otp';
    window.setTimeout(sendOtp, 400);
  });

  // ── رمز موقت ───────────────────────────────────────────────────────────
  function sendOtp() {
    var sms = $('#otp-sms');
    sms.hidden = false;
    sms.textContent = 'پیامک آزمایشی: رمز موقت شما ' + state.otp + ' است.';
    AssistantSDK.emit('OTP_SENT');
  }

  $('#otp-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var value = $('#otp').value.trim();
    var error = $('#otp-error');
    AssistantSDK.emit('OTP_SUBMITTED');

    if (value !== state.otp) {
      state.otpAttempts++;
      error.hidden = false;
      error.textContent = 'رمز موقت وارد شده صحیح نیست.';
      AssistantSDK.emit('OTP_FAILED');
      AssistantSDK.reportError('INVALID_OTP');
      return;
    }

    error.hidden = true;
    AssistantSDK.reportError(null);
    state.loggedIn = true;
    state.awaitingOtp = false;
    AssistantSDK.emit('OTP_VERIFIED');
    location.hash = '#/dashboard';
  });

  /**
   * The assistant may ASK for a resend; this handler is the site's own gate.
   * It applies its rate limit and reports the outcome — the assistant has no
   * way to bypass it (سند §15).
   */
  var lastResend = 0;
  function resendOtp() {
    var now = Date.now();
    if (now - lastResend < 30000) {
      var error = $('#otp-error');
      error.hidden = false;
      error.textContent = 'ارسال مجدد رمز فقط هر ۳۰ ثانیه یک بار ممکن است.';
      return false;
    }
    lastResend = now;
    state.otp = '12345';
    AssistantSDK.emit('OTP_RESEND_REQUESTED');
    sendOtp();
    return true;
  }

  $('#otp-resend').addEventListener('click', function () { resendOtp(); });
  $('#otp-back').addEventListener('click', function () { location.hash = '#/login'; });

  // ── فهرست ابلاغیه‌ها ───────────────────────────────────────────────────
  function renderList() {
    var body = $('#list-body');
    var empty = $('#list-empty');
    $('#list-title').textContent = state.seenMode ? 'ابلاغیه‌های مشاهده شده' : 'ابلاغیه‌های جدید';
    body.replaceChildren();

    var rows = state.seenMode ? NOTIFICATIONS.slice(1) : NOTIFICATIONS;
    if (rows.length === 0) {
      empty.hidden = false;
      AssistantSDK.emit('NOTIFICATION_EMPTY');
      return;
    }
    empty.hidden = true;

    rows.forEach(function (item, index) {
      var tr = document.createElement('tr');
      if (index === 0) tr.setAttribute('data-assistant-target', 'notification_list_first_row');
      tr.innerHTML =
        '<td>' + (index + 1) + '</td><td>' + item.id + '</td><td>' + item.type +
        '</td><td>' + item.date + '</td><td><span class="badge">' + (state.seenMode ? 'مشاهده شده' : 'جدید') + '</span></td>';
      tr.addEventListener('click', function () {
        state.selected = item;
        location.hash = '#/notifications/detail';
      });
      body.appendChild(tr);
    });
    AssistantSDK.emit('NOTIFICATION_LIST_LOADED');
  }

  $('#list-refresh').addEventListener('click', renderList);

  // ── اطلاعات ابلاغیه ────────────────────────────────────────────────────
  function renderDetail() {
    var item = state.selected || NOTIFICATIONS[0];
    state.selected = item;
    $('#d-number').textContent = item.id;
    $('#d-date').textContent = item.date;
    $('#d-type').textContent = item.type;
    $('#d-body').textContent = item.body;
    AssistantSDK.emit('NOTIFICATION_OPENED');
  }

  $('#print-btn').addEventListener('click', function () {
    AssistantSDK.emit('DOWNLOAD_STARTED');
    location.hash = '#/print';
  });

  function renderPrint() {
    var item = state.selected || NOTIFICATIONS[0];
    $('#p-number').textContent = item.id;
    $('#p-body').textContent = item.body;
    $('#download-done').hidden = true;
    AssistantSDK.emit('PRINT_OPENED');
  }

  $('#download-btn').addEventListener('click', function () {
    $('#download-done').hidden = false;
    AssistantSDK.emit('DOWNLOAD_COMPLETED');
  });

  $('#logout').addEventListener('click', function () {
    state.loggedIn = false;
    state.awaitingOtp = false;
    AssistantSDK.emit('USER_LOGGED_OUT');
  });

  // ── راه‌اندازی دستیار ──────────────────────────────────────────────────
  AssistantSDK.init({
    apiBase: window.location.origin,
    pageId: 'PAGE_HOME',
    debug: true,
    // The assistant asks; the portal's own router decides.
    onNavigate: function (route) {
      var map = {
        '/': '#/', '/login': '#/login', '/otp': '#/otp', '/dashboard': '#/dashboard',
        '/notifications': '#/notifications', '/notifications/detail': '#/notifications/detail',
        '/help': '#/help', '/support': '#/support'
      };
      if (map[route]) location.hash = map[route];
    },
    // The assistant asks; the portal enforces its own rate limit.
    onOperationRequest: function (operation) {
      if (operation === 'RESEND_OTP') return resendOtp();
      if (operation === 'REFRESH_NOTIFICATION_LIST') { renderList(); return true; }
      if (operation === 'RETRY_DOWNLOAD') { $('#download-done').hidden = false; return true; }
      return false;
    },
    onHumanSupport: function () { location.hash = '#/support'; }
  });

  window.addEventListener('hashchange', route);
  route();
})();
