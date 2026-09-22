// ویزارد گام‌به‌گام — T-107.
// پیشرفت فقط در localStorage همین مرورگر می‌ماند؛ به سرور فرستاده نمی‌شود،
// چون «کدام گام پرونده‌ام را رد کرده‌ام» خودش دادهٔ شخصی است (§۶).
(function () {
  "use strict";
  var article = document.querySelector(".service");
  if (!article) return;
  var key = "daadno:steps:" + article.dataset.slug;

  function read() {
    try {
      return JSON.parse(localStorage.getItem(key) || "[]");
    } catch (e) {
      return [];
    }
  }

  function write(list) {
    try {
      localStorage.setItem(key, JSON.stringify(list));
    } catch (e) {
      /* حالت مرور ناشناس: پیشرفت ذخیره نمی‌شود، ولی صفحه باید کار کند. */
    }
  }

  var done = read();
  var toggles = Array.prototype.slice.call(document.querySelectorAll(".step-toggle"));

  function paint() {
    toggles.forEach(function (input) {
      var ord = Number(input.dataset.ord);
      var isDone = done.indexOf(ord) !== -1;
      input.checked = isDone;
      input.closest(".step").classList.toggle("done", isDone);
    });
    var bar = document.getElementById("step-progress");
    if (bar) {
      bar.value = done.length;
      bar.textContent = done.length + " از " + toggles.length;
    }
  }

  toggles.forEach(function (input) {
    input.addEventListener("change", function () {
      var ord = Number(input.dataset.ord);
      var at = done.indexOf(ord);
      if (input.checked && at === -1) done.push(ord);
      if (!input.checked && at !== -1) done.splice(at, 1);
      write(done);
      paint();
    });
  });

  if (toggles.length) {
    var progress = document.createElement("progress");
    progress.id = "step-progress";
    progress.max = toggles.length;
    progress.className = "steps-progress";
    var heading = document.querySelector("#steps h2");
    if (heading) heading.insertAdjacentElement("afterend", progress);
  }

  paint();
})();
