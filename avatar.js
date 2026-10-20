/*
 * avatar.js — «Аватар бойца» для мини-приложения «Код тела».
 * Самостоятельный модуль без зависимостей: параметрический SVG-боец.
 *
 * Принципы:
 *  - фигура меняется за ДЕЙСТВИЯ (тренировки, приказы дня, боссы), а не за цифру на весах;
 *    вес нужен только для стартовой фигуры и цели;
 *  - стартовая фигура — дружелюбный мультяшный боец, без насмешки;
 *  - аватар личный (state.visibility = 'private'), модуль никуда ничего не отправляет.
 *
 * API:
 *  Avatar.create({sex:'m'|'f', height_cm, weight_kg, goal_kg[, skin 0..3, hair 0..4]}) -> state
 *  Avatar.progress(state, event) -> {state, changed, gain, stageUp, levelUp}
 *      event: 'workout' | 'order' | 'boss' | 'streak3' | 'streak7' | 'streak30' | 'challenge'
 *             или {type, at?: Date|ms, id?: строка для защиты от повтора, points?: число}
 *             {type:'level', level:1..15} — звание из игры (экипировка)
 *             {type:'set', value:0..1}   — прямая установка прогресса (для отладки/демо)
 *  Avatar.render(el, state, opts) -> {stage}
 *      opts: {animate:true, from: state|число 0..1, duration:1200, sparks:true,
 *             level:n, progress:p (показать без изменения state), bg:true, onDone}
 *  Avatar.stage(state) -> {index 0..5, name, progress, percent, level, rank}
 *  Avatar.svg(state, opts) -> строка <svg> (для статичных картинок)
 *
 *  Что рисовать на 100% — GOAL_MODE ниже (одна константа, вопрос Эрнесту открыт):
 *    'honest' — честная цель: фигура при целевом весе, подтянутая (по умолчанию);
 *    'dream'  — спортивная «фигура мечты» независимо от цели.
 *  Обе цели лежат в state.targets, поэтому переключение константы сразу меняет всех без пересоздания.
 */
