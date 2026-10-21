/* «Код тела» · 3D-демонстрация упражнения (6–11 с, два повтора) перед первым подходом.
 * Фигура — объёмный скелет: золотые кости-капсулы, суставы и голова — шары со светом сверху; камера облетает фигуру.
 * За фигурой — блёклый логотип (../logo-mark.png; не загрузился — без него). В удержаниях — золотой счётчик секунд.
 * Траектории — moves/<ex>.json (ключевые позы, темп и фазы — по видео Паши).
 *
 * API:  Demo3D.show(el, exId, { onDone, onStart, startLabel })  → true, если демо есть и показано
 *         золотая кнопка: «Понятно»; если передан onStart (или startLabel) — «Начать тренировку» (или startLabel).
 *         По нажатию: отметить «видел», закрыть, вызвать onDone(exId), затем onStart(exId). «Ещё раз» — повтор показа.
 *       Demo3D.close()                      — остановить и убрать (без onDone); можно звать сколько угодно раз
 *       Demo3D.mount(el, exId, opts)        — независимый экземпляр (для preview.html), вернёт { close, replay }
 *       Demo3D.seen(exId) / Demo3D.markSeen(exId)
 *       Demo3D.has(exId), Demo3D.preload(exId), Demo3D.list
 * Работает без сборки, без CDN, классическим <script>. Повторный show() сам закрывает прежний. */
