/**
 * Charts for the museum dashboard.
 *
 * Hand-built rather than pulled from a library: three simple forms, no
 * build step, and nothing fetched from a CDN — the same constraint the
 * visitor page runs under, since a museum's network may not reach one.
 *
 * Palette validated for both themes: adjacent-pair CVD separation, the
 * normal-vision floor, and contrast against both surfaces all pass.
 */

export const SERIES = ["#4478C9", "#08A395", "#AE7519"];

const LANG_LABEL = { fa: "فارسی", en: "English", ar: "العربية" };

function tooltip() {
  let node = document.getElementById("chart-tip");
  if (!node) {
    node = document.createElement("div");
    node.id = "chart-tip";
    node.className = "chart-tip";
    node.hidden = true;
    document.body.appendChild(node);
  }
  return node;
}

function attachTip(el, html) {
  const tip = tooltip();
  const show = (e) => {
    tip.innerHTML = html;
    tip.hidden = false;
    const pad = 12;
    const cx = e.clientX ?? el.getBoundingClientRect().left;
    const cy = e.clientY ?? el.getBoundingClientRect().top;
    tip.style.left = Math.max(pad, Math.min(cx + pad, innerWidth - tip.offsetWidth - pad)) + "px";
    tip.style.top = Math.max(pad, cy - tip.offsetHeight - pad) + "px";
  };
  el.addEventListener("mouseenter", show);
  el.addEventListener("mousemove", show);
  el.addEventListener("mouseleave", () => { tip.hidden = true; });
  el.addEventListener("focus", show);
  el.addEventListener("blur", () => { tip.hidden = true; });
}

/**
 * Ranked horizontal bars. The right form when the labels are sentences:
 * a column chart would turn every Persian question into rotated text
 * nobody can read.
 */
export function rankedBars(host, rows, { label, value, sub, color = SERIES[0], empty }) {
  host.innerHTML = "";
  if (!rows.length) { host.appendChild(emptyState(empty)); return; }

  const max = Math.max(...rows.map((r) => r[value])) || 1;
  const list = document.createElement("ol");
  list.className = "bars";

  rows.forEach((row, i) => {
    const li = document.createElement("li");
    li.className = "bar-row";
    li.tabIndex = 0;

    const head = document.createElement("div");
    head.className = "bar-head";
    const name = document.createElement("span");
    name.className = "bar-label";
    name.textContent = `${i + 1}. ${row[label]}`;
    const num = document.createElement("span");
    num.className = "bar-value";
    num.textContent = row[value].toLocaleString("fa-IR");
    head.append(name, num);

    const track = document.createElement("div");
    track.className = "bar-track";
    const fill = document.createElement("div");
    fill.className = "bar-fill";
    fill.style.width = (row[value] / max * 100).toFixed(1) + "%";
    fill.style.background = color;
    track.appendChild(fill);

    li.append(head, track);
    const extra = sub ? sub(row) : "";
    attachTip(li, `<b>${escapeHtml(row[label])}</b><br>${row[value]} پرسش${extra ? "<br>" + extra : ""}`);
    list.appendChild(li);
  });

  host.appendChild(list);
}

/** Twenty-four columns: when in the day visitors actually ask. */
export function hourColumns(host, rows, { empty }) {
  host.innerHTML = "";
  const total = rows.reduce((n, r) => n + r.n, 0);
  if (!total) { host.appendChild(emptyState(empty)); return; }

  const max = Math.max(...rows.map((r) => r.n)) || 1;
  const wrap = document.createElement("div");
  wrap.className = "cols";

  rows.forEach((r) => {
    const col = document.createElement("div");
    col.className = "col";
    col.tabIndex = 0;
    const bar = document.createElement("div");
    bar.className = "col-fill";
    bar.style.height = Math.max(r.n / max * 100, r.n ? 4 : 0) + "%";
    bar.style.background = SERIES[0];
    const tick = document.createElement("span");
    tick.className = "col-tick";
    // only every third hour is labelled, so the axis stays readable
    tick.textContent = r.hour % 3 === 0 ? String(r.hour).padStart(2, "0") : "";
    col.append(bar, tick);
    attachTip(col, `ساعت ${String(r.hour).padStart(2, "0")}<br>${r.n} پرسش`);
    wrap.appendChild(col);
  });

  host.appendChild(wrap);
}

/** One stacked bar: a language mix is a composition, not a ranking. */
export function composition(host, rows, { empty }) {
  host.innerHTML = "";
  const total = rows.reduce((n, r) => n + r.n, 0);
  if (!total) { host.appendChild(emptyState(empty)); return; }

  const bar = document.createElement("div");
  bar.className = "stack";
  const legend = document.createElement("div");
  legend.className = "legend";

  rows.forEach((r, i) => {
    const color = SERIES[i % SERIES.length];
    const share = r.n / total * 100;
    const seg = document.createElement("div");
    seg.className = "stack-seg";
    seg.style.width = share.toFixed(1) + "%";
    seg.style.background = color;
    seg.tabIndex = 0;
    const name = LANG_LABEL[r.lang] || r.lang;
    attachTip(seg, `${name}<br>${r.n} پرسش (${share.toFixed(0)}٪)`);
    bar.appendChild(seg);

    const item = document.createElement("span");
    item.className = "legend-item";
    item.innerHTML = `<i style="background:${color}"></i>${escapeHtml(name)} <b>${share.toFixed(0)}٪</b>`;
    legend.appendChild(item);
  });

  host.append(bar, legend);
}

function emptyState(text) {
  const p = document.createElement("p");
  p.className = "empty";
  p.textContent = text || "هنوز داده‌ای ثبت نشده است.";
  return p;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
