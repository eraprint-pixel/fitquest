/* «Код тела» · 3D-демонстрация упражнения (5 с) перед первым подходом.
 * Фигура — скелет «как видит камера»: золотые кости, светлые суставы, голова-круг; камера облетает фигуру.
 * Траектории — moves/<ex>.json (из видео Паши через MediaPipe или по ключевым позам).
 *
 * API:  Demo3D.show(el, exId, { onDone })  → true, если демо есть и показано
 *       Demo3D.close()                      — остановить и убрать (без onDone); можно звать сколько угодно раз
 *       Demo3D.mount(el, exId, opts)        — независимый экземпляр (для preview.html), вернёт { close, replay }
 *       Demo3D.seen(exId) / Demo3D.markSeen(exId)
 *       Demo3D.has(exId), Demo3D.preload(exId), Demo3D.list
 * Работает без сборки, без CDN, классическим <script>. Повторный show() сам закрывает прежний. */
(function () {
  "use strict";
  var BASE = "demo/", VER = "2";   // VER — поднять при обновлении траекторий (сброс кэша WebView)
  try { if (document.currentScript && document.currentScript.src) BASE = new URL(".", document.currentScript.src).href; } catch (e) {}

  var GOLD = "#d4b47a", GOLD2 = "#f3dcaa", RED = "#D9232A", BG = "#0f0f12";
  var J = ["head", "lsh", "rsh", "lel", "rel", "lwr", "rwr", "lhp", "rhp", "lkn", "rkn", "lan", "ran", "lft", "rft"];
  var JI = {}; J.forEach(function (n, i) { JI[n] = i; });
  // кости: [от, до, группа]; 15 — середина плеч («шея»), 16 — середина таза (считаются на лету)
  var BONES = [[1, 2, "sh"], [7, 8, "hp"], [1, 7, "core"], [2, 8, "core"], [15, 0, "neck"],
    [1, 3, "arm"], [3, 5, "arm"], [2, 4, "arm"], [4, 6, "arm"],
    [7, 9, "leg"], [9, 11, "leg"], [11, 13, "foot"], [8, 10, "leg"], [10, 12, "leg"], [12, 14, "foot"]];

  /* Тексты: 2–3 пояснения (в одну строку на 360 px), когда появляются (с), как поставить телефон.
   * cam — облёт: [время, азимут°, высота°]; 0° — спереди (или со стороны головы), 90° — слева сбоку.
   * hl — подсвеченные группы костей, hj — подсвеченные суставы, arrow — сустав для красных стрелок ↑↓. */
  var EX = {
    squat: { name: "Приседания", phone: "Телефон в 2–3 м, всё тело в кадре",
      tips: [[0.3, "Спина ровная"], [1.2, "Колени по стопам"], [2.4, "Таз назад и вниз"]],
      cam: [[0, 25, 10], [2.2, 80, 12], [5, 40, 14]], hl: ["leg"], hj: ["lkn", "rkn", "lhp", "rhp"], arrow: "hip" },
    pushup: { name: "Отжимания", phone: "Телефон на пол сбоку, в 1,5–2 м",
      tips: [[0.3, "Тело — одна прямая"], [1.3, "Локти назад, не в стороны"], [2.6, "Грудь почти до пола"]],
      cam: [[0, 35, 16], [2.4, 88, 10], [5, 60, 18]], hl: ["arm", "core"], hj: ["lel", "rel"], arrow: "chest" },
    lunge: { name: "Выпады", phone: "Встань боком, в 2–3 м от телефона",
      tips: [[0.3, "Шаг назад, широко"], [1.3, "Колено почти до пола"], [2.6, "Корпус держи прямо"]],
      cam: [[0, 30, 10], [2.4, 85, 10], [5, 45, 14]], hl: ["leg"], hj: ["lkn", "rkn"], arrow: "hip" },
    plank: { name: "Планка", phone: "Телефон на пол сбоку, в 1,5–2 м",
      tips: [[0.3, "Локти под плечами"], [1.4, "Тело — одна линия"], [2.6, "Живот подтянут, дыши"]],
      cam: [[0, 30, 16], [2.4, 88, 10], [5, 55, 18]], hl: ["core"], hj: ["lhp", "rhp"], arrow: "hip" },
    climber: { name: "Скалолаз", phone: "Телефон на пол сбоку, в 1,5–2 м",
      tips: [[0.3, "Упор на прямых руках"], [1.3, "Колено к груди, по очереди"], [2.6, "Таз не задирай"]],
      cam: [[0, 35, 16], [2.4, 88, 10], [5, 60, 18]], hl: ["leg", "core"], hj: ["lkn", "rkn"] },
    wallsit: { name: "Стульчик у стены", phone: "Спиной к стене, боком к камере",
      tips: [[0.3, "Спина прижата к стене"], [1.4, "Колени над стопами"], [2.6, "Бёдра параллельно полу"]],
      cam: [[0, 25, 10], [2.4, 80, 12], [5, 45, 14]], hl: ["leg"], hj: ["lkn", "rkn"], arrow: "hip" },
    shtap: { name: "Касания плеч", phone: "Телефон на пол перед собой, в 1,5–2 м",
      tips: [[0.3, "Упор на прямых руках"], [1.2, "Ладонь к другому плечу"], [2.6, "Таз не раскачивай"]],
      cam: [[0, 10, 18], [2.4, 45, 16], [5, 75, 14]], hl: ["arm", "core"], hj: ["lwr", "rwr"] },
    updown: { name: "Вверх-вниз", phone: "Телефон на пол перед собой, в 1,5–2 м",
      tips: [[0.3, "Старт — упор на прямых"], [1.2, "По одной руке — на локти"], [2.6, "И так же обратно вверх"]],
      cam: [[0, 15, 16], [2.4, 70, 12], [5, 45, 16]], hl: ["arm"], hj: ["lel", "rel"], arrow: "chest" },
    quad: { name: "Ротация в упоре", phone: "Телефон сбоку, всё тело в кадре",
      tips: [[0.3, "Упор на ладони и колени"], [1.2, "Рука вверх — смотри на неё"], [2.8, "Плавно верни вниз"]],
      cam: [[0, -25, 16], [2.4, -70, 14], [5, -40, 18]], hl: ["arm", "sh"], hj: ["lsh", "rsh"] },
    kneel: { name: "Ротация с колена", phone: "Телефон в 2–3 м, всё тело в кадре",
      tips: [[0.3, "Встань на одно колено"], [1.2, "Руки вперёд, корпус прямо"], [2.4, "Рука через верх в сторону"]],
      cam: [[0, 15, 10], [2.4, 55, 12], [5, 30, 14]], hl: ["arm", "sh"], hj: ["lsh", "rsh"] },
    book: { name: "Открытая книга", phone: "Телефон сбоку, в 1,5–2 м",
      tips: [[0.3, "Ляг на бок, колени согнуты"], [1.3, "Верхняя рука — дугой назад"], [2.8, "Колени прижаты к полу"]],
      cam: [[0, 45, 52], [2.4, 12, 46], [5, 32, 52]], hl: ["arm", "sh"], hj: ["lsh", "rsh"] },
    hipabd: { name: "Отведение бедра лёжа", phone: "Телефон на полу, ты целиком в кадре",
      tips: [[0.3, "Ляг на бок, колени согнуты"], [0.9, "Верхнее колено — вверх, до упора"], [2.4, "Колени вместе, таз не заваливай"]],
      cam: [[0, 70, 42], [2.4, 105, 36], [5, 80, 42]], hl: ["leg", "hp"], hj: ["lhp", "lkn"] },
    crunch: { name: "Скручивания", phone: "Телефон на пол сбоку, ляг на спину",
      tips: [[0.3, "Колени согнуты, стопы на полу"], [1.3, "Оторви лопатки от пола"], [2.6, "Поясница прижата"]],
      cam: [[0, 65, 18], [2.4, 95, 10], [5, 75, 16]], hl: ["core"], hj: ["lsh", "rsh"], arrow: "chest" }
  };
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
      ".d3-card{width:100%;max-width:440px;background:" + BG + ";border:1px solid #2e2b30;border-radius:20px;padding:14px 14px 14px;",
      "box-shadow:0 10px 40px rgba(0,0,0,.5),inset 0 1px 0 rgba(243,220,170,.06)}",
      ".d3-kick{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#9a958d}",
      ".d3-title{font:20px/1.2 'Russo One',-apple-system,sans-serif;letter-spacing:.02em;color:" + GOLD2 + ";margin:2px 0 10px}",
      ".d3-stage{position:relative;width:100%;aspect-ratio:1/1;border-radius:14px;overflow:hidden;background:" + BG + "}",
      "@supports not (aspect-ratio:1/1){.d3-stage{height:0;padding-bottom:100%}}",
      ".d3-stage canvas{position:absolute;left:0;top:0;width:100%;height:100%;display:block}",
      ".d3-bar{position:absolute;left:12px;right:12px;bottom:10px;height:3px;border-radius:2px;background:rgba(212,180,122,.16)}",
      ".d3-bar i{display:block;height:100%;width:0;border-radius:2px;background:" + GOLD + "}",
      ".d3-tips{list-style:none;margin:12px 0 0;padding:0;min-height:calc(3 * 1.35em + 12px)}",
      ".d3-tips li{display:flex;align-items:center;gap:10px;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;",
      "margin:0 0 6px;opacity:0;transform:translateY(6px);transition:opacity .35s ease,transform .35s ease}",
      ".d3-tips li.on{opacity:1;transform:none}",
      ".d3-static .d3-tips li{transition:none}",
      ".d3-tips b{flex:0 0 auto;width:20px;height:20px;border-radius:50%;border:1.5px solid " + GOLD + ";color:" + GOLD2 + ";",
      "font:600 12px/17px -apple-system,sans-serif;text-align:center}",
      ".d3-phone{display:flex;align-items:center;gap:8px;margin-top:6px;padding:9px 10px;border-radius:12px;background:#17161a;",
      "color:#cfc6b6;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".d3-phone svg{flex:0 0 auto}",
      ".d3-btns{display:flex;gap:10px;margin-top:12px}",
      ".d3-btns button{flex:1;min-height:48px;border-radius:14px;font:600 16px/1 -apple-system,sans-serif;border:0;cursor:pointer;-webkit-tap-highlight-color:transparent}",
      ".d3-again{background:#211f24;color:" + GOLD2 + ";box-shadow:inset 0 0 0 1px #3a3530}",
      ".d3-ok{background:linear-gradient(180deg,#f3dcaa," + GOLD + " 60%,#a8854b);color:#1a1408}",
      ".d3-again[hidden]{display:none}",
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
      '<div class="d3-card"><div class="d3-kick">Как делать</div><div class="d3-title"></div>' +
      '<div class="d3-stage"><canvas aria-hidden="true"></canvas><div class="d3-bar"><i></i></div></div>' +
      '<ul class="d3-tips"></ul>' +
      '<div class="d3-phone"><svg width="16" height="22" viewBox="0 0 16 22" aria-hidden="true"><rect x="1.5" y="1" width="13" height="20" rx="3" fill="none" stroke="' + GOLD + '" stroke-width="1.6"/><circle cx="8" cy="17.3" r="1.2" fill="' + GOLD + '"/></svg><span></span></div>' +
      '<div class="d3-btns"><button type="button" class="d3-again">Ещё раз</button><button type="button" class="d3-ok">Понятно</button></div></div>';
    root.querySelector(".d3-title").textContent = ex.name;
    root.querySelector(".d3-phone span").textContent = ex.phone;
    var ul = root.querySelector(".d3-tips"), lis = [];
    ex.tips.forEach(function (tp, i) {
      var li = document.createElement("li"), b = document.createElement("b"), s = document.createElement("span");
      b.textContent = String(i + 1); s.textContent = tp[1]; li.appendChild(b); li.appendChild(s); ul.appendChild(li); lis.push(li);
    });
    el.appendChild(root);

    var c = { id: id, ex: ex, root: root, canvas: root.querySelector("canvas"), bar: root.querySelector(".d3-bar i"),
      lis: lis, t: 0, last: 0, playing: false, reduce: reduce, mq: mq, dead: false, at: opts.at };
    var again = root.querySelector(".d3-again"), ok = root.querySelector(".d3-ok");
    if (reduce) again.hidden = true;
    ok.addEventListener("click", function () {
      markSeen(id);
      var cb = opts.onDone;
      destroy(c);
      if (typeof cb === "function") try { cb(id); } catch (e) { setTimeout(function () { throw e; }); }
    });
    again.addEventListener("click", function () { if (!c.dead) replay(c); });

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

  /* подготовка: границы, центр, скорость стрелок */
  function prep(c, clip) {
    c.clip = clip; c.dur = (clip.n - 1) / clip.fps;
    var p = clip.p, n = clip.n, mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (var i = 0; i < p.length; i += 3) for (var k = 0; k < 3; k++) { var v = p[i + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; }
    c.center = [(mn[0] + mx[0]) / 2, Math.max(0.35, (mn[1] + mx[1]) / 2 * 0.9), (mn[2] + mx[2]) / 2];
    var r = 0;
    for (i = 0; i < p.length; i += 3) {
      var dx = p[i] - c.center[0], dy = p[i + 1] - c.center[1], dz = p[i + 2] - c.center[2];
      r = Math.max(r, Math.sqrt(dx * dx + dy * dy + dz * dz));
    }
    var pr = clip.props || {};
    if (pr.wall != null) r = Math.max(r, 1.05);
    c.radius = r + 0.16;
    // скорость сустава для стрелок (м/с, по вертикали), сглаженная
    c.vy = null;
    var a = c.ex.arrow;
    if (a) {
      var vy = new Float32Array(n), y = new Float32Array(n);
      for (var f = 0; f < n; f++) y[f] = jointY(p, f, a);
      for (f = 0; f < n; f++) vy[f] = (y[Math.min(n - 1, f + 1)] - y[Math.max(0, f - 1)]) * clip.fps / ((f > 0 && f < n - 1) ? 2 : 1);
      var sm = new Float32Array(n);
      for (f = 0; f < n; f++) { var s = 0, w = 0; for (var o = -2; o <= 2; o++) { var g = f + o; if (g < 0 || g >= n) continue; s += vy[g]; w++; } sm[f] = s / w; }
      c.vy = sm;
    }
  }
  function jointY(p, f, a) {
    var b = f * 45;
    if (a === "hip") return (p[b + 7 * 3 + 1] + p[b + 8 * 3 + 1]) / 2;
    if (a === "chest") return (p[b + 1 * 3 + 1] + p[b + 2 * 3 + 1]) / 2;
    return p[b + JI[a] * 3 + 1];
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
    return out;
  }
  function mid(a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]; }

  /* ---------- отрисовка кадра ---------- */
  function draw(c) {
    var ctx = c.ctx; if (!ctx || !c.clip || !c.W) return;
    var W = c.W, H = c.H, t = c.t, dpr = c.dpr;
    var cm = c.stillMode ? [0, c.ex.still != null ? c.ex.still : c.ex.cam[c.ex.cam.length - 1][1], c.ex.cam[c.ex.cam.length - 1][2]]
      : camAt(c.ex.cam, t * 5 / Math.max(c.dur, 0.1));
    var yaw = cm[1] * Math.PI / 180, pit = cm[2] * Math.PI / 180;
    var fov = 38 * Math.PI / 180, F = Math.min(W, H) / 2 / Math.tan(fov / 2);
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
    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
    var g = ctx.createRadialGradient(cx, cy * 0.9, 0, cx, cy * 0.9, Math.max(W, H) * 0.6);
    g.addColorStop(0, "rgba(212,180,122,0.10)"); g.addColorStop(1, "rgba(212,180,122,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
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

    // тень: кости, спроецированные на пол
    var cen = pts[16], cs = P([cen[0], 0, cen[2]]);
    var sg = ctx.createRadialGradient(cs[0], cs[1], 0, cs[0], cs[1], 0.75 * cs[3]);
    sg.addColorStop(0, "rgba(0,0,0,0.45)"); sg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.save(); ctx.translate(cs[0], cs[1]); ctx.scale(1, 0.35 + 0.6 * Math.abs(Math.sin(pit))); ctx.translate(-cs[0], -cs[1]);
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(cs[0], cs[1], 0.75 * cs[3], 0, 6.2832); ctx.fill(); ctx.restore();
    ctx.strokeStyle = "rgba(0,0,0,0.42)";
    for (var i = 0; i < BONES.length; i++) {
      var p1 = pts[BONES[i][0]], p2 = pts[BONES[i][1]];
      var s1 = P([p1[0], 0.002, p1[2]]), s2 = P([p2[0], 0.002, p2[2]]);
      ctx.lineWidth = 0.07 * (s1[3] + s2[3]) / 2;
      ctx.beginPath(); ctx.moveTo(s1[0], s1[1]); ctx.lineTo(s2[0], s2[1]); ctx.stroke();
    }
    var hs = P([pts[0][0], 0.002, pts[0][2]]);
    ctx.fillStyle = "rgba(0,0,0,0.38)"; ctx.beginPath(); ctx.arc(hs[0], hs[1], 0.09 * hs[3], 0, 6.2832); ctx.fill();

    // фигура: кости, суставы и голова — от дальних к ближним
    var hl = {}, hj = {}, pulse = 0.5 + 0.5 * Math.sin(t * 5);
    (c.ex.hl || []).forEach(function (k) { hl[k] = 1; });
    (c.ex.hj || []).forEach(function (k) { hj[JI[k]] = 1; });
    var items = [], zmin = 1e9, zmax = -1e9;
    for (i = 0; i < 15; i++) { zmin = Math.min(zmin, sp[i][2]); zmax = Math.max(zmax, sp[i][2]); }
    var zr = Math.max(0.3, zmax - zmin);
    for (i = 0; i < BONES.length; i++) items.push({ k: 0, b: BONES[i], z: (sp[BONES[i][0]][2] + sp[BONES[i][1]][2]) / 2 + 0.01 });
    for (i = 1; i < 15; i++) items.push({ k: 1, j: i, z: sp[i][2] - 0.02 });
    items.push({ k: 2, z: sp[0][2] });
    items.sort(function (x, y) { return y.z - x.z; });
    for (i = 0; i < items.length; i++) {
      var it = items[i], depth = Math.max(0, Math.min(1, (it.z - zmin) / zr)), dim = 1 - depth * 0.45;
      if (it.k === 0) {
        var a1 = sp[it.b[0]], a2 = sp[it.b[1]], sc = (a1[3] + a2[3]) / 2, h = hl[it.b[2]];
        var wdt = (it.b[2] === "neck" ? 0.026 : 0.034) * sc;
        if (h) {
          ctx.strokeStyle = "rgba(243,220,170," + (0.10 + 0.10 * pulse) * dim + ")"; ctx.lineWidth = wdt * 2.6;
          line(ctx, a1, a2);
        }
        ctx.strokeStyle = shade(h ? GOLD2 : GOLD, dim); ctx.lineWidth = wdt; line(ctx, a1, a2);
        ctx.strokeStyle = "rgba(255,244,216," + (0.35 * dim) + ")"; ctx.lineWidth = wdt * 0.28; line(ctx, a1, a2);
      } else if (it.k === 1) {
        var q = sp[it.j], rj = (it.j === 13 || it.j === 14 ? 0.018 : 0.03) * q[3], hh = hj[it.j];
        if (hh) { ctx.fillStyle = "rgba(243,220,170," + (0.16 + 0.14 * pulse) * dim + ")"; dot(ctx, q, rj * 2.3); }
        ctx.fillStyle = BG; dot(ctx, q, rj + 1.4 * dpr);
        ctx.fillStyle = shade(GOLD2, dim); dot(ctx, q, rj);
      } else {
        var hd = sp[0], rh = 0.105 * hd[3];
        ctx.fillStyle = "#17161a"; dot(ctx, hd, rh);
        ctx.strokeStyle = shade(GOLD, dim); ctx.lineWidth = 0.022 * hd[3]; ctx.beginPath(); ctx.arc(hd[0], hd[1], rh, 0, 6.2832); ctx.stroke();
        ctx.fillStyle = "rgba(243,220,170," + 0.10 * dim + ")"; dot(ctx, hd, rh * 0.62);
      }
    }

    // красные стрелки вниз/вверх — только в движении
    if (c.vy && !c.stillMode) {
      var f = Math.max(0, Math.min(c.clip.n - 1, Math.round(t * c.clip.fps))), v = c.vy[f];
      var al2 = Math.max(0, Math.min(1, (Math.abs(v) - 0.12) / 0.25));
      if (al2 > 0.02) {
        var an = c.ex.arrow, base = an === "hip" ? pts[16] : an === "chest" ? pts[15] : pts[JI[an]];
        var off = 0.42, ap = P([base[0] + rt[0] * off, base[1], base[2] + rt[2] * off]);
        arrow(ctx, ap[0], ap[1], v < 0 ? 1 : -1, 0.16 * ap[3], al2);
      }
    }
  }
  function norm3(v) { var l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function line(ctx, a, b) { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
  function dot(ctx, a, r) { ctx.beginPath(); ctx.arc(a[0], a[1], Math.max(0.5, r), 0, 6.2832); ctx.fill(); }
  function shade(hex, k) {
    var r = parseInt(hex.substr(1, 2), 16), g = parseInt(hex.substr(3, 2), 16), b = parseInt(hex.substr(5, 2), 16);
    return "rgb(" + Math.round(15 + (r - 15) * k) + "," + Math.round(15 + (g - 15) * k) + "," + Math.round(18 + (b - 18) * k) + ")";
  }
  function arrow(ctx, x, y, dir, len, al) {   // dir 1 — вниз, -1 — вверх
    ctx.save(); ctx.globalAlpha = al; ctx.strokeStyle = RED; ctx.fillStyle = RED;
    ctx.lineWidth = Math.max(2, len * 0.16); ctx.lineCap = "round";
    var y0 = y - dir * len / 2, y1 = y + dir * len / 2, hw = len * 0.32;
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1 - dir * hw * 0.6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - hw, y1 - dir * hw); ctx.lineTo(x, y1 + dir * 2); ctx.lineTo(x + hw, y1 - dir * hw); ctx.closePath(); ctx.fill();
    ctx.restore();
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