(function () {
  "use strict";
  var BASE = "demo/", VER = "10";   // VER — поднять при обновлении траекторий (сброс кэша WebView)
  try { if (document.currentScript && document.currentScript.src) BASE = new URL(".", document.currentScript.src).href; } catch (e) {}

  var GOLD = "#d4b47a", GOLD2 = "#f3dcaa", HI = "#fff4da", DEEP = "#5e4a2a", BG = "#0f0f12";
  var J = ["head", "lsh", "rsh", "lel", "rel", "lwr", "rwr", "lhp", "rhp", "lkn", "rkn", "lan", "ran", "lft", "rft"];
  var JI = {}; J.forEach(function (n, i) { JI[n] = i; });
  // кости: [от, до, группа]; 15 — середина плеч («шея»), 16 — середина таза (считаются на лету)
  var BONES = [[1, 2, "sh"], [7, 8, "hp"], [1, 7, "core"], [2, 8, "core"], [15, 0, "neck"],
    [1, 3, "arm"], [3, 5, "arm"], [2, 4, "arm"], [4, 6, "arm"],
    [7, 9, "leg"], [9, 11, "leg"], [11, 13, "foot"], [8, 10, "leg"], [10, 12, "leg"], [12, 14, "foot"]];
  // стопа — одна ровная палка от «пятки» (11/12 — опускаем под лодыжку, к подошве) до носка: стоя лежит на полу, не «на носочках»

  /* tips — три позиции движения по порядку: [с, текст] (1 — старт, 2 — рабочая фаза, 3 — возврат/главная ошибка),
   * появляются вместе с движением; каждая — в одну строку на 360 px. phone — как поставить телефон.
   * cam — облёт: [с, азимут°, высота°]; 0° — спереди (или со стороны головы), 90° — слева сбоку.
   * hl — подсвеченные группы костей, hj — подсвеченные суставы, hold — с какой секунды идёт счётчик удержания. */
  var EX = {
    squat: { name: "Приседания", phone: "Телефон в 2–3 м, всё тело в кадре",
      tips: [[0.2, "Стопы на ширине плеч"], [1.2, "Бёдра параллельно полу"], [2.4, "Вставай, колени по стопам"]],
      cam: [[0, 35, 10], [3.6, 80, 7], [7.4, 55, 10]], hl: ["leg"], hj: ["lkn", "rkn", "lhp", "rhp"] },
    pushup: { name: "Отжимания", phone: "Телефон на пол сбоку, в 1,5–2 м",
      tips: [[0.2, "Тело — одна прямая"], [1.2, "Грудь почти до пола"], [2.2, "Локти назад, не в стороны"]],
      cam: [[0, 45, 16], [3.2, 85, 9], [6.5, 65, 14]], hl: ["arm", "core"], hj: ["lel", "rel"] },
    lunge: { name: "Выпады", phone: "Встань боком, в 2–3 м от телефона",
      tips: [[0.2, "Стойка, корпус прямо"], [1.2, "Шаг назад, колено к полу"], [2.6, "Переднее колено над стопой"]],
      cam: [[0, 60, 10], [4.3, 88, 7], [8.6, 70, 10]], hl: ["leg"], hj: ["lkn", "rkn"] },
    plank: { name: "Планка", phone: "Телефон на пол сбоку, в 1,5–2 м", hold: 0,
      tips: [[0.2, "Локти под плечами"], [1.6, "Тело — одна линия"], [3.2, "Таз не роняй и не задирай"]],
      cam: [[0, 55, 15], [3.6, 88, 8], [7.2, 68, 14]], hl: ["core"], hj: ["lhp", "rhp"] },
    climber: { name: "Скалолаз", phone: "Телефон на пол сбоку, в 1,5–2 м",
      tips: [[0.2, "Упор на прямых руках"], [0.9, "Колено к груди, по очереди"], [3.0, "Таз не задирай"]],
      cam: [[0, 70, 24], [6.7, 86, 20]], hl: ["leg"], hj: ["lkn", "rkn"] },
    wallsit: { name: "Стульчик у стены", phone: "Спиной к стене, боком к камере", hold: 2.1,
      tips: [[0.2, "Спиной к стене"], [1.3, "Бёдра параллельно полу"], [3.0, "Колени над стопами, держи"]],
      cam: [[0, 40, 10], [3.2, 85, 7], [8.3, 65, 10]], hl: ["leg"], hj: ["lkn", "rkn"] },
    shtap: { name: "Касания плеч", phone: "Телефон на пол спереди, в 1,5–2 м",
      tips: [[0.2, "Упор на прямых руках"], [1.0, "Ладонь к другому плечу"], [3.0, "Таз не раскачивай"]],
      cam: [[0, 122, 34], [4.2, 148, 40], [8.9, 128, 36]], hl: ["arm"], hj: ["lwr", "rwr"] },
    updown: { name: "Вверх-вниз", phone: "Телефон на пол спереди, в 1,5–2 м",
      tips: [[0.2, "Упор на прямых руках"], [1.0, "По одной руке — на локти"], [2.7, "И так же обратно вверх"]],
      cam: [[0, 25, 18], [4.4, 62, 14], [8.7, 40, 16]], hl: ["arm"], hj: ["lel", "rel"] },
    quad: { name: "Ротация в упоре", phone: "Телефон сбоку, всё тело в кадре",
      tips: [[0.2, "Упор на ладони и колени"], [1.0, "Рука вверх — смотри на неё"], [2.3, "Вниз — и другой рукой"]],
      cam: [[0, 125, 28], [5, 150, 32], [10, 132, 28]], hl: ["arm"], hj: ["lwr", "rwr"] },
    kneel: { name: "Ротация с колена", phone: "Телефон в 2–3 м, всё тело в кадре",
      tips: [[0.2, "Встань на одно колено"], [0.8, "Рука через верх в сторону"], [7.8, "Потом смени колено"]],
      cam: [[0, 32, 22], [6.9, 42, 22], [8.2, 55, 15], [10.4, 65, 12]], hl: ["arm"], hj: ["lwr", "rwr"] },
    book: { name: "Открытая книга", phone: "Телефон сбоку, в 1,5–2 м",
      tips: [[0.3, "Ляг на бок, колени согнуты"], [1.3, "Верхняя рука — дугой назад"], [2.8, "Колени прижаты к полу"]],
      cam: [[0, 45, 52], [2.4, 12, 46], [5, 32, 52]], hl: ["arm", "sh"], hj: ["lsh", "rsh"] },
    hipabd: { name: "Отведение бедра лёжа", phone: "Телефон на полу сбоку, в 2 м",
      tips: [[0.2, "Ляг на бок, колени согнуты"], [1.0, "Колено вверх до упора"], [2.3, "Стопы вместе, таз ровно"]],
      cam: [[0, 75, 36], [3.4, 100, 30], [6.8, 85, 34]], hl: ["leg"], hj: ["lkn"] },
    crunch: { name: "Скручивания", phone: "Телефон на пол сбоку, ляг на спину",
      tips: [[0.3, "Колени согнуты, стопы на полу"], [1.3, "Оторви лопатки от пола"], [2.6, "Поясница прижата"]],
      cam: [[0, 65, 18], [2.4, 95, 10], [5, 75, 16]], hl: ["core"], hj: ["lsh", "rsh"] }
  };
  // неразрывные пробелы: после коротких слов и перед тире
  function nb(t) { for (var i = 0; i < 2; i++) t = nb1(t); return t; }
  function nb1(t) { return String(t).replace(/(^|[\s\u00a0])(в|к|с|у|о|и|а|на|по|до|не|за|от|из|над|под)\s/gi, "$1$2\u00a0").replace(/\s—/g, "\u00a0—"); }
  var ALIAS = { taps: "shtap", shouldertap: "shtap", quadrot: "quad", kneelrot: "kneel", openbook: "book", hip: "hipabd", hipabduction: "hipabd", wall_sit: "wallsit", mountain: "climber" };
  function key(id) { id = String(id || ""); return EX[id] ? id : (ALIAS[id] || id); }

  /* ---------- «видел» (localStorage может не работать — тогда помним до перезапуска) ---------- */
  var SEEN_KEY = "kt_demo3d_seen", memSeen = {};
  function readSeen() { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || "{}") || {}; } catch (e) { return {}; } }
  function seen(id) { id = key(id); return !!(memSeen[id] || readSeen()[id]); }
  function markSeen(id) {
    id = key(id); memSeen[id] = 1;
    try { var s = readSeen(); s[id] = Date.now(); localStorage.setItem(SEEN_KEY, JSON.stringify(s)); } catch (e) {}
  }

  /* ---------- загрузка траекторий ---------- */
  var cache = {}, pending = {};
  function decode(m) {
    var n = m.n, nj = m.j || 15, q = (m.q || 2) / 1000, d = m.d, out = new Float32Array(n * nj * 3), acc = new Array(nj * 3);
    for (var k = 0; k < nj * 3; k++) acc[k] = 0;
    for (var f = 0, i = 0; f < n; f++) for (k = 0; k < nj * 3; k++, i++) { acc[k] += d[i]; out[i] = acc[k] * q; }
    return { fps: m.fps, n: n, p: out, still: m.still || 0, props: m.props || {}, src: m.src || "" };
  }
  function load(id) {
    id = key(id);
    if (cache[id]) return Promise.resolve(cache[id]);
    if (pending[id]) return pending[id];
    if (typeof fetch !== "function") return Promise.reject(new Error("no fetch"));
    pending[id] = fetch(BASE + "moves/" + id + ".json?v=" + VER)
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (m) { delete pending[id]; return (cache[id] = decode(m)); },
            function (e) { delete pending[id]; throw e; });
    return pending[id];
  }

  /* ---------- стили (один раз) ---------- */
  function css() {
    if (document.getElementById("d3-style")) return;
    var s = document.createElement("style"); s.id = "d3-style";
    s.textContent = [
      ".d3-root{box-sizing:border-box;display:flex;justify-content:center;align-items:flex-start;width:100%;color:#f1ece3;",
      "font:16px/1.35 -apple-system,'SF Pro Text','Segoe UI',Roboto,'PT Sans',sans-serif;-webkit-user-select:none;user-select:none}",
      ".d3-root *{box-sizing:border-box}",
      ".d3-fixed{position:fixed;top:0;right:0;bottom:0;left:0;z-index:9000;background:rgba(8,8,10,.94);align-items:center;overflow-y:auto;",
      "padding:calc(12px + var(--tg-safe-area-inset-top,env(safe-area-inset-top,0px))) 16px calc(12px + var(--tg-safe-area-inset-bottom,env(safe-area-inset-bottom,0px)))}",
      ".d3-card{position:relative;width:100%;max-width:440px;background:" + BG + ";border:1px solid #2e2b30;border-radius:20px;padding:14px 14px 14px;",
      "box-shadow:0 10px 40px rgba(0,0,0,.5),inset 0 1px 0 rgba(243,220,170,.06)}",
      ".d3-kick{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#9a958d}",
      ".d3-title{font:20px/1.2 'Russo One',-apple-system,sans-serif;letter-spacing:.02em;color:" + GOLD2 + ";margin:2px 0 10px}",
      ".d3-kick,.d3-title{padding-right:40px}",
      ".d3-stage{position:relative;width:100%;aspect-ratio:1/1;border-radius:14px;overflow:hidden;background:" + BG + "}",
      "@supports not (aspect-ratio:1/1){.d3-stage{height:0;padding-bottom:100%}}",
      ".d3-stage canvas{position:absolute;left:0;top:0;width:100%;height:100%;display:block}",
      ".d3-bar{position:absolute;left:12px;right:12px;bottom:10px;height:3px;border-radius:2px;background:rgba(212,180,122,.16)}",
      ".d3-bar i{display:block;height:100%;width:0;border-radius:2px;background:" + GOLD + "}",
      ".d3-tips{list-style:none;margin:12px 0 0;padding:0 10px;min-height:calc(3 * 22px + 12px)}",
      ".d3-tips li{display:flex;align-items:center;gap:10px;font-size:16px;line-height:22px;white-space:nowrap;overflow:hidden;",
      "margin:0 0 6px;opacity:0;transform:translateY(6px);transition:opacity .35s ease,transform .35s ease}",
      ".d3-tips li.on{opacity:1;transform:none}",
      ".d3-static .d3-tips li{transition:none}",
      // общая левая колонка 22 px: кружки 1/2/3 и значок телефона на одной вертикали, текст — с одной вертикали
      ".d3-tips b{flex:0 0 22px;width:22px;height:22px;border-radius:50%;border:1.5px solid " + GOLD + ";color:" + GOLD2 + ";",
      "font:600 12px/19px -apple-system,sans-serif;text-align:center}",
      ".d3-tips span{min-width:0;overflow:hidden;text-overflow:ellipsis}",
      ".d3-phone{display:flex;align-items:center;gap:10px;margin-top:6px;padding:9px 10px;border-radius:12px;background:#17161a;",
      "color:#cfc6b6;font-size:15px;line-height:22px;white-space:nowrap;overflow:hidden}",
      ".d3-phone svg{flex:0 0 22px;display:block}",
      ".d3-phone span{min-width:0;overflow:hidden;text-overflow:ellipsis}",
      ".d3-btns{display:flex;gap:10px;margin-top:12px}",
      ".d3-btns button{min-height:48px;border-radius:14px;font:600 16px/1 -apple-system,sans-serif;border:0;cursor:pointer;-webkit-tap-highlight-color:transparent}",
      ".d3-again{flex:0 0 auto;padding:0 18px;background:#211f24;color:" + GOLD2 + ";box-shadow:inset 0 0 0 1px #3a3530}",
      ".d3-ok{flex:1 1 auto;padding:0 12px;background:linear-gradient(180deg,#f3dcaa," + GOLD + " 60%,#a8854b);color:#1a1408}",
      ".d3-again[hidden]{display:none}",
      ".d3-x{position:absolute;top:6px;right:6px;width:44px;height:44px;border:0;border-radius:50%;background:transparent;color:#b3ada4;",
      "font:300 26px/44px -apple-system,sans-serif;text-align:center;cursor:pointer;-webkit-tap-highlight-color:transparent}",
      ".d3-x:active{background:#211f24;color:" + GOLD2 + "}",
      ".d3-done .d3-ok{animation:d3pulse 1.6s ease-in-out 2}",
      "@keyframes d3pulse{50%{box-shadow:0 0 0 6px rgba(243,220,170,.18)}}"
    ].join("");
    (document.head || document.documentElement).appendChild(s);
  }

  /* ---------- математика ---------- */
  function cr(p0, p1, p2, p3, t) {   // Catmull-Rom
    var t2 = t * t, t3 = t2 * t;
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }
  function sstep(u) { u = u < 0 ? 0 : u > 1 ? 1 : u; return u * u * (3 - 2 * u); }
  function camAt(cam, t) {
    if (t <= cam[0][0]) return cam[0];
    for (var i = 0; i < cam.length - 1; i++) {
      var a = cam[i], b = cam[i + 1];
      if (t <= b[0]) { var u = sstep((t - a[0]) / (b[0] - a[0])); return [t, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]; }
    }
    return cam[cam.length - 1];
  }

  /* ---------- текущий показ ---------- */
  var cur = null;

  function destroy(c) {
    if (!c || c.dead) return;
    c.dead = true; c.playing = false;
    if (cur === c) cur = null;
    if (c.raf) cancelAnimationFrame(c.raf);
    c.raf = 0;
    if (c.ro) try { c.ro.disconnect(); } catch (e) {}
    window.removeEventListener("resize", c.onResize);
    document.removeEventListener("visibilitychange", c.onVis);
    if (c.onKey) document.removeEventListener("keydown", c.onKey);
    if (c.mq && c.onMq) try { c.mq.removeEventListener ? c.mq.removeEventListener("change", c.onMq) : c.mq.removeListener(c.onMq); } catch (e) {}
    if (c.canvas) { c.canvas.width = c.canvas.height = 0; }
    if (c.root && c.root.parentNode) c.root.parentNode.removeChild(c.root);
    c.ctx = c.canvas = c.root = c.clip = c.lis = c.tick = null;
  }
  function close() { destroy(cur); }

  /** Основной показ: один на экране, повторный вызов закрывает прежний. */
  function show(el, exId, opts) {
    close();
    var c = make(el, exId, opts || {});
    if (!c) return false;
    cur = c;
    return true;
  }
  /** Для превью: независимый экземпляр, вернёт { close, replay } или null. */
  function mount(el, exId, opts) {
    var c = make(el, exId, opts || {});
    return c ? { close: function () { destroy(c); }, replay: function () { if (!c.dead) replay(c); } } : null;
  }

  function make(el, exId, opts) {
    var id = key(exId), ex = EX[id];
    if (!ex || !el) return null;
    css();
    var reduce = false, mq = null;
    try { mq = window.matchMedia("(prefers-reduced-motion: reduce)"); reduce = !!mq.matches; } catch (e) {}
    if (opts.reduced != null) reduce = !!opts.reduced;

    var root = document.createElement("div");
    root.className = "d3-root" + (el === document.body ? " d3-fixed" : "");
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", "Как делать: " + ex.name);
    root.innerHTML =
      '<div class="d3-card"><button type="button" class="d3-x" aria-label="Закрыть">✕</button><div class="d3-kick">Как делать</div><div class="d3-title"></div>' +
      '<div class="d3-stage"><canvas aria-hidden="true"></canvas><div class="d3-bar"><i></i></div></div>' +
      '<ul class="d3-tips"></ul>' +
      '<div class="d3-phone"><svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><rect x="4.5" y="1" width="13" height="20" rx="3" fill="none" stroke="' + GOLD + '" stroke-width="1.6"/><circle cx="11" cy="17.3" r="1.2" fill="' + GOLD + '"/></svg><span></span></div>' +
      '<div class="d3-btns"><button type="button" class="d3-again">Ещё раз</button><button type="button" class="d3-ok">Понятно</button></div></div>';
    root.querySelector(".d3-title").textContent = ex.name;
    root.querySelector(".d3-phone span").textContent = nb(ex.phone);
    var ul = root.querySelector(".d3-tips"), lis = [];
    ex.tips.forEach(function (tp, i) {
      var li = document.createElement("li"), b = document.createElement("b"), s = document.createElement("span");
      b.textContent = String(i + 1); s.textContent = nb(tp[1]); li.appendChild(b); li.appendChild(s); ul.appendChild(li); lis.push(li);
    });
    el.appendChild(root);

    var c = { id: id, ex: ex, root: root, canvas: root.querySelector("canvas"), bar: root.querySelector(".d3-bar i"),
      lis: lis, t: 0, last: 0, playing: false, reduce: reduce, mq: mq, dead: false, at: opts.at,
      camFix: opts.cam && opts.cam.length === 2 ? [+opts.cam[0], +opts.cam[1]] : null };   // cam: [азимут, высота] — служебное, для превью
    var again = root.querySelector(".d3-again"), ok = root.querySelector(".d3-ok");
    ok.textContent = opts.startLabel ? String(opts.startLabel) : typeof opts.onStart === "function" ? "Начать тренировку" : "Понятно";
    if (reduce) again.hidden = true;
    ok.addEventListener("click", function () {
      markSeen(id);
      var cbs = [opts.onDone, opts.onStart];
      destroy(c);
      cbs.forEach(function (cb) { if (typeof cb === "function") try { cb(id); } catch (e) { setTimeout(function () { throw e; }); } });
    });
    again.addEventListener("click", function () { if (!c.dead) replay(c); });
    // просто посмотреть и выйти: ✕, тап по тёмному фону вокруг карточки, Esc (и системная «Назад» в приложении)
    var quit = function () { if (c.dead) return; markSeen(id); destroy(c); if (typeof opts.onClose === "function") try { opts.onClose(id); } catch (e) {} };
    root.querySelector(".d3-x").addEventListener("click", quit);
    root.addEventListener("click", function (e) { if (e.target === root && el === document.body) quit(); });
    c.onKey = function (e) { if (e.key === "Escape") quit(); };
    document.addEventListener("keydown", c.onKey);

    try { c.ctx = c.canvas.getContext("2d"); } catch (e) { c.ctx = null; }
    c.onResize = function () { if (!c.dead) { size(c); if (!c.playing) draw(c); } };
    c.onVis = function () { if (document.hidden) { if (c.raf) cancelAnimationFrame(c.raf); c.raf = 0; } else if (c.playing && !c.raf) { c.last = 0; c.raf = requestAnimationFrame(c.tick); } };
    window.addEventListener("resize", c.onResize);
    document.addEventListener("visibilitychange", c.onVis);
    if (typeof ResizeObserver === "function") { c.ro = new ResizeObserver(c.onResize); c.ro.observe(c.canvas.parentNode); }
    if (mq) {
      c.onMq = function () { if (c.dead) return; c.reduce = !!mq.matches; again.hidden = c.reduce; if (c.reduce) { stop(c); still(c); } };
      try { mq.addEventListener ? mq.addEventListener("change", c.onMq) : mq.addListener(c.onMq); } catch (e) {}
    }
    c.tick = function (now) {
      c.raf = 0;
      if (c.dead || !c.playing) return;
      var dt = c.last ? Math.min(0.1, (now - c.last) / 1000) : 0;
      c.last = now; c.t += dt;
      if (c.t >= c.dur) { c.t = c.dur; c.playing = false; root.classList.add("d3-done"); }
      draw(c); tipsAt(c, c.t);
      if (c.playing) c.raf = requestAnimationFrame(c.tick);
    };

    logoReady(function () { if (!c.dead && !c.playing && c.clip) draw(c); });
    load(id).then(function (clip) {
      if (c.dead) return;
      prep(c, clip); size(c);
      if (c.at != null) { root.classList.add("d3-static"); c.t = Math.min(c.at, c.dur); draw(c); tipsAt(c, c.t); return; }
      if (c.reduce) still(c); else replay(c);
    }, function () {                       // нет траектории — хотя бы подписи
      if (c.dead) return;
      root.querySelector(".d3-stage").style.display = "none";
      lis.forEach(function (li) { li.classList.add("on"); });
      again.hidden = true;
    });
    if (opts.noButtons) root.querySelector(".d3-btns").style.display = "none";
    return c;
  }

  function stop(c) { c.playing = false; if (c.raf) cancelAnimationFrame(c.raf); c.raf = 0; }
  function replay(c) {
    if (!c.clip) return;
    stop(c); c.root.classList.remove("d3-done");
    c.t = 0; c.last = 0; c.playing = true;
    c.lis.forEach(function (li) { li.classList.remove("on"); });
    c.raf = requestAnimationFrame(c.tick);
  }
  function still(c) {
    if (!c.clip) return;
    c.t = c.clip.still; c.stillMode = true; draw(c); c.stillMode = false;
    c.lis.forEach(function (li) { li.classList.add("on"); });
    c.bar.style.width = "0";
  }
  function tipsAt(c, t) {
    for (var i = 0; i < c.lis.length; i++) if (t >= c.ex.tips[i][0]) c.lis[i].classList.add("on");
    c.bar.style.width = (100 * Math.min(1, t / c.dur)).toFixed(1) + "%";
  }

  /* подготовка: границы и центр сцены */
  function prep(c, clip) {
    c.clip = clip; c.dur = (clip.n - 1) / clip.fps;
    var p = clip.p, mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (var i = 0; i < p.length; i += 3) for (var k = 0; k < 3; k++) { var v = p[i + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; }
    c.center = [(mn[0] + mx[0]) / 2, Math.max(0.35, (mn[1] + mx[1]) / 2 * 0.9), (mn[2] + mx[2]) / 2];
    var r = 0;
    for (i = 0; i < p.length; i += 3) {
      var dx = p[i] - c.center[0], dy = p[i + 1] - c.center[1], dz = p[i + 2] - c.center[2];
      r = Math.max(r, Math.sqrt(dx * dx + dy * dy + dz * dz));
    }
    var pr = clip.props || {};
    if (pr.wall != null) r = Math.max(r, 1.05);
    c.radius = Math.max(1.22, r + 0.2);          // один масштаб на все упражнения — человечек везде одного размера
  }

  function size(c) {
    var cv = c.canvas; if (!cv || !c.ctx) return;
    var w = cv.clientWidth || 300, h = cv.clientHeight || w, dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    c.W = W; c.H = H; c.dpr = dpr;
  }

  /* поза в момент t (Catmull-Rom между кадрами) → 17 точек (+ шея, таз) */
  function pose(c, t) {
    var clip = c.clip, p = clip.p, n = clip.n, f = Math.max(0, Math.min(n - 1, t * clip.fps)), i = Math.floor(f), u = f - i;
    var i0 = Math.max(0, i - 1), i1 = i, i2 = Math.min(n - 1, i + 1), i3 = Math.min(n - 1, i + 2), out = new Array(17);
    for (var j = 0; j < 15; j++) {
      var q = [0, 0, 0];
      for (var k = 0; k < 3; k++) { var o = j * 3 + k; q[k] = cr(p[i0 * 45 + o], p[i1 * 45 + o], p[i2 * 45 + o], p[i3 * 45 + o], u); }
      out[j] = q;
    }
    out[15] = mid(out[1], out[2]); out[16] = mid(out[7], out[8]);
    out[11] = heel(out[11], out[13], out[9], out[7], out[8]); out[12] = heel(out[12], out[14], out[10], out[7], out[8]);
    return out;
  }
  /* пятка: стопа — жёсткая. Стоя ровно линия лодыжка→носок идёт вниз на ~23°, подошва горизонтальна, пятка на полу
   * на 5 см позади и 5,8 см ниже лодыжки. Поворачиваем «лодыжка→носок» на 23° к верху стопы (верх — в сторону колена). */
  var HEEL_T = 23.5 * Math.PI / 180;
  function heel(A, T, K, lh, rh) {
    var d = [T[0] - A[0], T[1] - A[1], T[2] - A[2]], L = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]) || 1e-6;
    var k = [-d[2], 0, d[0]], kl = Math.sqrt(k[0] * k[0] + k[2] * k[2]);            // d × вверх
    if (kl < 0.3 * L) {                                                               // стопа почти вертикальна — ось по тазу
      var hx = [lh[0] - rh[0], lh[1] - rh[1], lh[2] - rh[2]], pd = (hx[0] * d[0] + hx[1] * d[1] + hx[2] * d[2]) / (L * L);
      k = [hx[0] - pd * d[0], hx[1] - pd * d[1], hx[2] - pd * d[2]];
    }
    kl = Math.sqrt(k[0] * k[0] + k[1] * k[1] + k[2] * k[2]) || 1e-6; k = [k[0] / kl, k[1] / kl, k[2] / kl];
    var kd = [k[1] * d[2] - k[2] * d[1], k[2] * d[0] - k[0] * d[2], k[0] * d[1] - k[1] * d[0]];   // k × d, |kd| = L
    var toK = [K[0] - A[0], K[1] - A[1], K[2] - A[2]];
    if (kd[0] * toK[0] + kd[1] * toK[1] + kd[2] * toK[2] < 0) kd = [-kd[0], -kd[1], -kd[2]];      // верх стопы — к колену
    var c1 = Math.cos(HEEL_T) / L, s1 = Math.sin(HEEL_T) / L, c2 = -s1, s2 = c1;      // подошва (θ) и нормаль (θ + 90°)
    var H = [0, 0, 0];
    for (var m = 0; m < 3; m++) {
      var sole = d[m] * c1 + kd[m] * s1, nrm = d[m] * c2 + kd[m] * s2;
      H[m] = A[m] - nrm * 0.058;                                                 // точка подошвы прямо под лодыжкой
    }
    if (H[1] < 0.015) H[1] = 0.015;                                                   // не ниже пола
    return H;
  }
  function mid(a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]; }

  /* ---------- логотип за фигурой (один на все показы; не загрузился — рисуем без него) ---------- */
  var logo = null, logoOk = false, logoCbs = [];
  function logoReady(cb) {
    if (logoOk) return;
    logoCbs.push(cb);
    if (logo) return;
    try {
      logo = new Image();
      logo.onload = function () { logoOk = !!logo.naturalWidth; var a = logoCbs.splice(0); if (logoOk) a.forEach(function (f) { try { f(); } catch (e) {} }); };
      logo.onerror = function () { logoCbs.length = 0; };
      logo.src = BASE + "../logo-mark.png?v=" + VER;
    } catch (e) { logo = {}; }
  }

  /* ---------- объём: радиусы (м) ---------- */
  var RB = { sh: 0.024, hp: 0.026, core: 0.026, neck: 0.021, arm: 0.027, leg: 0.032, foot: 0.02 };
  var RJ = [0.105, 0.04, 0.04, 0.04, 0.04, 0.04, 0.04, 0.04, 0.04, 0.04, 0.04, 0.04, 0.04, 0.04, 0.04];   // все суставы одного размера (кроме головы)

  /* ---------- отрисовка кадра ---------- */
  function draw(c) {
    var ctx = c.ctx; if (!ctx || !c.clip || !c.W) return;
    var W = c.W, H = c.H, t = c.t, dpr = c.dpr, cams = c.ex.cam;
    var cm = c.camFix ? [0, c.camFix[0], c.camFix[1]]
      : c.stillMode ? [0, c.ex.still != null ? c.ex.still : cams[cams.length - 1][1], cams[cams.length - 1][2]]
      : camAt(cams, t);
    var yaw = cm[1] * Math.PI / 180, pit = cm[2] * Math.PI / 180;
    var fov = 24 * Math.PI / 180, F = Math.min(W, H) / 2 / Math.tan(fov / 2);
    var dist = c.radius / Math.sin(fov / 2) * 0.98;
    var T = c.center;
    var C = [T[0] + dist * Math.sin(yaw) * Math.cos(pit), T[1] + dist * Math.sin(pit), T[2] + dist * Math.cos(yaw) * Math.cos(pit)];
    var fw = norm3([T[0] - C[0], T[1] - C[1], T[2] - C[2]]);
    var rt = norm3([-fw[2], 0, fw[0]]);                // fw × (0,1,0)
    var up = [rt[1] * fw[2] - rt[2] * fw[1], rt[2] * fw[0] - rt[0] * fw[2], rt[0] * fw[1] - rt[1] * fw[0]];
    var cx = W / 2, cy = H / 2 + H * 0.03;
    function P(v) {
      var dx = v[0] - C[0], dy = v[1] - C[1], dz = v[2] - C[2];
      var z = dx * fw[0] + dy * fw[1] + dz * fw[2]; if (z < 0.05) z = 0.05;
      return [cx + (dx * rt[0] + dy * rt[1] + dz * rt[2]) * F / z, cy - (dx * up[0] + dy * up[1] + dz * up[2]) * F / z, z, F / z];
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
    var g = ctx.createRadialGradient(cx, cy * 0.9, 0, cx, cy * 0.9, Math.max(W, H) * 0.6);
    g.addColorStop(0, "rgba(212,180,122,0.10)"); g.addColorStop(1, "rgba(212,180,122,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // логотип «Кода тела» — блёкло, по центру за фигурой
    if (logoOk) {
      var lh = H * 0.74, lw = lh * logo.naturalWidth / logo.naturalHeight;
      ctx.globalAlpha = 0.075; ctx.drawImage(logo, (W - lw) / 2, (H - lh) / 2, lw, lh); ctx.globalAlpha = 1;
    }
    ctx.lineCap = "round"; ctx.lineJoin = "round";

    // пол: тонкая золотая сетка, гаснет к краям
    var step = 0.25, R = 1.75, gx0 = Math.round(T[0] / step) * step, gz0 = Math.round(T[2] / step) * step, seg = 8;
    ctx.lineWidth = Math.max(1, dpr * 0.75);
    for (var axis = 0; axis < 2; axis++) {
      for (var a = -R; a <= R + 1e-6; a += step) {
        for (var s = 0; s < seg; s++) {
          var b0 = -R + (2 * R) * s / seg, b1 = -R + (2 * R) * (s + 1) / seg, bm = (b0 + b1) / 2;
          var rr = Math.sqrt(a * a + bm * bm) / R; if (rr >= 1) continue;
          var al = 0.22 * (1 - rr) * (1 - rr);
          var A = axis ? [gx0 + a, 0, gz0 + b0] : [gx0 + b0, 0, gz0 + a], B = axis ? [gx0 + a, 0, gz0 + b1] : [gx0 + b1, 0, gz0 + a];
          var pa = P(A), pb = P(B);
          ctx.strokeStyle = "rgba(212,180,122," + al.toFixed(3) + ")";
          ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke();
        }
      }
    }
    var pr = c.clip.props || {};
    if (pr.wall != null) drawWall(ctx, P, pr.wall, dpr);

    var pts = pose(c, t), sp = pts.map(P);

    // тень на полу: мягкое пятно + кости, спроецированные на пол (толщина — по радиусу кости)
    var cen = pts[16], cs = P([cen[0], 0, cen[2]]);
    var sg = ctx.createRadialGradient(cs[0], cs[1], 0, cs[0], cs[1], 0.8 * cs[3]);
    sg.addColorStop(0, "rgba(0,0,0,0.45)"); sg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.save(); ctx.translate(cs[0], cs[1]); ctx.scale(1, 0.35 + 0.6 * Math.abs(Math.sin(pit))); ctx.translate(-cs[0], -cs[1]);
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(cs[0], cs[1], 0.8 * cs[3], 0, 6.2832); ctx.fill(); ctx.restore();
    for (var i = 0; i < BONES.length; i++) {
      var p1 = pts[BONES[i][0]], p2 = pts[BONES[i][1]];
      var hgt = Math.min(p1[1], p2[1]), sa = Math.max(0.08, 0.36 - hgt * 0.35);     // выше от пола — бледнее
      var s1 = P([p1[0], 0.002, p1[2]]), s2 = P([p2[0], 0.002, p2[2]]);
      ctx.strokeStyle = "rgba(0,0,0," + sa.toFixed(3) + ")";
      ctx.lineWidth = 2.6 * RB[BONES[i][2]] * (s1[3] + s2[3]) / 2;
      ctx.beginPath(); ctx.moveTo(s1[0], s1[1]); ctx.lineTo(s2[0], s2[1]); ctx.stroke();
    }
    var hs = P([pts[0][0], 0.002, pts[0][2]]);
    ctx.fillStyle = "rgba(0,0,0," + Math.max(0.08, 0.34 - pts[0][1] * 0.3).toFixed(3) + ")";
    ctx.beginPath(); ctx.arc(hs[0], hs[1], 0.1 * hs[3], 0, 6.2832); ctx.fill();

    // фигура — плоско, без бликов и без затемнения по глубине (ничего не мерцает):
    // сначала все кости (от дальних к ближним), потом поверх все кругляшки — одинаковые на всех суставах и концах рук и ног
    var bones = [];
    for (i = 0; i < BONES.length; i++) bones.push({ b: BONES[i], z: (sp[BONES[i][0]][2] + sp[BONES[i][1]][2]) / 2 });
    bones.sort(function (x, y) { return y.z - x.z; });
    for (i = 0; i < bones.length; i++) {
      var a1 = sp[bones[i].b[0]], a2 = sp[bones[i].b[1]], rb = RB[bones[i].b[2]];
      capsule(ctx, a1, a2, rb * a1[3], rb * a2[3]);
    }
    var joints = [];
    for (i = 0; i < 15; i++) joints.push({ j: i, z: sp[i][2] });
    joints.sort(function (x, y) { return y.z - x.z; });
    for (i = 0; i < joints.length; i++) { var q = sp[joints[i].j]; ball(ctx, q[0], q[1], RJ[joints[i].j] * q[3]); }

    if (c.ex.hold != null) holdClock(c, ctx, t - c.ex.hold);
  }

  /* кость — плоская капсула одного цвета (без градиентов и бликов) */
  var BONE_C = "#c9a66b", JOINT_C = "#ecd29d";
  function capsule(ctx, a, b, ra, rb) {
    var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.sqrt(dx * dx + dy * dy);
    if (L < 0.5) return;
    var an = Math.atan2(dy, dx);
    ctx.fillStyle = BONE_C;
    ctx.beginPath();
    ctx.arc(a[0], a[1], Math.max(0.5, ra), an + Math.PI / 2, an + Math.PI * 1.5);
    ctx.arc(b[0], b[1], Math.max(0.5, rb), an - Math.PI / 2, an + Math.PI / 2);
    ctx.closePath(); ctx.fill();
  }
  /* сустав / голова — плоский кругляшок одного цвета */
  function ball(ctx, x, y, r) {
    ctx.fillStyle = JOINT_C; ctx.beginPath(); ctx.arc(x, y, Math.max(0.8, r), 0, 6.2832); ctx.fill();
  }
  /* счётчик удержания: тихо, золотом, в правом верхнем углу сцены */
  function holdClock(c, ctx, s) {
    if (s < 0) return;
    var dpr = c.dpr, sec = Math.floor(s + 1e-6), al = Math.min(1, s / 0.3 + 0.35);
    var txt = Math.floor(sec / 60) + ":" + (sec % 60 < 10 ? "0" : "") + (sec % 60);
    var x = c.W - 14 * dpr, y = 14 * dpr;
    ctx.save();
    ctx.globalAlpha = al;
    ctx.textAlign = "right"; ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(179,173,164,0.9)"; ctx.font = "500 " + (12 * dpr) + "px -apple-system,'SF Pro Text','Segoe UI',Roboto,sans-serif";
    ctx.fillText("держим", x, y);
    ctx.fillStyle = GOLD2; ctx.font = (22 * dpr) + "px 'Russo One',-apple-system,'SF Pro Display',sans-serif";
    ctx.fillText(txt, x, y + 16 * dpr);
    // тонкое кольцо секунды слева от цифр
    var w = ctx.measureText(txt).width, rr = 7 * dpr, ccx = x - w - 12 * dpr, ccy = y + 16 * dpr + 11 * dpr, fr = s - sec;
    ctx.lineWidth = 1.6 * dpr; ctx.strokeStyle = "rgba(212,180,122,0.25)";
    ctx.beginPath(); ctx.arc(ccx, ccy, rr, 0, 6.2832); ctx.stroke();
    ctx.strokeStyle = GOLD; ctx.beginPath(); ctx.arc(ccx, ccy, rr, -Math.PI / 2, -Math.PI / 2 + 6.2832 * fr); ctx.stroke();
    ctx.restore();
  }
  function norm3(v) { var l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function line(ctx, a, b) { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
  function dot(ctx, a, r) { ctx.beginPath(); ctx.arc(a[0], a[1], Math.max(0.5, r), 0, 6.2832); ctx.fill(); }
  function shade(hex, k) {
    var r = parseInt(hex.substr(1, 2), 16), g = parseInt(hex.substr(3, 2), 16), b = parseInt(hex.substr(5, 2), 16);
    return "rgb(" + Math.round(15 + (r - 15) * k) + "," + Math.round(15 + (g - 15) * k) + "," + Math.round(18 + (b - 18) * k) + ")";
  }
  function drawWall(ctx, P, z, dpr) {
    var x0 = -0.75, x1 = 0.75, h = 1.7;
    var c1 = P([x0, 0, z]), c2 = P([x1, 0, z]), c3 = P([x1, h, z]), c4 = P([x0, h, z]);
    ctx.fillStyle = "rgba(212,180,122,0.05)";
    ctx.beginPath(); ctx.moveTo(c1[0], c1[1]); ctx.lineTo(c2[0], c2[1]); ctx.lineTo(c3[0], c3[1]); ctx.lineTo(c4[0], c4[1]); ctx.closePath(); ctx.fill();
    ctx.lineWidth = Math.max(1, dpr * 0.75);
    for (var y = 0.25; y < h; y += 0.25) {
      var a = P([x0, y, z]), b = P([x1, y, z]);
      ctx.strokeStyle = "rgba(212,180,122," + (0.16 * (1 - y / h * 0.6)).toFixed(3) + ")"; line(ctx, a, b);
    }
    for (var x = x0; x <= x1 + 1e-6; x += 0.25) {
      var a2 = P([x, 0, z]), b2 = P([x, h, z]);
      ctx.strokeStyle = "rgba(212,180,122,0.12)"; line(ctx, a2, b2);
    }
    ctx.strokeStyle = "rgba(212,180,122,0.35)"; line(ctx, c1, c2);
  }

  function preload(id) { return load(id).then(function () { return true; }, function () { return false; }); }

  window.Demo3D = {
    show: show, close: close, mount: mount, seen: seen, markSeen: markSeen, preload: preload,
    has: function (id) { return !!EX[key(id)]; },
    list: Object.keys(EX),
    info: function (id) { var e = EX[key(id)]; return e ? { name: e.name, phone: e.phone, tips: e.tips.map(function (x) { return x[1]; }) } : null; },
    set base(v) { BASE = String(v); }, get base() { return BASE; }
  };
})();