(function (root) {
  'use strict';

  var GOAL_MODE = 'honest';   // 'honest' | 'dream' — см. шапку
  // звания «Операции Подъём» — те же, что в игре (index.html, RANKS)
  var RANKS = ['Новобранец', 'Рядовой Подъём', 'Ефрейтор Без Отмазок', 'Младший сержант', 'Сержант Режим',
    'Старший сержант Планка', 'Старшина', 'Прапорщик', 'Лейтенант', 'Старший лейтенант',
    'Капитан Железо', 'Майор Дисциплина', 'Полковник', 'Генерал Подъёма', 'Легенда Кода тела'];
  var STAGES = ['Старт', 'Втягиваюсь', 'В ритме', 'Крепну', 'В форме', 'Боевая форма'];
  // «Сырые» очки за событие. За день засчитывается не больше DAY_CAP (с убывающей отдачей).
  var EVENTS = { workout: 1, order: 0.6, boss: 2, challenge: 0.8, plate: 0.2, streak3: 0.5, streak7: 1.5, streak30: 3 };
  var DAY_CAP = 2;   // насыщение за день: 1 тренировка ≈ 0.79, + приказ ≈ 1.10, потолок 2.0
  var FULL = 33;     // очков на весь путь ≈ 30 дней «тренировка + приказ»
  // палитры: новые цвета — в конце, чтобы старые номера в сохранённых бойцах не поменялись
  var SKINS = [['#f7d7b8', '#e6b691'], ['#f0c29b', '#dba27a'], ['#d49c6f', '#b88056'], ['#9d6a46', '#7d5235'], ['#fbe4d2', '#ecc3a6'], ['#77482c', '#5c361f']];
  var HAIRS = ['#3a2a20', '#1d1917', '#7a4a2a', '#caa060', '#8e8e8e', '#b5482a', '#efe3c4'];
  var EYE_COLORS = ['#231a17', '#6b4226', '#4f7a3a', '#3f78b5', '#6f7d86'];
  // Лицо бойца — человек собирает сам; от прогресса не меняется (меняются фигура, осанка, настроение и экипировка)
  var FACE = {
    shape: ['Овал', 'Круглое', 'Квадратное', 'Сердечком'],
    eyes: ['Круглые', 'Миндаль', 'Весёлые', 'Большие'],
    eyeColor: ['Тёмные', 'Карие', 'Зелёные', 'Голубые', 'Серые'],
    brows: ['Обычные', 'Тонкие', 'Густые', 'Прямые'],
    nose: ['Кнопка', 'Аккуратный', 'Прямой', 'Круглый'],
    mouth: ['Улыбка', 'Широкая', 'Ухмылка', 'С ямочками'],
    hair: ['Короткая', 'Ёжик', 'Чёлка набок', 'Кудри', 'Длинные', 'Хвост', 'Пучок', 'Каре', 'Бритая'],
    hairColor: ['Шатен', 'Брюнет', 'Каштан', 'Блонд', 'Седой', 'Рыжий', 'Платина'],
    beard: ['Нет', 'Щетина', 'Короткая', 'Густая'],
    mustache: ['Нет', 'Тонкие', 'Густые'],
    glasses: ['Нет', 'Круглые', 'Прямые'],
    freckles: ['Нет', 'Есть'], mole: ['Нет', 'Есть']
  };
  function faceDefault(sex, hair) {
    return { shape: 0, eyes: 0, eyeColor: 0, brows: 0, nose: 0, mouth: 0, hair: sex === 'f' ? 5 : 0, hairColor: hair | 0,
      beard: 0, mustache: 0, glasses: 0, freckles: 0, mole: 0 };
  }
  // лицо из состояния; старые бойцы без face — как раньше (причёска по полу, цвет волос из state.hair)
  function faceOf(state) {
    var d = faceDefault(state.sex, state.hair), f = state.face || {}, k;
    for (k in d) if (typeof f[k] === 'number' && f[k] >= 0 && f[k] < FACE[k].length) d[k] = Math.floor(f[k]);
    if (state.sex === 'f') { d.beard = 0; d.mustache = 0; }
    return d;
  }
  function randomFace(sex) {
    function r(n) { return Math.floor(Math.random() * n); }
    var fem = sex === 'f', o = {}, k;
    for (k in FACE) o[k] = r(FACE[k].length);
    o.hair = fem ? [2, 3, 4, 5, 6, 7, 4, 5][r(8)] : [0, 1, 2, 3, 0, 1, 8, 7][r(8)];
    o.hairColor = r(10) < 7 ? r(4) : r(HAIRS.length);
    o.beard = fem ? 0 : [0, 0, 1, 2, 3][r(5)]; o.mustache = fem ? 0 : [0, 0, 0, 1, 2][r(5)];
    o.glasses = [0, 0, 0, 1, 2][r(5)]; o.freckles = r(4) === 0 ? 1 : 0; o.mole = r(5) === 0 ? 1 : 0;
    o.skin = r(SKINS.length);
    return o;
  }
  var GOLD = '#d4b47a', GOLD2 = '#f3dcaa', FIRE = '#ff783c', INK = '#16161b';
  var CX = 120, VBW = 240, VBH = 320;

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function r1(x) { return Math.round(x * 10) / 10; }
  function bmiFat(bmi) { return clamp((bmi - 19) / 21, 0.03, 0.95); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function dayKey(d) {
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  /* ------------------------------------------------------------------ состояние */

  function create(p) {
    p = p || {};
    var sex = p.sex === 'f' ? 'f' : 'm';
    var h = clamp(+p.height_cm || (sex === 'f' ? 165 : 176), 130, 215);
    var w = clamp(+p.weight_kg || (sex === 'f' ? 65 : 80), 35, 250);
    var hm = h / 100;
    var goal = +p.goal_kg;
    var bmi0 = w / (hm * hm);
    if (!(goal > 30)) goal = bmi0 > 25 ? Math.max(Math.round(24 * hm * hm), Math.round(w * 0.88)) : w;
    goal = clamp(goal, 35, 250);
    var f0 = bmiFat(bmi0);
    var gaining = goal > w + 1;
    // честная цель — фигура при целевом весе; заметность пути дают осанка, уверенность и мышцы
    var fh = gaining ? Math.min(f0, 0.2) : Math.min(f0, Math.max(0.03, bmiFat(goal / (hm * hm))));
    var honest = { fat: r3(fh), mus: gaining ? 1 : 0.8, pos: 1, conf: 1 };
    // «фигура мечты» — спортивная, независимо от цели (но не полнее старта)
    var dream = { fat: r3(Math.min(f0, sex === 'f' ? 0.1 : 0.06)), mus: 1, pos: 1, conf: 1 };
    return {
      v: 1, sex: sex, height_cm: h, weight_kg: w, goal_kg: goal,
      skin: clamp(p.skin | 0, 0, SKINS.length - 1), hair: clamp(p.hair | 0, 0, HAIRS.length - 1),
      face: faceOf({ sex: sex, hair: p.hair | 0, face: p.face }),
      start: { fat: r3(f0), mus: 0.08, pos: 0.12, conf: 0.25 },
      target: GOAL_MODE === 'dream' ? dream : honest, targets: { honest: honest, dream: dream },
      points: 0, progress: 0, level: null,
      day: null, dayRaw: 0, counts: {}, seen: [],
      visibility: 'private', created: Date.now(), updated: Date.now()
    };
  }
  function r3(x) { return Math.round(x * 1000) / 1000; }

  function autoLevel(pr) { return 1 + Math.floor(clamp(pr, 0, 1) * 14.999); }
  function levelOf(state, opts) {
    var l = (opts && opts.level) || state.level || autoLevel(state.progress);
    return clamp(Math.round(l), 1, 15);
  }

  function stage(state, opts) {
    var pr = clamp(state.progress || 0, 0, 1);
    var idx = Math.min(5, Math.floor(pr * 5 + 1e-6));
    var lv = levelOf(state, opts);
    return { index: idx, name: STAGES[idx], progress: pr, percent: Math.round(pr * 100),
      level: lv, rank: RANKS[lv - 1] };
  }

  function progress(state, event) {
    var ev = typeof event === 'string' ? { type: event } : (event || {});
    var s = clone(state), before = stage(state);
    if (ev.type === 'level') {
      var lv = clamp(Math.round(+ev.level || 1), 1, 15);
      var was = levelOf(state);
      s.level = lv; s.updated = Date.now();
      return { state: s, changed: lv !== was, gain: 0, stageUp: false, levelUp: lv > was };
    }
    if (ev.type === 'set') {
      s.progress = clamp(+ev.value || 0, 0, 1); s.points = s.progress * FULL; s.updated = Date.now();
      return { state: s, changed: s.progress !== state.progress, gain: s.progress - state.progress,
        stageUp: stage(s).index > before.index, levelUp: false };
    }
    var base = ev.points != null ? +ev.points : EVENTS[ev.type];
    if (!(base > 0)) return { state: state, changed: false, gain: 0, stageUp: false, levelUp: false };
    if (ev.id) {
      if (s.seen.indexOf(String(ev.id)) >= 0) return { state: state, changed: false, gain: 0, stageUp: false, levelUp: false };
      s.seen.push(String(ev.id)); if (s.seen.length > 60) s.seen = s.seen.slice(-60);
    }
    var key = dayKey(ev.at ? new Date(ev.at) : new Date());
    if (s.day !== key) { s.day = key; s.dayRaw = 0; }
    var eff0 = DAY_CAP * (1 - Math.exp(-s.dayRaw / DAY_CAP));
    s.dayRaw += base;
    var eff1 = DAY_CAP * (1 - Math.exp(-s.dayRaw / DAY_CAP));
    s.points = Math.min(FULL, (s.points || 0) + (eff1 - eff0));
    s.progress = r3(s.points / FULL) === 1 ? 1 : s.points / FULL;
    s.counts[ev.type] = (s.counts[ev.type] || 0) + 1;
    s.updated = Date.now();
    var lvUp = !state.level && autoLevel(s.progress) > autoLevel(state.progress);
    return { state: s, changed: s.progress > state.progress + 1e-9, gain: s.progress - state.progress,
      stageUp: stage(s).index > before.index, levelUp: lvUp };
  }

  // Сколько «очков дня» уже набрано (для подсказок: «на сегодня отдача почти исчерпана»)
  function today(state, at) {
    var key = dayKey(at ? new Date(at) : new Date());
    var raw = state.day === key ? state.dayRaw : 0;
    var eff = DAY_CAP * (1 - Math.exp(-raw / DAY_CAP));
    return { raw: raw, effective: eff, cap: DAY_CAP, saturation: eff / DAY_CAP };
  }

  /* ------------------------------------------------------------------ параметры формы */

  function params(state, opts) {
    opts = opts || {};
    var pr = clamp(opts.progress != null ? opts.progress : state.progress || 0, 0, 1);
    var mode = opts.mode || GOAL_MODE;
    var a = state.start, b = (state.targets && state.targets[mode]) || state.target;
    // Сначала расправляются плечи и появляется уверенность, затем уходит объём, мышцы — позже.
    var tf = pr, tp = 1 - Math.pow(1 - pr, 2), tm = Math.pow(pr, 1.2), tc = 1 - Math.pow(1 - pr, 1.7);
    return {
      sex: state.sex, skin: state.skin || 0, hair: state.hair || 0, face: faceOf(state),
      fat: lerp(a.fat, b.fat, tf), mus: lerp(a.mus, b.mus, tm),
      pos: lerp(a.pos, b.pos, tp), conf: lerp(a.conf, b.conf, tc),
      leg: clamp((state.height_cm - (state.sex === 'f' ? 164 : 176)) / 5, -4, 4),
      glow: pr, level: levelOf({ level: state.level, progress: pr }, opts)
    };
  }
  function mixP(a, b, t) {
    var o = {}, k;
    for (k in b) o[k] = (typeof b[k] === 'number' && typeof a[k] === 'number' && k !== 'level' && k !== 'skin' && k !== 'hair')
      ? lerp(a[k], b[k], t) : b[k];
    o.level = t < 0.5 ? a.level : b.level;
    return o;
  }

  /* ------------------------------------------------------------------ геометрия */

  function pt(p) { return r1(p[0]) + ' ' + r1(p[1]); }
  // Сглаженный путь Catmull-Rom; точка с третьим элементом = угол (без сглаживания).
  function smooth(pts, closed) {
    var n = pts.length, d = 'M' + pt(pts[0]), segs = closed ? n : n - 1;
    for (var i = 0; i < segs; i++) {
      var p1 = pts[i], p2 = pts[(i + 1) % n];
      var p0 = closed ? pts[(i - 1 + n) % n] : pts[Math.max(i - 1, 0)];
      var p3 = closed ? pts[(i + 2) % n] : pts[Math.min(i + 2, n - 1)];
      var k1 = p1[2] ? 0 : 1 / 6, k2 = p2[2] ? 0 : 1 / 6;
      d += 'C' + pt([p1[0] + (p2[0] - p0[0]) * k1, p1[1] + (p2[1] - p0[1]) * k1]) + ' ' +
        pt([p2[0] - (p3[0] - p1[0]) * k2, p2[1] - (p3[1] - p1[1]) * k2]) + ' ' + pt(p2);
    }
    return d + (closed ? 'Z' : '');
  }
  function mx(p) { return [2 * CX - p[0], p[1], p[2]]; }
  function sym(top, right, bottom) {
    var out = top ? [top] : [];
    out = out.concat(right);
    if (bottom) out.push(bottom);
    return out.concat(right.slice().reverse().map(mx));
  }
  // Конечность: ось + полуширины -> замкнутый контур
  function limb(axis, w, endCap) {
    var A = [], B = [], n = axis.length, i, d0, dn;
    for (i = 0; i < n; i++) {
      var a = axis[Math.max(i - 1, 0)], b = axis[Math.min(i + 1, n - 1)];
      var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.sqrt(dx * dx + dy * dy) || 1;
      var nx = -dy / L, ny = dx / L;
      if (i === 0) d0 = [dx / L, dy / L];
      if (i === n - 1) dn = [dx / L, dy / L];
      var wa = typeof w[i] === 'number' ? w[i] : w[i][0], wb = typeof w[i] === 'number' ? w[i] : w[i][1];
      A.push([axis[i][0] + nx * wa, axis[i][1] + ny * wa]);
      B.push([axis[i][0] - nx * wb, axis[i][1] - ny * wb]);
    }
    var w0 = typeof w[0] === 'number' ? w[0] : (w[0][0] + w[0][1]) / 2, wn = typeof w[n - 1] === 'number' ? w[n - 1] : (w[n - 1][0] + w[n - 1][1]) / 2;
    var cap0 = [axis[0][0] - d0[0] * w0 * 0.9, axis[0][1] - d0[1] * w0 * 0.9];
    var pts;
    if (endCap === 'flat') {
      A[n - 1][2] = 1; B[n - 1][2] = 1;
      pts = [cap0].concat(A, B.reverse());
    } else {
      var cap1 = [axis[n - 1][0] + dn[0] * wn * 0.7, axis[n - 1][1] + dn[1] * wn * 0.7];
      pts = [cap0].concat(A, [cap1], B.reverse());
    }
    return smooth(pts, true);
  }
  function at(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)]; }
  function interpX(list, y) { // list: [[x,y]] сверху вниз
    if (y <= list[0][1]) return list[0][0];
    for (var i = 1; i < list.length; i++) if (y <= list[i][1]) {
      var a = list[i - 1], b = list[i], t = (y - a[1]) / ((b[1] - a[1]) || 1);
      return lerp(a[0], b[0], t);
    }
    return list[list.length - 1][0];
  }
  function star5(cx, cy, r, fill) {
    var d = '', i;
    for (i = 0; i < 10; i++) {
      var ang = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
      d += (i ? 'L' : 'M') + r1(cx + Math.cos(ang) * rr) + ' ' + r1(cy + Math.sin(ang) * rr);
    }
    return '<path d="' + d + 'Z" fill="' + fill + '"/>';
  }
  function el(tag, attrs) {
    var s = '<' + tag;
    for (var k in attrs) s += ' ' + k + '="' + attrs[k] + '"';
    return s + '/>';
  }

  /* ------------------------------------------------------------------ отрисовка */

  function drawBody(P, uid, fx) {
    fx = fx || {};
    var f = P.fat, m = P.mus, p = P.pos, c = P.conf, fem = P.sex === 'f', lv = P.level;
    var F = P.face, skin = SKINS[P.skin] || SKINS[1], hairC = HAIRS[F.hairColor] || HAIRS[0];
    var mm = fem ? 0.6 : 1; // «мышечный» множитель
    var shirt = lv <= 1 ? ['#7a7d84', '#5f6269', '#8d9097'] : lv >= 15 ? ['#3f4a30', '#2f3824', '#55623f'] : ['#5f7046', '#4a5836', '#728553'];
    var shorts = '#2a2d36', shortsHi = '#363a45';
    var O = 'stroke="' + INK + '" stroke-width="2" stroke-linejoin="round"';

    // вертикаль
    var ground = 304, ankle = 290;
    var crotch = ankle - (58 + P.leg);
    var band = crotch - 30;
    var sh = band - 76 + (1 - p) * 5;
    var hy = sh - 41 + (1 - p) * 2;
    var rx = 36 + 5 * f, ry = 38 + 3 * f;
    P.headY = hy;                          // для крупного плана головы (svg с opts.head)
    var hem = band + 8;
    // горизонталь (полуширины)
    var S = (fem ? 32 : 37) + (fem ? 6 : 12) * m + 7 * f + 4 * p;
    var C = S - 3 + 3 * m * mm + 4 * f;
    var W = (fem ? 24 : 28) + 30 * f - (fem ? 2 : 4) * m;
    var Bl = (fem ? 26 : 29) + 38 * f;
    var H = (fem ? 33 : 29) + 22 * f;
    var Hm = Math.max(Bl * 0.92, H + 1.5);
    var nw = 10 + 3 * f;

    var slump = 1 - p;
    var torsoR = [[CX + nw, sh - 3, 1], [CX + S - 9, sh - 1 - 1.5 * p + 2 * slump], [CX + S, sh + 9 + 5 * slump],
      [CX + C, sh + 24], [CX + W, sh + 47], [CX + Bl, sh + 63], [CX + Hm, hem, 1]];
    var tx = function (y) { return interpX(torsoR, y) - CX + 1.5; };

    // руки (правая; левая — зеркалом)
    var ua = (fem ? 7 : 8) + 4.5 * f + (fem ? 3 : 6.5) * m;
    var fa = (fem ? 5.8 : 6.5) + 3.5 * f + (fem ? 1.5 : 3) * m;
    var shJ = [CX + S - 7, sh + 12 + 4 * slump];
    var elY = sh + 46, wrY = sh + 80;
    var elX = Math.max(CX + S - 2 + 2 * m, CX + tx(elY) + ua + 1);
    var wrX = Math.max(elX + 1.5, CX + Math.max(tx(wrY), tx(wrY - 12)) + fa + 2.5);
    var elb = [elX, elY], wr = [wrX, wrY];
    var armAxis = [shJ, at(shJ, elb, 0.5), elb, at(elb, wr, 0.5), wr];
    var armW = [[ua + 1, ua + 3.5 + 2 * m * mm], [ua + 0.5 + 2.5 * m * mm, ua + 1 + 1.5 * m * mm], [fa + 0.8 + f, fa + 1 + f], [fa + 0.5 + 1.5 * m * mm, fa + 1 + 1.5 * m * mm], [fa - 0.8, fa - 0.6]];
    var slT = fem ? 0.42 : 0.55;
    var sleeve = limb([at(shJ, elb, -0.05), at(shJ, elb, slT * 0.5), at(shJ, elb, slT)], [[ua + 2, ua + 5 + 2 * m * mm], [ua + 2 + 1.5 * m * mm, ua + 3.5 + 1.5 * m * mm], [ua + 2 + 2.2 * m * mm, ua + 2.6 + 2 * m * mm]], 'flat');
    var handR = (fem ? 6.6 : 7.6) + 1.6 * f;
    var hand = [wrX + 0.6, wrY + handR * 0.85];

    // ноги
    var lx = CX + 11 + 9 * f + (fem ? 2 : 0);
    var th = 10.5 + 8 * f + 3 * m * mm + (fem ? 1 : 0);
    var kw = 7.5 + 4 * f + 1.5 * m, cw = 8 + 5 * f + 3 * m * mm, aw = 5.3 + 1.8 * f;
    var legLen = ankle - crotch;
    var hipJ = [lx, crotch - 8], knee = [lx + 0.6, crotch + legLen * 0.5], calf = [lx + 1, crotch + legLen * 0.68], ank = [lx + 0.6, ankle - 2];
    var legAxis = [hipJ, at(hipJ, knee, 0.5), knee, calf, ank];
    var legW = [th, th - 1, kw, cw, aw];

    var mirror = 'transform="matrix(-1 0 0 1 ' + VBW + ' 0)"';
    var out = [];

    // defs
    out.push('<defs>' +
      '<linearGradient id="sh' + uid + '" x1="0" x2="1"><stop offset="0" stop-color="' + shirt[1] + '"/><stop offset=".45" stop-color="' + shirt[2] + '"/><stop offset="1" stop-color="' + shirt[1] + '"/></linearGradient>' +
      '<radialGradient id="hd' + uid + '" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="' + lighten(skin[0]) + '"/><stop offset=".7" stop-color="' + skin[0] + '"/><stop offset="1" stop-color="' + skin[1] + '"/></radialGradient>' +
      '<radialGradient id="ha' + uid + '" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="' + (lv >= 15 ? FIRE : GOLD) + '" stop-opacity=".55"/><stop offset=".55" stop-color="' + GOLD + '" stop-opacity=".18"/><stop offset="1" stop-color="' + GOLD + '" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="gd' + uid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + GOLD2 + '"/><stop offset="1" stop-color="#b8955a"/></linearGradient>' +
      '</defs>');

    // фон: ореол и тень
    if (P.bg !== false) {
      var haloOp = clamp(0.35 + 0.45 * P.glow + (fx.flash || 0) * 0.5, 0, 1);
      out.push(el('circle', { cx: CX, cy: 178, r: 112 + 8 * P.glow, fill: 'url(#ha' + uid + ')', opacity: r1(haloOp * 100) / 100 }));
      if (lv >= 15) out.push(el('circle', { cx: CX, cy: 178, r: 104, fill: 'none', stroke: GOLD, 'stroke-opacity': '.35', 'stroke-width': 1.5, 'stroke-dasharray': '2 6' }));
    }
    // волна от фигуры (позади неё) — при росте прогресса
    if (fx.ring != null && fx.ring < 1) {
      var rt = fx.ring;
      out.push(el('ellipse', { cx: CX, cy: 170, rx: r1(70 + 70 * rt), ry: r1(105 + 60 * rt), fill: 'none', stroke: GOLD2, 'stroke-width': r1(3.5 * (1 - rt) + 0.5), opacity: r1((1 - rt) * 0.6 * 100) / 100 }));
    }
    out.push(el('ellipse', { cx: CX, cy: ground + 1, rx: r1(Math.max(Hm, wrX - CX) + 20), ry: 7, fill: '#000', opacity: '.45' }));

    var bodyT = fx.pump ? 'transform="translate(' + CX + ' ' + ground + ') scale(' + r1((1 + fx.pump * 0.035) * 1000) / 1000 + ') translate(' + (-CX) + ' ' + (-ground) + ')"' : '';
    out.push('<g ' + bodyT + '>');

    // волосы позади головы (хвост, длинные, каре, пучок, кудри)
    out.push(hairBack(F, hy, rx, ry, hairC, O));

    // ноги
    var legSvg = '<path d="' + limb(legAxis, legW) + '" fill="' + skin[0] + '" ' + O + '/>';
    // носки и кроссовки
    legSvg += '<path d="M' + r1(lx - aw - 0.8) + ' ' + (ankle - 7) + 'h' + r1(2 * aw + 2.2) + 'v6h-' + r1(2 * aw + 2.2) + 'z" fill="#ece8df" ' + O + '/>';
    var sx = lx + 0.6, shoe = smooth([[sx - 8.5, ankle - 2, 1], [sx + 4, ankle - 3], [sx + 11, ankle + 3], [sx + 15, ground - 4],
      [sx + 13.5, ground, 1], [sx - 9.5, ground, 1], [sx - 10, ankle + 4]], true);
    legSvg += '<path d="' + shoe + '" fill="#e9e3d6" ' + O + '/>';
    legSvg += '<path d="M' + r1(sx - 9.5) + ' ' + (ground - 3.5) + 'H' + r1(sx + 14.5) + '" stroke="' + (lv >= 5 ? GOLD : '#a9a49a') + '" stroke-width="2.4"/>';
    legSvg += '<path d="M' + r1(sx - 2) + ' ' + (ankle + 1) + 'l7 2" stroke="' + INK + '" stroke-width="1.2" opacity=".5"/>';
    out.push(legSvg, '<g ' + mirror + '>' + legSvg + '</g>');

    // шорты / лосины
    if (fem) {
      var legAxisF = [hipJ, at(hipJ, knee, 0.5), knee, at(knee, calf, 0.7)];
      var legging = '<path d="' + limb(legAxisF, [th + 1, th, kw + 1, kw + 0.5 + 0.7 * (cw - kw)], 'flat') + '" fill="' + shorts + '" ' + O + '/>';
      legging += '<path d="M' + r1(lx + th - 2.5) + ' ' + r1(crotch - 4) + 'L' + r1(knee[0] + kw - 1.5) + ' ' + r1(knee[1] + 6) + '" stroke="' + (lv >= 5 ? GOLD : shortsHi) + '" stroke-width="1.8" opacity=".9"/>';
      out.push(legging, '<g ' + mirror + '>' + legging + '</g>');
      out.push('<path d="' + smooth(sym([CX, band], [[CX + H - 1, band, 1], [CX + H + 1 + 2 * f, band + 14], [lx + th + 0.5, crotch + 4, 1], [CX + 1, crotch + 4, 1]], [CX, crotch + 3, 1]), true) +
        '" fill="' + shorts + '" ' + O + '/>');
    } else {
      var outer = lx + th + 2.5, inner = Math.max(CX + 1.5, lx - th - 1);
      out.push('<path d="' + smooth(sym([CX, band], [[CX + H - 1, band, 1], [CX + H + 1.5 + 2 * f, band + 13], [outer, crotch + 14, 1], [inner, crotch + 14, 1]], [CX, crotch + 4, 1]), true) +
        '" fill="' + shorts + '" ' + O + '/>');
      var stripe = '<path d="M' + r1(CX + H + 0.8 + f) + ' ' + (band + 4) + 'L' + r1(outer - 1.5) + ' ' + r1(crotch + 12) + '" stroke="' + (lv >= 5 ? GOLD : shortsHi) + '" stroke-width="2.2"/>';
      out.push(stripe, '<g ' + mirror + '>' + stripe + '</g>');
    }
    // ремень
    if (lv >= 7) {
      out.push('<path d="M' + r1(CX - H - 0.5) + ' ' + (band + 1) + 'Q' + CX + ' ' + (band + 4) + ' ' + r1(CX + H + 0.5) + ' ' + (band + 1) + '" stroke="#1d1a17" stroke-width="5" fill="none"/>');
    }

    // руки
    var armSvg = '<path d="' + limb(armAxis, armW) + '" fill="' + skin[0] + '" ' + O + '/>';
    if (m > 0.4) {
      var a1 = at(shJ, elb, 0.62), op = r1(clamp((m - 0.4) * 2, 0, 1) * 10) / 10;
      armSvg += '<path d="M' + r1(a1[0] - ua * 0.55) + ' ' + r1(a1[1] - 2) + 'q' + r1(ua * 0.6) + ' ' + 5 + ' ' + r1(ua * 1.1) + ' ' + 1 + '" fill="none" stroke="' + skin[1] + '" stroke-width="1.6" stroke-linecap="round" opacity="' + op + '"/>';
    }
    out.push(armSvg, '<g ' + mirror + '>' + armSvg + '</g>');
    // рукава (под торсом — плечевой шов даёт контур торса)
    var sleeveSvg = '<path d="' + sleeve + '" fill="url(#sh' + uid + ')" ' + O + '/>';
    if (lv >= 15) {
      var se = at(shJ, elb, slT);
      sleeveSvg += el('circle', { cx: r1(se[0]), cy: r1(se[1] - 1), r: 1.6, fill: GOLD });
    }
    out.push(sleeveSvg, '<g ' + mirror + '>' + sleeveSvg + '</g>');

    // шея
    out.push('<path d="M' + r1(CX - nw + 1.5) + ' ' + r1(hy + ry - 10) + 'V' + r1(sh + 8) + 'H' + r1(CX + nw - 1.5) + 'V' + r1(hy + ry - 10) + 'Z" fill="' + skin[1] + '" ' + O + '/>');

    // торс (футболка)
    var torso = sym([CX, sh + 6], torsoR, [CX, hem + 2 + 5 * f]);
    out.push('<path d="' + smooth(torso, true) + '" fill="url(#sh' + uid + ')" ' + O + '/>');
    // ворот
    out.push('<path d="M' + r1(CX - nw) + ' ' + r1(sh - 3) + 'Q' + CX + ' ' + r1(sh + 15) + ' ' + r1(CX + nw) + ' ' + r1(sh - 3) + '" fill="none" stroke="' + (lv >= 15 ? GOLD : shirt[1]) + '" stroke-width="3" stroke-linecap="round"/>');
    // рельеф груди (муж.) / мягкая складка (жен.)
    if (!fem && m > 0.3) {
      var pop = r1(clamp((m - 0.3) / 0.5, 0, 1) * 0.6 * 10) / 10;
      var pec = 'M' + (CX - 2) + ' ' + r1(sh + 15) + 'Q' + (CX - 2) + ' ' + r1(sh + 32) + ' ' + r1(CX + C * 0.68) + ' ' + r1(sh + 29);
      out.push('<path d="' + pec + '" fill="none" stroke="' + shirt[1] + '" stroke-width="1.8" stroke-linecap="round" opacity="' + pop + '"/>');
      out.push('<path d="' + pec + '" ' + mirror + ' fill="none" stroke="' + shirt[1] + '" stroke-width="1.8" stroke-linecap="round" opacity="' + pop + '"/>');
    }
    // складка ткани на животе — мягкая тень, без «смешных» деталей
    if (f > 0.35) {
      out.push('<path d="M' + r1(CX - Bl * 0.55) + ' ' + r1(hem - 6) + 'Q' + CX + ' ' + r1(hem + 1 + 4 * f) + ' ' + r1(CX + Bl * 0.55) + ' ' + r1(hem - 6) + '" fill="none" stroke="' + shirt[1] + '" stroke-width="1.6" stroke-linecap="round" opacity="' + r1((f - 0.35) * 10) / 10 + '"/>');
    }
    // эмблема на груди
    if (lv >= 2) {
      var ex = CX - C * 0.45, ey = sh + 22;
      out.push('<path d="M' + r1(ex - 4) + ' ' + r1(ey - 2) + 'l4 3l4 -3M' + r1(ex - 4) + ' ' + r1(ey + 1.5) + 'l4 3l4 -3" fill="none" stroke="' + GOLD + '" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>');
    }
    // жетон
    if (lv >= 3) {
      out.push('<path d="M' + r1(CX - nw + 2) + ' ' + r1(sh - 1) + 'Q' + (CX - 3) + ' ' + r1(sh + 16) + ' ' + CX + ' ' + r1(sh + 20) + 'Q' + (CX + 3) + ' ' + r1(sh + 16) + ' ' + r1(CX + nw - 2) + ' ' + r1(sh - 1) + '" fill="none" stroke="#c8c3b8" stroke-width="1" stroke-dasharray="1.6 1.2"/>');
      out.push('<rect x="' + (CX - 3.5) + '" y="' + r1(sh + 19) + '" width="7" height="9.5" rx="2" fill="' + (lv >= 10 ? 'url(#gd' + uid + ')' : '#c9ccd2') + '" stroke="' + INK + '" stroke-width="1"/>');
    }
    // медали
    if (lv >= 10) {
      var mxp = CX + C * 0.48, myp = sh + 20;
      out.push(medal(mxp, myp, uid));
      if (lv >= 13) out.push(medal(mxp - 11, myp, uid, true));
    }

    // погоны
    if (lv >= 6) { var ep = epaulette(lv, nw, S, sh + 3 * slump, f, uid); out.push(ep, '<g ' + mirror + '>' + ep + '</g>'); }

    // кисти
    var handSvg = el('ellipse', { cx: r1(hand[0]), cy: r1(hand[1]), rx: r1(handR), ry: r1(handR * 1.08), fill: skin[0], stroke: INK, 'stroke-width': 2 });
    out.push(handSvg, '<g ' + mirror + '>' + handSvg + '</g>');
    // напульсник (на одной руке)
    if (lv >= 4) {
      var fd = Math.atan2(wr[1] - elb[1], wr[0] - elb[0]) * 180 / Math.PI - 90;
      out.push('<g ' + mirror + '><rect x="' + r1(wr[0] - fa - 1.2) + '" y="' + r1(wr[1] - 6) + '" width="' + r1(2 * fa + 2.4) + '" height="6" rx="2" fill="' + (lv >= 15 ? FIRE : GOLD) + '" stroke="' + INK + '" stroke-width="1.4" transform="rotate(' + r1(fd) + ' ' + r1(wr[0]) + ' ' + r1(wr[1] - 3) + ')"/></g>');
    }

    // голова
    out.push(head(P, uid, { hy: hy, rx: rx, ry: ry, f: f, m: m, p: p, c: c, fem: fem, skin: skin, hairC: hairC, O: O, lv: lv, F: F }));
    out.push('</g>');
    return out.join('');
  }

  function lighten(hex) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    r = Math.min(255, r + 14); g = Math.min(255, g + 12); b = Math.min(255, b + 10);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }

  function medal(x, y, uid, second) {
    return '<rect x="' + r1(x - 4) + '" y="' + r1(y - 4) + '" width="8" height="6" fill="' + (second ? '#2f5d8a' : '#a3262e') + '" stroke="' + INK + '" stroke-width=".9"/>' +
      '<path d="M' + r1(x - 1.3) + ' ' + r1(y - 4) + 'v6M' + r1(x + 1.3) + ' ' + r1(y - 4) + 'v6" stroke="' + GOLD + '" stroke-width=".9"/>' +
      el('circle', { cx: r1(x), cy: r1(y + 6.5), r: 4.2, fill: 'url(#gd' + uid + ')', stroke: INK, 'stroke-width': 1 }) +
      star5(x, y + 6.5, 2.4, '#8a6a32');
  }

  function epaulette(lv, nw, S, sh, f, uid) {
    var x0 = CX + nw + 3, x1 = CX + S - 2;
    var gold = lv >= 15;
    var d = smooth([[x0, sh - 3.5, 1], [x1 - 1, sh + 0.5], [x1 + 0.5, sh + 4.5, 1], [x1 - 1, sh + 7.5, 1], [x0, sh + 3.5, 1]], true);
    var s = '<path d="' + d + '" fill="' + (gold ? 'url(#gd' + uid + ')' : '#2e3a23') + '" stroke="' + (gold ? INK : GOLD) + '" stroke-width="1.2"/>';
    var len = x1 - x0, i, n;
    if (lv <= 8) { // лычки
      n = lv - 5;
      for (i = 0; i < n; i++) {
        var lx = x0 + len * (0.62 - i * 0.16);
        s += '<path d="M' + r1(lx) + ' ' + r1(sh - 2.2 + (lx - x0) / len * 3.5) + 'v' + 5.4 + '" stroke="' + GOLD + '" stroke-width="2"/>';
      }
    } else if (lv <= 11) { // просвет + малые звёзды
      n = lv - 8;
      s += '<path d="M' + r1(x0 + 1) + ' ' + r1(sh + 0.2) + 'L' + r1(x1 - 1.5) + ' ' + r1(sh + 3.8) + '" stroke="' + GOLD + '" stroke-width="1" opacity=".8"/>';
      for (i = 0; i < n; i++) {
        var sx = x0 + len * (0.35 + i * 0.22);
        s += star5(sx, sh + (sx - x0) / len * 3.6 + 0.3, 2.1, GOLD2);
      }
    } else if (lv <= 14) { // два просвета + крупные звёзды
      n = lv - 11;
      s += '<path d="M' + r1(x0 + 1) + ' ' + r1(sh - 1) + 'L' + r1(x1 - 1.5) + ' ' + r1(sh + 2.6) + 'M' + r1(x0 + 1) + ' ' + r1(sh + 1.6) + 'L' + r1(x1 - 1.5) + ' ' + r1(sh + 5.2) + '" stroke="' + GOLD + '" stroke-width=".9" opacity=".8"/>';
      for (i = 0; i < n; i++) {
        var bx = x0 + len * (0.3 + i * 0.25);
        s += star5(bx, sh + (bx - x0) / len * 3.6 + 0.3, 2.8, GOLD2);
      }
    } else {
      s += star5(x0 + len * 0.55, sh + 2.2, 3.3, FIRE);
    }
    return s;
  }

  // Волосы позади головы и фигуры: хвост, длинные, каре, пучок, объём кудрей
  function hairBack(F, hy, rx, ry, hairC, O) {
    var st = F.hair, s = '';
    if (st === 5) { // хвост
      s += '<path d="' + smooth([[CX + rx * 0.4, hy - ry * 0.92], [CX + rx + 10, hy - ry * 0.78], [CX + rx + 20, hy - ry * 0.25],
        [CX + rx + 21, hy + 18], [CX + rx + 13, hy + 42], [CX + rx + 9, hy + 50, 1], [CX + rx + 6, hy + 30], [CX + rx + 3, hy + 6], [CX + rx - 4, hy - ry * 0.3]], true) +
        '" fill="' + hairC + '" ' + O + '/>';
    } else if (st === 4) { // длинные распущенные — до плеч
      s += '<path d="' + smooth(sym([CX, hy - ry - 5], [[CX + rx * 0.9, hy - ry * 0.72], [CX + rx + 8, hy - 2], [CX + rx + 10, hy + 30], [CX + rx + 7, hy + 56], [CX + rx - 6, hy + 62, 1]],
        [CX, hy + 40]), true) + '" fill="' + hairC + '" ' + O + '/>';
    } else if (st === 7) { // каре — до подбородка
      s += '<path d="' + smooth(sym([CX, hy - ry - 5], [[CX + rx * 0.9, hy - ry * 0.74], [CX + rx + 8, hy - 4], [CX + rx + 8, hy + ry * 0.62], [CX + rx - 2, hy + ry * 0.9, 1]],
        [CX, hy + ry * 0.55]), true) + '" fill="' + hairC + '" ' + O + '/>';
    } else if (st === 6) { // пучок — сзади сверху
      s += el('circle', { cx: r1(CX + rx * 0.5), cy: r1(hy - ry * 0.86), r: 12.5, fill: hairC, stroke: INK, 'stroke-width': 2 });
      s += '<path d="M' + r1(CX + rx * 0.5 - 6) + ' ' + r1(hy - ry * 0.86 - 4) + 'q6 -5 12 1" fill="none" stroke="#0004" stroke-width="1.6" stroke-linecap="round"/>';
    } else if (st === 3) { // кудри: объём вокруг верха головы
      var cs = [], i, a;
      for (i = 0; i <= 10; i++) { a = Math.PI * (1.05 + 0.9 * i / 10); cs.push([CX + Math.cos(a) * (rx + 3), hy - 4 + Math.sin(a) * (ry + 3)]); }
      cs.push([CX - rx - 2, hy + 6], [CX + rx + 2, hy + 6]);
      for (i = 0; i < cs.length; i++) s += el('circle', { cx: r1(cs[i][0]), cy: r1(cs[i][1]), r: 10.5, fill: hairC, stroke: INK, 'stroke-width': 4 });
      for (i = 0; i < cs.length; i++) s += el('circle', { cx: r1(cs[i][0]), cy: r1(cs[i][1]), r: 10.5, fill: hairC });
    }
    return s;
  }

  // Волосы спереди (поверх головы)
  function hairFront(F, hy, rx, ry, hairC, O, lv) {
    var st = F.hair, d, s = '';
    if (st === 8) return '<path d="M' + r1(CX - rx * 0.35) + ' ' + r1(hy - ry * 0.72) + 'q10 -8 22 -5" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="3" stroke-linecap="round"/>';
    if (st === 4 || st === 5 || st === 6 || st === 7) {
      d = smooth(sym([CX, hy - ry - 4], [[CX + rx * 0.84, hy - ry * 0.76 - 2], [CX + rx + 3, hy - ry * 0.12], [CX + rx + 1.5, hy + 11, 1],
        [CX + rx - 5, hy - 3], [CX + rx * 0.62, hy - ry * 0.46]], [CX, hy - ry * 0.58]), true);
    } else if (st === 1) { // ёжик
      d = smooth(sym([CX, hy - ry - 1], [[CX + rx * 0.8, hy - ry * 0.8], [CX + rx * 0.99, hy - ry * 0.32], [CX + rx * 0.96, hy - ry * 0.18, 1],
        [CX + rx * 0.66, hy - ry * 0.62]], [CX, hy - ry * 0.74]), true);
    } else if (st === 2) { // чёлка набок
      d = smooth([[CX - rx - 1, hy - 4, 1], [CX - rx * 0.92, hy - ry * 0.7], [CX - rx * 0.2, hy - ry - 5], [CX + rx * 0.82, hy - ry * 0.8], [CX + rx + 2, hy - ry * 0.2],
        [CX + rx + 0.5, hy - 2, 1], [CX + rx * 0.6, hy - ry * 0.2], [CX + rx * 0.05, hy - ry * 0.3], [CX - rx * 0.45, hy - ry * 0.5], [CX - rx * 0.8, hy - ry * 0.42]], true);
    } else { // короткая (0) и основа кудрей (3)
      d = smooth(sym([CX, hy - ry - 4], [[CX + rx * 0.82, hy - ry * 0.78 - 2], [CX + rx + 1.5, hy - ry * 0.22], [CX + rx, hy - 5, 1],
        [CX + rx - 4.5, hy - ry * 0.34], [CX + rx * 0.5, hy - ry * 0.52]], [CX, hy - ry * 0.56]), true);
    }
    if (st === 3) { // кудри: волнистая линия роста (контур снизу), шапка без контура сливается с объёмом
      var hl = [], q;
      for (q = 0; q <= 6; q++) { var tq = q / 6, aq = Math.PI * (1.08 + 0.84 * tq); hl.push([CX + Math.cos(aq) * rx * 0.93, hy - ry * 0.18 + Math.sin(aq) * ry * 0.42]); }
      for (q = 0; q < hl.length; q++) s += el('circle', { cx: r1(hl[q][0]), cy: r1(hl[q][1]), r: 6.8, fill: hairC, stroke: INK, 'stroke-width': 3.6 });
      s += '<path d="' + d + '" fill="' + hairC + '"/>';
      for (q = 0; q < hl.length; q++) s += el('circle', { cx: r1(hl[q][0]), cy: r1(hl[q][1]), r: 6.8, fill: hairC });
    } else s += '<path d="' + d + '" fill="' + hairC + '" ' + (st === 1 ? 'stroke="' + INK + '" stroke-width="1.3" stroke-linejoin="round" opacity=".88"' : O) + '/>';
    if (st === 2) s += '<path d="M' + r1(CX - rx * 0.4) + ' ' + r1(hy - ry * 0.78) + 'Q' + r1(CX + rx * 0.2) + ' ' + r1(hy - ry * 0.7) + ' ' + r1(CX + rx * 0.62) + ' ' + r1(hy - ry * 0.4) + '" fill="none" stroke="#0003" stroke-width="1.5" stroke-linecap="round"/>';
    if (st === 3) { // завитки
      var cu = [[-0.55, -0.62], [-0.15, -0.8], [0.25, -0.74], [0.6, -0.55], [-0.3, -0.6], [0.1, -0.6]];
      for (var i = 0; i < cu.length; i++) {
        var x = CX + cu[i][0] * rx, y = hy + cu[i][1] * ry;
        s += '<path d="M' + r1(x - 3.5) + ' ' + r1(y + 1) + 'q1 -5 5 -3.5q3 2 -0.5 4.5" fill="none" stroke="#0005" stroke-width="1.6" stroke-linecap="round"/>';
      }
    }
    if (st === 5) s += el('ellipse', { cx: r1(CX + rx + 6), cy: r1(hy - ry * 0.62), rx: 3.2, ry: 4.5, fill: lv >= 15 ? FIRE : GOLD, stroke: INK, 'stroke-width': 1.3 });
    return s;
  }

  function head(P, uid, g) {
    var hy = g.hy, rx = g.rx, ry = g.ry, f = g.f, m = g.m, p = g.p, c = g.c, fem = g.fem, skin = g.skin, O = g.O, lv = g.lv, F = g.F;
    var out = [];
    // уши
    var ear = el('ellipse', { cx: r1(CX + rx - 1), cy: r1(hy + 4), rx: 6.5, ry: 8, fill: skin[0], stroke: INK, 'stroke-width': 2 }) +
      '<path d="M' + r1(CX + rx + 1) + ' ' + r1(hy + 1) + 'q2 3 0 6" fill="none" stroke="' + skin[1] + '" stroke-width="1.6" stroke-linecap="round"/>';
    out.push(ear, '<g transform="matrix(-1 0 0 1 ' + VBW + ' 0)">' + ear + '</g>');
    // голова: форма лица — овал, круглое, квадратное, сердечком
    var shp = F.shape, jk = [1, 1.22, 1.32, 0.8][shp] || 1;
    var jw = rx * (0.52 + 0.2 * f + (fem ? 0 : 0.1 * m)) * jk;
    var sd2 = [[0.95 + 0.03 * f, 0.42], [1.0 + 0.03 * f, 0.5], [0.99 + 0.02 * f, 0.62], [0.9 + 0.03 * f, 0.34]][shp] || [0.95, 0.42];
    var chin = [1, 0.97, 0.97, 1.03][shp] || 1;
    var hd = sym([CX, hy - ry], [[CX + rx * 0.78, hy - ry * 0.72], [CX + rx, hy - 2], [CX + rx * sd2[0], hy + ry * sd2[1]], [CX + jw, hy + ry * (shp === 2 ? 0.9 : 0.84), shp === 2 ? 1 : 0]],
      [CX, hy + ry * chin]);
    out.push('<path d="' + smooth(hd, true) + '" fill="url(#hd' + uid + ')" ' + O + '/>');

    // волосы
    out.push(hairFront(F, hy, rx, ry, g.hairC, O, lv));

    // лицо
    var fy = hy + (1 - p) * 2.5;
    var exo = 13 + 2 * f, ey = fy + 3;
    var big = F.eyes === 3 ? 1.18 : 1;
    var erx = (fem ? 4.4 : 4.1) * big, ery = (fem ? 5.6 : 5.2) * big;
    var EC = EYE_COLORS[F.eyeColor] || EYE_COLORS[0];
    var my = fy + 18 + 2 * f;
    // борода — под ртом и усами
    if (!fem && F.beard) out.push(beard(F.beard, hy, rx, ry, jw, sd2, chin, fy, my, g.hairC));
    for (var sd = -1; sd <= 1; sd += 2) {
      var ex = CX + sd * exo;
      if (F.eyes === 2) { // весёлые — дугой
        out.push('<path d="M' + r1(ex - 4.6) + ' ' + r1(ey + 1.2) + 'Q' + r1(ex) + ' ' + r1(ey - 5.2) + ' ' + r1(ex + 4.6) + ' ' + r1(ey + 1.2) + '" fill="none" stroke="#231a17" stroke-width="2.6" stroke-linecap="round"/>');
      } else if (F.eyes === 1) { // миндаль: белок, радужка, зрачок
        var lens = 'M' + r1(ex - erx * 1.45) + ' ' + r1(ey + 0.5) + 'Q' + r1(ex) + ' ' + r1(ey - ery * 1.75) + ' ' + r1(ex + erx * 1.45) + ' ' + r1(ey + 0.5) + 'Q' + r1(ex) + ' ' + r1(ey + ery * 1.35) + ' ' + r1(ex - erx * 1.45) + ' ' + r1(ey + 0.5) + 'Z';
        var cid = 'ey' + uid + (sd < 0 ? 'l' : 'r');
        out.push('<clipPath id="' + cid + '"><path d="' + lens + '"/></clipPath><path d="' + lens + '" fill="#fff"/>' +
          '<g clip-path="url(#' + cid + ')">' + el('circle', { cx: r1(ex), cy: r1(ey - 0.3), r: r1(erx * 1.02), fill: EC }) +
          el('circle', { cx: r1(ex), cy: r1(ey - 0.1), r: r1(erx * 0.52), fill: '#140d0b' }) + '</g>' +
          '<path d="' + lens + '" fill="none" stroke="#231a17" stroke-width="1.5"/>' +
          el('circle', { cx: r1(ex - 1.2), cy: r1(ey - 1.8), r: 1.3, fill: '#fff' }));
      } else { // круглые (0) и большие (3)
        out.push(el('ellipse', { cx: r1(ex), cy: r1(ey), rx: r1(erx), ry: r1(ery), fill: EC }));
        if (F.eyeColor) out.push(el('ellipse', { cx: r1(ex), cy: r1(ey + 0.4), rx: r1(erx * 0.55), ry: r1(ery * 0.58), fill: '#140d0b' }));
        out.push(el('circle', { cx: r1(ex - 1.3 * big), cy: r1(ey - 1.9 * big), r: r1(1.6 * big), fill: '#fff' }));
        out.push(el('circle', { cx: r1(ex + 1.4 * big), cy: r1(ey + 1.6 * big), r: r1(0.8 * big), fill: '#fff', opacity: '.8' }));
      }
      if (fem && F.eyes !== 2) out.push('<path d="M' + r1(ex + sd * 3.2 * big) + ' ' + r1(ey - 4.2 * big) + 'l' + r1(sd * 2.6) + ' -2.2" stroke="#231a17" stroke-width="1.5" stroke-linecap="round"/>');
      // брови: неуверенность — внутренние концы приподняты, уверенность — ровные (форма своя, настроение — от пути)
      var bi = [CX + sd * (8 + f), fy - 8.5 - 2.6 * (1 - c) + (fem ? 0.2 : 0.6) * c];
      var bo = [CX + sd * (20 + 2 * f), fy - 10 + 0.6 * (1 - c) - 0.6 * c];
      var bw = [fem ? 2.2 : 2.8, 1.5, fem ? 3.6 : 4.4, fem ? 2.6 : 3.2][F.brows] || 2.8, arc = F.brows === 3 ? 0.4 : F.brows === 1 ? 2.8 : 2.2;
      out.push('<path d="M' + r1(bi[0]) + ' ' + r1(bi[1]) + 'Q' + r1((bi[0] + bo[0]) / 2) + ' ' + r1(Math.min(bi[1], bo[1]) - arc) + ' ' + r1(bo[0]) + ' ' + r1(bo[1]) + '" fill="none" stroke="' + g.hairC + '" stroke-width="' + bw + '" stroke-linecap="round"/>');
      // румянец (под густой бородой не видно)
      if (fem || F.beard < 2) out.push(el('ellipse', { cx: r1(CX + sd * (21 + 3 * f)), cy: r1(fy + 13), rx: r1(5.5 + 2 * f), ry: r1(3.4 + 1.2 * f), fill: '#ff8a78', opacity: '.33' }));
    }
    // веснушки
    if (F.freckles) {
      var fr = [[7, 8], [11, 10.2], [9, 12.6], [14, 7.6], [4.5, 11.5]];
      for (var k = 0; k < fr.length; k++) for (var s2 = -1; s2 <= 1; s2 += 2)
        out.push(el('circle', { cx: r1(CX + s2 * fr[k][0]), cy: r1(fy + fr[k][1]), r: 1.15, fill: '#a5603f', opacity: '.7' }));
    }
    // нос
    if (F.nose === 1) out.push(el('circle', { cx: r1(CX - 2), cy: r1(fy + 10.6), r: 1.05, fill: skin[1] }) + el('circle', { cx: r1(CX + 2), cy: r1(fy + 10.6), r: 1.05, fill: skin[1] }));
    else if (F.nose === 2) out.push('<path d="M' + r1(CX + 0.5) + ' ' + r1(fy + 3) + 'Q' + r1(CX + 3.2) + ' ' + r1(fy + 9) + ' ' + r1(CX + 1.2) + ' ' + r1(fy + 11.2) + 'Q' + r1(CX - 1) + ' ' + r1(fy + 12.2) + ' ' + r1(CX - 3) + ' ' + r1(fy + 10.8) + '" fill="none" stroke="' + skin[1] + '" stroke-width="1.8" stroke-linecap="round"/>');
    else if (F.nose === 3) out.push(el('ellipse', { cx: CX, cy: r1(fy + 9.6), rx: 3.6, ry: 2.8, fill: skin[1], opacity: '.6' }) + el('circle', { cx: r1(CX - 1), cy: r1(fy + 8.7), r: 0.9, fill: '#fff', opacity: '.55' }));
    else out.push('<path d="M' + (CX - 2.5) + ' ' + r1(fy + 9.5) + 'Q' + CX + ' ' + r1(fy + 12) + ' ' + (CX + 2.5) + ' ' + r1(fy + 9.5) + '" fill="none" stroke="' + skin[1] + '" stroke-width="1.8" stroke-linecap="round"/>');
    // рот: форма своя; у «Улыбки» и «С ямочками» улыбка становится увереннее по пути
    var openA = F.mouth === 1 ? 1 : F.mouth === 0 ? clamp((c - 0.55) / 0.3, 0, 1) : 0;
    var mw = 4.5 + 4 * c, dep = 2.5 + 3 * c;
    if (F.mouth === 2) {
      out.push('<path d="M' + r1(CX - 6.5) + ' ' + r1(my + 0.5) + 'Q' + r1(CX + 0.5) + ' ' + r1(my + 4.5 + 1.5 * c) + ' ' + r1(CX + 7.5) + ' ' + r1(my - 2.2) + '" fill="none" stroke="#6b3a2e" stroke-width="2.3" stroke-linecap="round"/>');
    } else {
      if (openA < 1) out.push('<path d="M' + r1(CX - mw) + ' ' + r1(my) + 'Q' + CX + ' ' + r1(my + dep * 2) + ' ' + r1(CX + mw) + ' ' + r1(my) + '" fill="none" stroke="#6b3a2e" stroke-width="2.3" stroke-linecap="round" opacity="' + r1((1 - openA) * 100) / 100 + '"/>');
      if (F.mouth === 3) for (var s3 = -1; s3 <= 1; s3 += 2)
        out.push('<path d="M' + r1(CX + s3 * (mw + 1.8)) + ' ' + r1(my - 2) + 'q' + r1(s3 * 1.2) + ' 1.8 0 3.4" fill="none" stroke="' + skin[1] + '" stroke-width="1.4" stroke-linecap="round"/>');
      if (openA > 0) {
        var cc = F.mouth === 1 ? Math.max(c, 0.6) : c;
        var mw2 = 7 + 3 * cc, d2 = 4.5 + 3 * cc, mouthD = 'M' + r1(CX - mw2) + ' ' + r1(my - 1) + 'Q' + CX + ' ' + r1(my - 0.2) + ' ' + r1(CX + mw2) + ' ' + r1(my - 1) + 'Q' + CX + ' ' + r1(my + d2 * 2) + ' ' + r1(CX - mw2) + ' ' + r1(my - 1) + 'Z';
        out.push('<g opacity="' + r1(openA * 100) / 100 + '"><clipPath id="mo' + uid + '"><path d="' + mouthD + '"/></clipPath>' +
          '<path d="' + mouthD + '" fill="#7a2c2a"/>' +
          '<g clip-path="url(#mo' + uid + ')"><rect x="' + r1(CX - mw2) + '" y="' + r1(my - 2) + '" width="' + r1(2 * mw2) + '" height="' + r1(2.6 + 0.6 * cc) + '" fill="#fff"/>' +
          el('ellipse', { cx: CX, cy: r1(my + d2 * 1.05), rx: r1(mw2 * 0.45), ry: r1(d2 * 0.45), fill: '#e0716b' }) + '</g>' +
          '<path d="' + mouthD + '" fill="none" stroke="#5a2420" stroke-width="1.6" stroke-linejoin="round"/></g>');
      }
    }
    // усы
    if (!fem && F.mustache === 1) out.push('<path d="M' + r1(CX - 10) + ' ' + r1(my - 3) + 'Q' + r1(CX - 5) + ' ' + r1(my - 7) + ' ' + CX + ' ' + r1(my - 4.8) + 'Q' + r1(CX + 5) + ' ' + r1(my - 7) + ' ' + r1(CX + 10) + ' ' + r1(my - 3) + '" fill="none" stroke="' + g.hairC + '" stroke-width="2.6" stroke-linecap="round"/>');
    if (!fem && F.mustache === 2) out.push('<path d="M' + CX + ' ' + r1(my - 6.5) + 'C' + r1(CX - 5) + ' ' + r1(my - 8.5) + ' ' + r1(CX - 12) + ' ' + r1(my - 6.5) + ' ' + r1(CX - 13.5) + ' ' + r1(my - 1.5) +
      'C' + r1(CX - 9) + ' ' + r1(my - 3.2) + ' ' + r1(CX - 4) + ' ' + r1(my - 2.8) + ' ' + CX + ' ' + r1(my - 3.8) + 'C' + r1(CX + 4) + ' ' + r1(my - 2.8) + ' ' + r1(CX + 9) + ' ' + r1(my - 3.2) + ' ' + r1(CX + 13.5) + ' ' + r1(my - 1.5) +
      'C' + r1(CX + 12) + ' ' + r1(my - 6.5) + ' ' + r1(CX + 5) + ' ' + r1(my - 8.5) + ' ' + CX + ' ' + r1(my - 6.5) + 'Z" fill="' + g.hairC + '" stroke="' + INK + '" stroke-width="1.2" stroke-linejoin="round"/>');
    // родинка
    if (F.mole) out.push(el('circle', { cx: r1(CX + 15 + f), cy: r1(my + 1.5), r: 1.3, fill: '#4a2e22' }));
    // очки
    if (F.glasses) {
      var gr = 8.6 * big, gl = '';
      for (var s4 = -1; s4 <= 1; s4 += 2) {
        var gx = CX + s4 * exo;
        gl += F.glasses === 1 ? el('circle', { cx: r1(gx), cy: r1(ey - 0.5), r: r1(gr), fill: '#fff', 'fill-opacity': '.14', stroke: '#26262b', 'stroke-width': 2.2 })
          : el('rect', { x: r1(gx - gr - 1), y: r1(ey - gr * 0.8), width: r1(2 * gr + 2), height: r1(gr * 1.6), rx: 3.2, fill: '#fff', 'fill-opacity': '.14', stroke: '#26262b', 'stroke-width': 2.2 });
        gl += '<path d="M' + r1(gx + s4 * (gr + (F.glasses === 1 ? 0 : 1))) + ' ' + r1(ey - 2) + 'L' + r1(CX + s4 * (rx - 1.5)) + ' ' + r1(ey - 3.5) + '" stroke="#26262b" stroke-width="2" stroke-linecap="round"/>';
      }
      gl += '<path d="M' + r1(CX - exo + gr - 0.5) + ' ' + r1(ey - 1.5) + 'Q' + CX + ' ' + r1(ey - 5) + ' ' + r1(CX + exo - gr + 0.5) + ' ' + r1(ey - 1.5) + '" fill="none" stroke="#26262b" stroke-width="2"/>';
      out.push(gl);
    }

    // головной убор
    out.push(hat(lv, hy, rx, ry, uid, fem));
    return out.join('');
  }

  // Борода: 1 щетина, 2 короткая, 3 густая — область вдоль челюсти с вырезом под рот
  function beard(kind, hy, rx, ry, jw, sd2, chin, fy, my, hairC) {
    var full = kind === 3, ext = full ? 8 : 1.5, wide = full ? 2.5 : 0.5;
    var ro = [[CX + rx * 0.97, hy + (full ? 9 : 13), 1], [CX + rx * sd2[0] + wide, hy + ry * sd2[1]], [CX + jw + 1 + wide, hy + ry * 0.86]];
    var ri = full ? [[CX + 7, my + 6], [CX + 13, my + 0.5], [CX + 19, fy + 17], [CX + rx * 0.84, hy + 14, 1]]
      : [[CX + 8, my + 8], [CX + 17, my + 3.5], [CX + 25, fy + 19], [CX + rx * 0.86, hy + 17, 1]];
    var pts = ro.concat([[CX, hy + ry * chin + ext]], ro.slice().reverse().map(mx), ri.slice().reverse().map(mx), [[CX, my + (full ? 7 : 9.5)]], ri);
    var d = smooth(pts, true);
    return kind === 1 ? '<path d="' + d + '" fill="' + hairC + '" opacity=".2"/>'
      : '<path d="' + d + '" fill="' + hairC + '" stroke="' + INK + '" stroke-width="1.6" stroke-linejoin="round"/>';
  }

  function hat(lv, hy, rx, ry, uid, fem) {
    var O = 'stroke="' + INK + '" stroke-width="2" stroke-linejoin="round"';
    if (lv <= 1) return '';
    var s = '';
    if (lv <= 4) { // кепка
      var yb = hy - ry * 0.5;
      s += '<path d="' + smooth([[CX - rx * 1.0, yb, 1], [CX - rx * 0.8, hy - ry * 0.84], [CX, hy - ry - 8], [CX + rx * 0.8, hy - ry * 0.84], [CX + rx * 1.0, yb, 1]], true) + '" fill="#5a6b40" ' + O + '/>';
      s += '<path d="M' + CX + ' ' + r1(hy - ry - 7) + 'V' + r1(yb) + '" stroke="#46542f" stroke-width="1.5"/>';
      s += el('circle', { cx: CX, cy: r1(hy - ry - 8), r: 2.6, fill: '#46542f', stroke: INK, 'stroke-width': 1.2 });
      s += '<path d="M' + r1(CX - rx * 0.92) + ' ' + r1(yb) + 'Q' + CX + ' ' + r1(yb + 13) + ' ' + r1(CX + rx * 0.92) + ' ' + r1(yb) + 'Q' + CX + ' ' + r1(yb + 3) + ' ' + r1(CX - rx * 0.92) + ' ' + r1(yb) + 'Z" fill="#46542f" ' + O + '/>';
      if (lv >= 4) s += star5(CX - rx * 0.42, hy - ry * 0.72, 4, GOLD);
      return s;
    }
    if (lv <= 11 || lv >= 15) { // берет
      var col = lv >= 15 ? 'url(#gd' + uid + ')' : lv <= 8 ? '#8f2433' : '#2a3a6e';
      var by0 = hy - ry * 0.4, by1 = hy - ry * 0.3;
      s += '<path d="' + smooth([[CX - rx * 0.98, by0, 1], [CX - rx * 0.8, hy - ry - 4], [CX + rx * 0.15, hy - ry - 12], [CX + rx * 1.0, hy - ry - 3],
        [CX + rx * 1.24, hy - ry * 0.48], [CX + rx * 0.98, by1, 1]], true) + '" fill="' + col + '" ' + O + '/>';
      s += '<path d="M' + r1(CX - rx * 0.98) + ' ' + r1(by0) + 'Q' + CX + ' ' + r1(hy - ry * 0.24) + ' ' + r1(CX + rx * 0.98) + ' ' + r1(by1) + '" stroke="' + INK + '" stroke-width="6" fill="none" stroke-linecap="round"/>';
      s += '<path d="M' + r1(CX - rx * 0.98) + ' ' + r1(by0) + 'Q' + CX + ' ' + r1(hy - ry * 0.24) + ' ' + r1(CX + rx * 0.98) + ' ' + r1(by1) + '" stroke="#3a2a22" stroke-width="3.4" fill="none" stroke-linecap="round"/>';
      var bx = CX - rx * 0.42, byy = hy - ry * 0.62;
      s += el('circle', { cx: r1(bx), cy: r1(byy), r: lv >= 9 ? 6.2 : 5.2, fill: lv >= 15 ? '#2a1d14' : 'url(#gd' + uid + ')', stroke: INK, 'stroke-width': 1.3 });
      s += star5(bx, byy, lv >= 9 ? 3.8 : 3.2, lv >= 15 ? FIRE : lv >= 9 ? '#a3262e' : '#6b4f26');
      return s;
    }
    // фуражка (12–14)
    var bt = hy - ry * 0.66, bb = hy - ry * 0.4;
    s += '<path d="' + smooth([[CX - rx * 0.93, bb, 1], [CX - rx * 0.95, bt], [CX - rx * 1.22, bt - 7], [CX - rx * 0.7, hy - ry - 13], [CX + rx * 0.7, hy - ry - 13], [CX + rx * 1.22, bt - 7], [CX + rx * 0.95, bt], [CX + rx * 0.93, bb, 1]], true) + '" fill="#3c4a2c" ' + O + '/>';
    s += '<path d="M' + r1(CX - rx * 0.94) + ' ' + r1(bt + 1) + 'Q' + CX + ' ' + r1(bt + 4) + ' ' + r1(CX + rx * 0.94) + ' ' + r1(bt + 1) + 'V' + r1(bb) + 'Q' + CX + ' ' + r1(bb + 3) + ' ' + r1(CX - rx * 0.94) + ' ' + r1(bb) + 'Z" fill="#a3262e" ' + O + '/>';
    s += '<path d="M' + r1(CX - rx * 0.8) + ' ' + r1(bb) + 'Q' + CX + ' ' + r1(bb + 12) + ' ' + r1(CX + rx * 0.8) + ' ' + r1(bb) + 'Q' + CX + ' ' + r1(bb + 4) + ' ' + r1(CX - rx * 0.8) + ' ' + r1(bb) + 'Z" fill="#121216" ' + O + '/>';
    s += '<path d="M' + r1(CX - rx * 0.72) + ' ' + r1(bb + 2) + 'Q' + CX + ' ' + r1(bb + 6) + ' ' + r1(CX + rx * 0.72) + ' ' + r1(bb + 2) + '" stroke="' + GOLD + '" stroke-width="1.6" fill="none"/>';
    s += el('ellipse', { cx: CX, cy: r1(bt - 2), rx: 6, ry: 6.5, fill: 'url(#gd' + uid + ')', stroke: INK, 'stroke-width': 1.3 });
    s += star5(CX, bt - 2, 3.6, '#a3262e');
    if (lv >= 13) s += '<path d="M' + r1(CX - rx * 0.6) + ' ' + r1(bt - 3) + 'q6 -4 9 0M' + r1(CX + rx * 0.6) + ' ' + r1(bt - 3) + 'q-6 -4 -9 0" stroke="' + GOLD + '" stroke-width="1.6" fill="none" stroke-linecap="round"/>';
    return s;
  }

  // Искры поверх фигуры
  function drawFx(sparks, ms) {
    var s = '';
    for (var i = 0; i < sparks.length; i++) {
      var k = sparks[i], tt = (ms - k.delay) / k.life;
      if (tt <= 0 || tt >= 1) continue;
      var sc = Math.sin(Math.PI * tt) * k.size, x = k.x + k.dx * tt, y = k.y - k.rise * tt;
      s += '<path transform="translate(' + r1(x) + ' ' + r1(y) + ') rotate(' + r1(k.rot + 90 * tt) + ') scale(' + r1(sc * 100) / 100 + ')" d="M0 -1L.28 -.28L1 0L.28 .28L0 1L-.28 .28L-1 0L-.28 -.28Z" fill="' + k.color + '" opacity="' + r1((1 - tt * tt) * 100) / 100 + '"/>';
    }
    return s;
  }
  function makeSparks(n, delay0) {
    var arr = [], cols = [GOLD2, GOLD2, GOLD, GOLD, '#fff4d8', FIRE];
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, rr = 35 + Math.random() * 85;
      arr.push({ x: CX + Math.cos(a) * rr * 0.9, y: 175 + Math.sin(a) * rr * 1.1, dx: (Math.random() - 0.5) * 16,
        rise: 22 + Math.random() * 30, delay: (delay0 || 0) + Math.random() * 700, life: 600 + Math.random() * 500,
        size: 4 + Math.random() * 5, rot: Math.random() * 90, color: cols[i % cols.length] });
    }
    return arr;
  }

  var UID = 0;
  function svgWrap(inner, label, uid, vb) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + (vb || '0 0 ' + VBW + ' ' + VBH) + '" role="img" aria-label="' + label + '" style="display:block;width:100%;height:100%;overflow:' + (vb ? 'hidden' : 'visible') + '">' +
      '<g class="av-body" data-uid="' + uid + '">' + inner + '</g><g class="av-fx" pointer-events="none"></g></svg>';
  }
  function labelOf(state, opts) {
    var st = stage(state, opts);
    return 'Аватар бойца: ' + st.rank + ', ' + st.name.toLowerCase() + ', ' + st.percent + '%';
  }

  function svg(state, opts) {
    opts = opts || {};
    var uid = 'a' + (++UID);
    var P = params(state, opts); P.bg = opts.head ? false : opts.bg;
    // opts.head — крупный план головы (для конструктора лица)
    var body = drawBody(P, uid);
    return svgWrap(body, labelOf(state, opts), uid, opts.head ? (CX - 62) + ' ' + r1(P.headY - 64) + ' 124 124' : null);
  }

  function render(target, state, opts) {
    opts = opts || {};
    var P1 = params(state, opts); P1.bg = opts.bg;
    var av = target._av;
    if (!av || !target.querySelector('.av-body')) {
      av = target._av = { uid: 'a' + (++UID), P: null, raf: 0 };
      target.innerHTML = svgWrap('', '', av.uid);
    }
    var root = target.querySelector('svg'), body = root.querySelector('.av-body'), fxg = root.querySelector('.av-fx');
    root.setAttribute('aria-label', labelOf(state, opts));
    if (av.raf) { cancelAnimationFrame(av.raf); av.raf = 0; }

    var P0 = null;
    if (opts.from != null) {
      if (typeof opts.from === 'number') P0 = params(state, { progress: opts.from, level: opts.level });
      else P0 = params(opts.from, { level: opts.fromLevel });
      P0.bg = opts.bg;
    } else if (opts.animate && av.P) P0 = av.P;

    var reduce = false;
    try { reduce = root.ownerDocument.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
    var raf = typeof requestAnimationFrame === 'function';
    if (!P0 || opts.animate === false || reduce || !raf) {
      body.innerHTML = drawBody(P1, av.uid);
      fxg.innerHTML = '';
      av.P = P1;
      if (opts.onDone) opts.onDone();
      return { stage: stage(state, opts) };
    }

    var dur = opts.duration || 1200;
    var up = P1.glow >= P0.glow - 1e-6;
    var withSparks = opts.sparks !== false && up;
    var sparks = withSparks ? makeSparks(22, 150) : [];
    if (withSparks && P1.level !== P0.level) sparks = sparks.concat(makeSparks(14, dur * 0.45));
    var total = dur + (withSparks ? 1300 : 0);
    var t0 = 0;
    function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
    function frame(now) {
      if (!t0) t0 = now;
      var ms = now - t0, t = clamp(ms / dur, 0, 1), e = ease(t);
      var P = mixP(P0, P1, e);
      body.innerHTML = drawBody(P, av.uid, { pump: up ? Math.sin(Math.PI * t) : 0, flash: up ? Math.sin(Math.PI * t) * 0.6 : 0, ring: withSparks ? clamp(ms / 1000, 0, 1) : 1 });
      fxg.innerHTML = withSparks ? drawFx(sparks, ms) : '';
      av.P = P;
      if (ms < total) av.raf = requestAnimationFrame(frame);
      else {
        av.raf = 0; av.P = P1; body.innerHTML = drawBody(P1, av.uid); fxg.innerHTML = '';
        if (opts.onDone) opts.onDone();
      }
    }
    av.raf = requestAnimationFrame(frame);
    return { stage: stage(state, opts) };
  }

  root.Avatar = {
    create: create, progress: progress, render: render, stage: stage, svg: svg, today: today,
    params: params, RANKS: RANKS.slice(), STAGES: STAGES.slice(), EVENTS: JSON.parse(JSON.stringify(EVENTS)),
    DAY_CAP: DAY_CAP, FULL: FULL, GOAL_MODE: GOAL_MODE, version: 2,
    SKINS: SKINS.map(function (x) { return x[0]; }), HAIRS: HAIRS.slice(), EYE_COLORS: EYE_COLORS.slice(),
    FACE: JSON.parse(JSON.stringify(FACE)), faceOf: faceOf, randomFace: randomFace
  };
})(typeof window !== 'undefined' ? window : this);
