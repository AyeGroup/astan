/**
 * Admin panel for the museum avatar guide.
 *
 * Two jobs, in the order an operator needs them: register the physical
 * objects a QR can point at, then read what visitors asked in front of
 * them. Everything else the platform needs — content ingestion, the bot
 * itself — already lives in ragbuilder and is not duplicated here.
 */

import { rankedBars, hourColumns, composition, escapeHtml } from "./charts.js";

const el = (id) => document.getElementById(id);
const TOKEN_KEY = "museum-admin-token";

const state = { token: localStorage.getItem(TOKEN_KEY) || "", museum: null, museums: [], days: 30 };

// ---------------------------------------------------------------- transport

async function api(path, options = {}) {
  const res = await fetch("/api" + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Token": state.token,
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) {
    show("auth");
    throw new Error("توکن ادمین پذیرفته نشد.");
  }
  if (!res.ok) {
    let detail = "خطای " + res.status;
    try { detail = (await res.json()).detail || detail; } catch { /* keep the status */ }
    throw new Error(detail);
  }
  return res.status === 204 ? null : res.json();
}

function toast(message, kind = "error") {
  const box = el("toast");
  box.textContent = message;
  box.className = "toast " + kind;
  box.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { box.hidden = true; }, 4200);
}

function show(view) {
  for (const id of ["auth", "app"]) el(id).hidden = id !== view;
}

// ------------------------------------------------------------------- boot

async function boot() {
  if (!state.token) return show("auth");
  try {
    const { museums } = await api("/museums");
    state.museums = museums;
    show("app");
    renderMuseums();
    if (museums.length) await select(museums[0].slug);
  } catch (err) {
    toast(err.message);
  }
}

function renderMuseums() {
  const sel = el("museumSelect");
  sel.innerHTML = "";
  state.museums.forEach((m) => {
    const o = document.createElement("option");
    o.value = m.slug;
    o.textContent = m.name;
    sel.appendChild(o);
  });
  el("noMuseum").hidden = state.museums.length > 0;
  el("workspace").hidden = state.museums.length === 0;
}

async function select(slug) {
  state.museum = state.museums.find((m) => m.slug === slug) || null;
  el("museumSelect").value = slug;
  await Promise.all([loadObjects(), loadDashboard()]);
}

// ---------------------------------------------------------------- objects

async function loadObjects() {
  const { objects } = await api(`/museums/${state.museum.slug}/objects`);
  const body = el("objectRows");
  body.innerHTML = "";
  el("objectCount").textContent = objects.length.toLocaleString("fa-IR");

  if (!objects.length) {
    body.innerHTML = `<tr><td colspan="5" class="empty">هنوز اثری ثبت نشده است.</td></tr>`;
    return;
  }

  objects.forEach((obj) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><code>${escapeHtml(obj.code)}</code></td>
      <td>${escapeHtml(obj.title)}</td>
      <td class="dim">${escapeHtml(obj.hall || "—")}</td>
      <td class="num">${obj.questions.toLocaleString("fa-IR")}</td>
      <td class="row-actions"></td>`;
    const actions = tr.querySelector(".row-actions");

    const copy = button("کپی لینک", "ghost", async () => {
      await navigator.clipboard.writeText(obj.viewer_url);
      toast("لینک اثر کپی شد", "ok");
    });
    const open = document.createElement("a");
    open.className = "btn ghost";
    open.href = obj.viewer_url;
    open.target = "_blank";
    open.rel = "noopener";
    open.textContent = "باز کردن";
    const edit = button("ویرایش", "ghost", () => fillForm(obj));
    const del = button("حذف", "danger", async () => {
      if (!confirm(`اثر «${obj.title}» حذف شود؟`)) return;
      await api(`/museums/${state.museum.slug}/objects/${encodeURIComponent(obj.code)}`, { method: "DELETE" });
      toast("اثر حذف شد", "ok");
      await Promise.all([loadObjects(), loadDashboard()]);
    });
    actions.append(copy, open, edit, del);
    body.appendChild(tr);
  });
}

function button(text, cls, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "btn " + cls;
  b.textContent = text;
  b.onclick = () => onClick().catch?.((e) => toast(e.message)) ?? null;
  return b;
}

function fillForm(obj) {
  el("fCode").value = obj.code;
  el("fTitle").value = obj.title;
  el("fHall").value = obj.hall || "";
  el("fNote").value = obj.note || "";
  el("fCode").focus();
}

// -------------------------------------------------------------- dashboard

async function loadDashboard() {
  const data = await api(`/museums/${state.museum.slug}/dashboard?days=${state.days}`);

  el("kQuestions").textContent = data.totals.questions.toLocaleString("fa-IR");
  el("kSessions").textContent = data.totals.sessions.toLocaleString("fa-IR");
  el("kPerSession").textContent = data.totals.per_session.toLocaleString("fa-IR");
  el("kLatency").textContent = data.latency.p50 ? (data.latency.p50 / 1000).toFixed(1) + "s" : "—";
  el("kLatencyNote").textContent = data.latency.p95
    ? `صدک ۹۵: ${(data.latency.p95 / 1000).toFixed(1)} ثانیه`
    : "هنوز نمونه‌ای ثبت نشده";

  rankedBars(el("chartQuestions"), data.top_questions, {
    label: "question", value: "n",
    sub: (r) => (r.variants > 1 ? `${r.variants} صورت بیان مختلف` : ""),
    empty: "هنوز پرسشی ثبت نشده است.",
  });

  rankedBars(el("chartObjects"), data.top_objects.map((r) => ({
    ...r, name: r.title || r.code,
  })), {
    label: "name", value: "n",
    sub: (r) => `${r.sessions} بازدیدکننده`,
    color: "#08A395",
    empty: "هنوز پرسشی به اثری نسبت داده نشده است.",
  });

  rankedBars(el("chartGaps"), data.content_gaps, {
    label: "question", value: "n",
    color: "#AE7519",
    empty: "موردی پیدا نشد — پاسخ‌ها کافی بوده‌اند.",
  });

  hourColumns(el("chartHours"), data.by_hour, { empty: "هنوز داده‌ای برای این بازه نیست." });
  composition(el("chartLangs"), data.languages, { empty: "هنوز داده‌ای برای این بازه نیست." });

  buildTable(data);
}

/** A table view of the same numbers: charts are never the only path. */
function buildTable(data) {
  const rows = data.top_questions.map((r, i) =>
    `<tr><td class="num">${i + 1}</td><td>${escapeHtml(r.question)}</td>
      <td class="num">${r.n}</td><td class="num">${r.variants}</td></tr>`).join("");
  el("questionTableBody").innerHTML = rows ||
    `<tr><td colspan="4" class="empty">داده‌ای نیست.</td></tr>`;
}

// ------------------------------------------------------------------ wiring

function bind() {
  el("authForm").onsubmit = (e) => {
    e.preventDefault();
    state.token = el("tokenInput").value.trim();
    localStorage.setItem(TOKEN_KEY, state.token);
    boot();
  };

  el("museumSelect").onchange = (e) => select(e.target.value).catch((x) => toast(x.message));

  el("daysSelect").onchange = (e) => {
    state.days = Number(e.target.value);
    loadDashboard().catch((x) => toast(x.message));
  };

  el("museumForm").onsubmit = async (e) => {
    e.preventDefault();
    try {
      const museum = await api("/museums", {
        method: "POST",
        body: JSON.stringify({
          slug: el("mSlug").value.trim(),
          name: el("mName").value.trim(),
          bot_uuid: el("mBot").value.trim(),
          langs: [el("mLang").value],
        }),
      });
      state.museums.push(museum);
      renderMuseums();
      await select(museum.slug);
      e.target.reset();
      toast("موزه ساخته شد", "ok");
    } catch (err) { toast(err.message); }
  };

  el("objectForm").onsubmit = async (e) => {
    e.preventDefault();
    const code = el("fCode").value.trim();
    try {
      await api(`/museums/${state.museum.slug}/objects/${encodeURIComponent(code)}`, {
        method: "PUT",
        body: JSON.stringify({
          code,
          title: el("fTitle").value.trim(),
          hall: el("fHall").value.trim(),
          note: el("fNote").value.trim(),
        }),
      });
      e.target.reset();
      toast("اثر ذخیره شد", "ok");
      await loadObjects();
    } catch (err) { toast(err.message); }
  };

  el("csvBtn").onclick = () => {
    // the token lives in a header, so the download goes through fetch
    api(`/museums/${state.museum.slug}/objects`).then(({ objects }) => {
      const lines = ["object_id,title,avatar,lang"].concat(objects.map((o) =>
        `${o.code},"${o.title.replace(/"/g, "'")}",${o.avatar || state.museum.avatar},${state.museum.langs[0]}`));
      const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${state.museum.slug}-objects.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    }).catch((e) => toast(e.message));
  };

  el("tabs").onclick = (e) => {
    const btn = e.target.closest("button[data-tab]");
    if (!btn) return;
    [...el("tabs").children].forEach((b) => b.setAttribute("aria-selected", String(b === btn)));
    for (const name of ["objects", "dashboard"]) {
      el("tab-" + name).hidden = name !== btn.dataset.tab;
    }
  };

  el("tableToggle").onclick = () => {
    const t = el("questionTable");
    t.hidden = !t.hidden;
    el("tableToggle").textContent = t.hidden ? "نمایش جدول اعداد" : "پنهان کردن جدول";
  };
}

bind();
boot();
