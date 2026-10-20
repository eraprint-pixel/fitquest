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
  // 12 званий по неделям сезона: солдаты и сержанты → офицеры с младшего лейтенанта → генерал.
  // У каждого звания — позывной-прикол (про лень и режим, не про тело).
  var RANKS = ['Новобранец С Дивана', 'Рядовой Подъём', 'Ефрейтор Без Отмазок', 'Младший сержант Будильник', 'Сержант Режим',
    'Старшина Порядок', 'Младший лейтенант Зарядка', 'Лейтенант Протокол', 'Капитан Железо', 'Майор Дисциплина',
    'Полковник Сталь', 'Генерал Кода тела'];
  var MAXL = RANKS.length;
  var BASES = ['Младший сержант', 'Младший лейтенант', 'Новобранец', 'Рядовой', 'Ефрейтор', 'Сержант', 'Старшина', 'Лейтенант', 'Капитан', 'Майор', 'Полковник', 'Генерал'];
  function rankParts(name) {
    for (var i = 0; i < BASES.length; i++) if (name.indexOf(BASES[i] + ' ') === 0) return [BASES[i], name.slice(BASES[i].length + 1)];
    return [name, ''];
  }
  // родительный падеж («до Ефрейтора Без Отмазок»): прозвище-существительное мужского рода склоняется, остальные — нет
  var RANKS_GEN = ['Новобранца С Дивана', 'Рядового Подъёма', 'Ефрейтора Без Отмазок', 'Младшего сержанта Будильника', 'Сержанта Режим',
    'Старшины Порядка', 'Младшего лейтенанта Зарядка', 'Лейтенанта Протокола', 'Капитана Железо', 'Майора Дисциплина',
    'Полковника Сталь', 'Генерала Кода тела'];
  // Звание (1..12) → ступень формы (внутренняя шкала рисования: погоны, головной убор, берцы, жетон и т. п.)
  var GEAR = [0, 1, 2, 3, 4, 5, 7, 8, 9, 11, 12, 14, 15];
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
    o.hair = fem ? [2, 3, 4, 5, 6, 7, 4, 5][r(8)] : [0, 1, 2, 3, 0, 1, 8, 2][r(8)];   // мужчинам без каре (7)
    o.hairColor = r(10) < 7 ? r(4) : r(HAIRS.length);
    o.beard = fem ? 0 : [0, 0, 1, 2, 3][r(5)]; o.mustache = fem ? 0 : [0, 0, 0, 1, 2][r(5)];
    if (!fem) o.brows = [0, 2, 3][r(3)];                                  // тонкие брови — только женщинам
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

  function autoLevel(pr) { return 1 + Math.floor(clamp(pr, 0, 1) * (MAXL - 0.001)); }
  function levelOf(state, opts) {
    var l = (opts && opts.level) || state.level || autoLevel(state.progress);
    return clamp(Math.round(l), 1, MAXL);
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
      var lv = clamp(Math.round(+ev.level || 1), 1, MAXL);
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
      glow: pr, level: levelOf({ level: state.level, progress: pr }, opts),
      medals: opts.uniform === 'grey' ? [] : (opts.medals || state.medals || []).slice(0, 12), medalIn: 1,
      uniform: opts.uniform || null, eyes: opts.eyes || null, mask: !!opts.mask, shrug: +opts.shrug || 0
    };
  }
  function mixP(a, b, t) {
    var o = {}, k;
    for (k in b) o[k] = (typeof b[k] === 'number' && typeof a[k] === 'number' && k !== 'level' && k !== 'skin' && k !== 'hair')
      ? lerp(a[k], b[k], t) : b[k];
    o.level = t < 0.5 ? a.level : b.level;
    // новая медаль вырастает «из ниоткуда»: последняя медаль масштабируется 0 → 1 с отскоком
    var na = (a.medals || []).length, nb = (b.medals || []).length;
    o.medals = b.medals || []; o.medalIn = nb > na ? clamp(t * 1.25, 0, 1) : 1;
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
    var f = P.fat, m = P.mus, p = P.pos, c = P.conf, fem = P.sex === 'f', lv = GEAR[clamp(Math.round(P.level) || 1, 1, MAXL)];   // ступень формы
    var F = P.face, skin = SKINS[P.skin] || SKINS[1], hairC = HAIRS[F.hairColor] || HAIRS[0];
    var mm = fem ? 0.6 : 1; // «мышечный» множитель
    var grey = P.uniform === 'grey';        // Генерал Завтра: серая форма Армии Завтра
    var shirt = grey ? ['#6b6e75', '#52555b', '#80838a'] : lv <= 1 ? ['#7a7d84', '#5f6269', '#8d9097'] : lv >= 15 ? ['#3f4a30', '#2f3824', '#55623f'] : ['#5f7046', '#4a5836', '#728553'];
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
    var S = (fem ? 32 : 37) + (fem ? 6 : 15) * m + 7 * f + 4 * p;   // у мужчины к 100% плечи и дельты шире
    var C = fem ? S - 3 + 3 * m * mm + 4 * f : S - 4.5 + 1.2 * m + 1.2 * f;
    var W = (fem ? 24 : 28) + 30 * f - (fem ? 2 : 5.5) * m;        // талия уже — V от подмышек
    var Bl = (fem ? 26 : 29) + 38 * f;
    var H = (fem ? 33 : 29) + 22 * f;
    var Hm = Math.max(Bl * 0.92, H + 1.5);
    var nw = 10 + 3 * f;

    var slump = 1 - p;
    var torsoR = fem ? [[CX + nw, sh - 3, 1], [CX + S - 9, sh - 1 - 1.5 * p + 2 * slump], [CX + S, sh + 9 + 5 * slump],
      [CX + C, sh + 24], [CX + W, sh + 47], [CX + Bl, sh + 63], [CX + Hm, hem, 1]]
      // мужской торс: от подмышки к талии прямой клин (V), без изгиба под грудью — иначе читается как грудь
      : [[CX + nw, sh - 3, 1], [CX + S - 9, sh - 1 - 1.5 * p + 2 * slump], [CX + S, sh + 9 + 5 * slump],
      [CX + C, sh + 19], [CX + lerp(C, W, 0.5), sh + 33], [CX + W, sh + 47], [CX + Bl, sh + 63], [CX + Hm, hem, 1]];
    var tx = function (y) { return interpX(torsoR, y) - CX + 1.5; };

    // руки (правая; левая — зеркалом)
    var ua = (fem ? 7 : 8) + 4.5 * f + (fem ? 3 : 7.5) * m;
    var fa = (fem ? 5.8 : 6.5) + 3.5 * f + (fem ? 1.5 : 4.5) * m;   // предплечья толще у мужчины
    var shJ = [CX + S - 7, sh + 12 + 4 * slump];
    var elY = sh + 46, wrY = sh + 80;
    var elX = Math.max(CX + S - 2 + 2 * m, CX + tx(elY) + ua + 1);
    var wrX = Math.max(elX + 1.5, CX + Math.max(tx(wrY), tx(wrY - 12)) + fa + 2.5);
    // к «Боевой форме» — руки в боки: локоть в сторону, кулак на поясе (плавно по уверенности)
    var akimbo = clamp((p - 0.72) / 0.28, 0, 1), aE = akimbo * akimbo * (3 - 2 * akimbo);
    var hipX = CX + tx(band - 8) + fa * 0.2, hipY = band - 8;
    elX = lerp(elX, Math.max(elX, CX + S + 15 + 4 * m), aE); elY = lerp(elY, sh + 36, aE);
    wrX = lerp(wrX, hipX + 3, aE); wrY = lerp(wrY, hipY, aE);
    var shr = clamp(P.shrug || 0, 0, 1), sE = shr * shr * (3 - 2 * shr);   // «развёл руками»: локти к телу, кисти в стороны ладонями вверх
    elX = lerp(elX, CX + S + 4, sE); elY = lerp(elY, sh + 44, sE);
    wrX = lerp(wrX, CX + S + 27, sE); wrY = lerp(wrY, sh + 42, sE);
    var elb = [elX, elY], wr = [wrX, wrY];
    var armAxis = [shJ, at(shJ, elb, 0.5), elb, at(elb, wr, 0.5), wr];
    var armW = [[ua + 1, ua + 3.5 + 2 * m * mm], [ua + 0.5 + 2.5 * m * mm, ua + 1 + 1.5 * m * mm], [fa + 0.8 + f, fa + 1 + f], [fa + 0.5 + 1.5 * m * mm, fa + 1 + 1.5 * m * mm], [fa - 0.8, fa - 0.6]];
    var slT = fem ? 0.42 : 0.55;
    var sleeve = limb([at(shJ, elb, -0.05), at(shJ, elb, slT * 0.5), at(shJ, elb, slT)], [[ua + 2, ua + 5 + 2 * m * mm], [ua + 2 + 1.5 * m * mm, ua + 3.5 + 1.5 * m * mm], [ua + 2 + 2.2 * m * mm, ua + 2.6 + 2 * m * mm]], 'flat');
    var handR = (fem ? 6.6 : 7.6) + 1.6 * f;
    var hand = [lerp(lerp(wrX + 0.6, wrX - 1, aE), wrX + handR * 0.8, sE), lerp(lerp(wrY + handR * 0.85, wrY + 2, aE), wrY - 1, sE)];

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
    var legD = limb(legAxis, legW);
    var legSvg = cel(legD, skin[0], skin[1], 3.2, uid) + '<path d="' + legD + '" fill="none" ' + O + '/>';
    // носки и кроссовки
    var sx = lx + 0.6;
    if (lv >= 2) { // берцы: голенище, шнуровка, рант (золотой с 5-го звания)
      var bt = ankle - 13, boot = smooth([[sx - aw - 2.5, bt, 1], [sx + aw + 2.5, bt, 1], [sx + aw + 3, ankle - 1], [sx + 12, ankle + 4], [sx + 15.5, ground - 5],
        [sx + 14, ground, 1], [sx - 10, ground, 1], [sx - aw - 3.5, ankle + 3]], true);
      legSvg += cel(boot, '#34343a', '#1f1f24', 2.5, uid) + '<path d="' + boot + '" fill="none" ' + O + '/>';
      legSvg += '<path d="M' + r1(sx - aw - 2) + ' ' + (bt + 2.5) + 'H' + r1(sx + aw + 2) + '" stroke="#4a4a52" stroke-width="2"/>';
      for (var li = 0; li < 3; li++) legSvg += '<path d="M' + r1(sx - 3) + ' ' + (bt + 5 + li * 3.4) + 'l6 1.6M' + r1(sx + 3) + ' ' + (bt + 5 + li * 3.4) + 'l-6 1.6" stroke="#c9c2b6" stroke-width="1" opacity=".8"/>';
      legSvg += '<path d="M' + r1(sx - 10) + ' ' + (ground - 3) + 'H' + r1(sx + 14.2) + '" stroke="' + (lv >= 5 ? GOLD : '#5a5a62') + '" stroke-width="2.6"/>';
      legSvg += '<path d="M' + r1(sx + 6) + ' ' + (ankle + 1) + 'q4 1 6 5" fill="none" stroke="#fff" stroke-width="1.4" opacity=".18"/>';
    } else {
      legSvg += '<path d="M' + r1(lx - aw - 0.8) + ' ' + (ankle - 7) + 'h' + r1(2 * aw + 2.2) + 'v6h-' + r1(2 * aw + 2.2) + 'z" fill="#ece8df" ' + O + '/>';
      var shoe = smooth([[sx - 8.5, ankle - 2, 1], [sx + 4, ankle - 3], [sx + 11, ankle + 3], [sx + 15, ground - 4],
        [sx + 13.5, ground, 1], [sx - 9.5, ground, 1], [sx - 10, ankle + 4]], true);
      legSvg += cel(shoe, '#eee9de', '#cfc8b9', 2.5, uid) + '<path d="' + shoe + '" fill="none" ' + O + '/>';
      legSvg += '<path d="M' + r1(sx - 9.5) + ' ' + (ground - 3.5) + 'H' + r1(sx + 14.5) + '" stroke="#a9a49a" stroke-width="2.4"/>';
      legSvg += '<path d="M' + r1(sx - 2) + ' ' + (ankle + 1) + 'l7 2" stroke="' + INK + '" stroke-width="1.2" opacity=".5"/>';
    }
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
      var shD = smooth(sym([CX, band], [[CX + H - 1, band, 1], [CX + H + 1.5 + 2 * f, band + 13], [outer, crotch + 14, 1], [inner, crotch + 14, 1]], [CX, crotch + 4, 1]), true);
      out.push(cel(shD, shortsHi, shorts, 5, uid) + '<path d="' + shD + '" fill="none" ' + O + '/>');
      var pk = '<path d="M' + r1(CX + H - 6) + ' ' + (band + 5) + 'q4 6 3 12" fill="none" stroke="#0006" stroke-width="1.4"/>';
      out.push(pk, '<g ' + mirror + '>' + pk + '</g>');
      var stripe = '<path d="M' + r1(CX + H + 0.8 + f) + ' ' + (band + 4) + 'L' + r1(outer - 1.5) + ' ' + r1(crotch + 12) + '" stroke="' + (lv >= 5 ? GOLD : shortsHi) + '" stroke-width="2.2"/>';
      out.push(stripe, '<g ' + mirror + '>' + stripe + '</g>');
    }
    // ремень
    if (lv >= 2) {
      out.push('<path d="M' + r1(CX - H - 0.5) + ' ' + (band + 1) + 'Q' + CX + ' ' + (band + 4) + ' ' + r1(CX + H + 0.5) + ' ' + (band + 1) + '" stroke="#1d1a17" stroke-width="5" fill="none"/>');
      out.push('<rect x="' + (CX - 5.5) + '" y="' + (band - 1.5) + '" width="11" height="8" rx="1.5" fill="' + (lv >= 7 ? 'url(#gd' + uid + ')' : '#9a9ea8') + '" stroke="' + INK + '" stroke-width="1.2"/>' + (lv >= 7 ? star5(CX, band + 2.5, 2.4, '#8a6a32') : ''));
    }

    // руки
    var armD = limb(armAxis, armW);
    var armSvg = cel(armD, skin[0], skin[1], 2.6, uid) + '<path d="' + armD + '" fill="none" ' + O + '/>';
    if (m > 0.4) {
      var a1 = at(shJ, elb, 0.62), op = r1(clamp((m - 0.4) * 2, 0, 1) * 10) / 10;
      armSvg += '<path d="M' + r1(a1[0] - ua * 0.55) + ' ' + r1(a1[1] - 2) + 'q' + r1(ua * 0.6) + ' ' + 5 + ' ' + r1(ua * 1.1) + ' ' + 1 + '" fill="none" stroke="' + skin[1] + '" stroke-width="1.6" stroke-linecap="round" opacity="' + op + '"/>';
    }
    out.push(armSvg, '<g ' + mirror + '>' + armSvg + '</g>');
    // рукава (под торсом — плечевой шов даёт контур торса)
    var sleeveSvg = cel(sleeve, shirt[0], shirt[1], 3, uid) + '<path d="' + sleeve + '" fill="none" ' + O + '/>';
    if (lv >= 2) { // шеврон на рукаве: лычки до 8-го, звезда дальше
      var sp = at(shJ, elb, slT * 0.55), sw = ua * 0.62;
      var chev = '<path d="M' + r1(sp[0] - sw) + ' ' + r1(sp[1] - 5) + 'h' + r1(2 * sw) + 'v7q-' + r1(sw) + ' 6 -' + r1(2 * sw) + ' 0z" fill="' + shirt[1] + '" stroke="' + INK + '" stroke-width="1.1"/>';
      chev += lv >= 9 ? star5(sp[0], sp[1] - 0.5, 3, GOLD) : [0, 1, 2].slice(0, Math.min(3, Math.ceil((lv - 1) / 2.4))).map(function (i) {
        return '<path d="M' + r1(sp[0] - sw * 0.7) + ' ' + r1(sp[1] - 3 + i * 2.6) + 'l' + r1(sw * 0.7) + ' 2l' + r1(sw * 0.7) + ' -2" fill="none" stroke="' + GOLD + '" stroke-width="1.3"/>';
      }).join('');
      sleeveSvg += '<g ' + mirror + '>' + chev + '</g>';
    }
    if (lv >= 15) {
      var se = at(shJ, elb, slT);
      sleeveSvg += el('circle', { cx: r1(se[0]), cy: r1(se[1] - 1), r: 1.6, fill: GOLD });
    }
    out.push(sleeveSvg, '<g ' + mirror + '>' + sleeveSvg + '</g>');

    // шея
    out.push('<path d="M' + r1(CX - nw + 1.5) + ' ' + r1(hy + ry - 10) + 'V' + r1(sh + 8) + 'H' + r1(CX + nw - 1.5) + 'V' + r1(hy + ry - 10) + 'Z" fill="' + skin[1] + '" ' + O + '/>');

    // торс (футболка)
    var torso = sym([CX, sh + 6], torsoR, [CX, hem + 2 + 5 * f]);
    var torsoD = smooth(torso, true);
    out.push(cel(torsoD, shirt[0], fem ? shirt[1] : darken(shirt[0], 0.88), fem ? 7 : 4, uid));   // у мужчин тонкая тень по краю — без «округлостей» сбоку
    out.push('<clipPath id="' + uid + 'tc"><path d="' + torsoD + '"/></clipPath><g clip-path="url(#' + uid + 'tc)">' + (fem
      ? '<ellipse cx="' + CX + '" cy="' + r1(sh + 2) + '" rx="' + r1(rx * 0.75) + '" ry="10" fill="#000" opacity=".22"/>' +
        '<path d="M' + r1(CX - S + 4) + ' ' + r1(sh + 6) + 'Q' + r1(CX - S * 0.4) + ' ' + r1(sh + 2) + ' ' + r1(CX - S * 0.1) + ' ' + r1(sh + 10) + '" fill="none" stroke="' + shirt[2] + '" stroke-width="4" stroke-linecap="round" opacity=".6"/>'
      // мужчина: прямая тень у ворота и блик вдоль плечевого шва — без круглых пятен на груди
      : '<path d="M' + r1(CX - nw - 6) + ' ' + r1(sh - 1) + 'L' + r1(CX + nw + 6) + ' ' + r1(sh - 1) + 'L' + r1(CX + nw + 2) + ' ' + r1(sh + 5) + 'L' + r1(CX - nw - 2) + ' ' + r1(sh + 5) + 'Z" fill="#000" opacity=".18"/>' +
        '<path d="M' + r1(CX - S + 5) + ' ' + r1(sh + 4) + 'L' + r1(CX - nw - 4) + ' ' + r1(sh) + '" stroke="' + shirt[2] + '" stroke-width="3.2" stroke-linecap="round" opacity=".55"/>') + '</g>');
    out.push('<path d="' + torsoD + '" fill="none" ' + O + '/>');
    // ворот
    out.push('<path d="M' + r1(CX - nw) + ' ' + r1(sh - 3) + 'Q' + CX + ' ' + r1(sh + 15) + ' ' + r1(CX + nw) + ' ' + r1(sh - 3) + '" fill="none" stroke="' + (lv >= 15 ? GOLD : shirt[1]) + '" stroke-width="3" stroke-linecap="round"/>');
    // рельеф груди (муж.) / мягкая складка (жен.)
    if (!fem && m > 0.25) {
      // грудные мышцы: широкая плоская пластина — верх почти горизонтальный от плеча к центру, низ прямой и уходит вверх к подмышке
      var pop = clamp((m - 0.25) / 0.5, 0, 1), py = sh + 25 + 1.5 * f;
      var plate = 'M' + r1(CX + 1.5) + ' ' + r1(sh + 8) + 'L' + r1(CX + C * 0.7) + ' ' + r1(sh + 6) + 'L' + r1(CX + C * 0.8) + ' ' + r1(sh + 17) + 'L' + r1(CX + C * 0.5) + ' ' + r1(py) + 'L' + r1(CX + 1.5) + ' ' + r1(py + 0.5) + 'Z';
      var low = 'M' + r1(CX + 1.5) + ' ' + r1(py + 0.5) + 'L' + r1(CX + C * 0.5) + ' ' + r1(py) + 'L' + r1(CX + C * 0.8) + ' ' + r1(sh + 17);
      // под нижним краем — ровная полоса тени (ткань ложится на пресс), не круглая
      var band = low + 'L' + r1(CX + C * 0.74) + ' ' + r1(sh + 21) + 'L' + r1(CX + C * 0.5) + ' ' + r1(py + 4) + 'L' + r1(CX + 1.5) + ' ' + r1(py + 4.5) + 'Z';
      var pecG = '<path d="' + plate + '" fill="' + shirt[2] + '" opacity="' + r1(pop * 0.75 * 100) / 100 + '"/>' +
        '<path d="' + band + '" fill="#000" opacity="' + r1(pop * 0.16 * 100) / 100 + '"/>' +
        '<path d="' + low + '" fill="none" stroke="' + darken(shirt[0], 0.6) + '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" opacity="' + r1((0.4 + 0.55 * pop) * 100) / 100 + '"/>';
      out.push(pecG, '<g ' + mirror + '>' + pecG + '</g>');
      // разделение пластин: узкая тень по грудине, к 100% глубже
      out.push('<path d="M' + CX + ' ' + r1(sh + 9) + 'V' + r1(py + 2) + '" stroke="' + darken(shirt[0], 0.6) + '" stroke-width="' + r1((1.3 + 1.2 * pop) * 10) / 10 + '" stroke-linecap="round" opacity="' + r1((0.3 + 0.55 * pop) * 100) / 100 + '"/>');
      // V-линия: ровная тень вдоль бока от подмышки к талии (внутри контура футболки)
      var vS = '<path d="M' + r1(CX + C + 3) + ' ' + r1(sh + 15) + 'L' + r1(CX + W + 3) + ' ' + r1(sh + 50) + 'L' + r1(CX + W - 4 - 2 * pop) + ' ' + r1(sh + 50) + 'L' + r1(CX + C - 5 - 3 * pop) + ' ' + r1(sh + 21) + 'Z" fill="#000" opacity="' + r1(pop * 0.28 * 100) / 100 + '"/>';
      out.push('<g clip-path="url(#' + uid + 'tc)">' + vS + '<g ' + mirror + '>' + vS + '</g></g>');
      // складки поперёк рукава (по оси плеча), обрезаны контуром рукава — только на ткани
      var dx = elb[0] - shJ[0], dy = elb[1] - shJ[1], dl2 = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / dl2, uy = dy / dl2, uw = ua + 3 + 2 * m;
      // линия натяжения: от края рукава назад к плечу вдоль бицепса, чуть выгнута наружу
      var fold = function (k, len) { var q = at(shJ, elb, slT * 0.96), x0 = q[0] + uy * uw * k, y0 = q[1] - ux * uw * k;
        return 'M' + r1(x0) + ' ' + r1(y0) + 'q' + r1(-ux * len * 0.5 + uy * 1.6) + ' ' + r1(-uy * len * 0.5 - ux * 1.6) + ' ' + r1(-ux * len) + ' ' + r1(-uy * len); };
      var bf = '<g clip-path="url(#' + uid + 'sl)"><path d="' + fold(0.55, 7 + 3 * pop) + fold(0.15, 5 + 2 * pop) + '" fill="none" stroke="' + darken(shirt[0], 0.6) + '" stroke-width="1.4" stroke-linecap="round" opacity="' + r1(pop * 0.8 * 100) / 100 + '"/></g>';
      out.push('<clipPath id="' + uid + 'sl"><path d="' + sleeve + '"/></clipPath>', bf, '<g ' + mirror + '>' + bf + '</g>');
      // дельты: складка ткани на рукаве по краю мышцы
      var dl = '<path d="M' + r1(CX + S - 3) + ' ' + r1(sh + 6) + 'q' + r1(4 + 3 * m) + ' ' + r1(6) + ' ' + r1(3 + 2 * m) + ' ' + r1(14) + '" fill="none" stroke="' + shirt[1] + '" stroke-width="1.4" stroke-linecap="round" opacity="' + r1(pop * 0.6 * 100) / 100 + '"/>';
      out.push(dl, '<g ' + mirror + '>' + dl + '</g>');
    }
    // складка ткани на животе — мягкая тень, без «смешных» деталей
    if (f > 0.35) {
      out.push('<path d="M' + r1(CX - Bl * 0.55) + ' ' + r1(hem - 6) + 'Q' + CX + ' ' + r1(hem + 1 + 4 * f) + ' ' + r1(CX + Bl * 0.55) + ' ' + r1(hem - 6) + '" fill="none" stroke="' + shirt[1] + '" stroke-width="1.6" stroke-linecap="round" opacity="' + r1((f - 0.35) * 10) / 10 + '"/>');
    }
    // эмблема на груди
    if (!grey) out.push(logoMark(CX - C * 0.45, sh + 10, 25, lv <= 1 ? '#34363c' : GOLD));
    // жетон
    if (lv >= 3) {
      out.push('<path d="M' + r1(CX - nw + 2) + ' ' + r1(sh - 1) + 'Q' + (CX - 3) + ' ' + r1(sh + 16) + ' ' + CX + ' ' + r1(sh + 20) + 'Q' + (CX + 3) + ' ' + r1(sh + 16) + ' ' + r1(CX + nw - 2) + ' ' + r1(sh - 1) + '" fill="none" stroke="#c8c3b8" stroke-width="1" stroke-dasharray="1.6 1.2"/>');
      out.push('<rect x="' + (CX - 3.5) + '" y="' + r1(sh + 19) + '" width="7" height="9.5" rx="2" fill="' + (lv >= 10 ? 'url(#gd' + uid + ')' : '#c9ccd2') + '" stroke="' + INK + '" stroke-width="1"/>');
    }
    // медали
    var MD = P.medals || [];
    if (MD.length) out.push(medalsSvg(MD, CX + C * 0.5, sh + 17, uid, P.medalIn == null ? 1 : P.medalIn));

    // погоны
    if (lv >= 2 || grey) { var ep = epaulette(grey ? 15 : lv, nw, S, sh - 4.5 + 3 * slump, f, uid, grey); /* погоны — на плечах, не на груди */ out.push(ep, '<g ' + mirror + '>' + ep + '</g>'); }

    // кисти
    var hx0 = hand[0], hy0 = hand[1], hr = handR;
    var handSvg = '<path d="' + smooth([[hx0 - hr * 0.95, hy0 - hr * 0.55], [hx0 - hr * 0.2, hy0 - hr * 1.05], [hx0 + hr * 0.85, hy0 - hr * 0.7], [hx0 + hr * 1.0, hy0 + hr * 0.35],
      [hx0 + hr * 0.3, hy0 + hr * 1.05], [hx0 - hr * 0.75, hy0 + hr * 0.8]], true) + '" fill="' + skin[0] + '" stroke="' + INK + '" stroke-width="2" stroke-linejoin="round"/>';
    handSvg += '<path d="M' + r1(hx0 - hr * 0.55) + ' ' + r1(hy0 + hr * 0.2) + 'q' + r1(hr * 0.5) + ' ' + r1(hr * 0.35) + ' ' + r1(hr * 1.2) + ' ' + r1(hr * 0.1) + '" fill="none" stroke="' + skin[1] + '" stroke-width="1.5" stroke-linecap="round"/>';
    handSvg += '<path d="M' + r1(hx0 - hr * 0.9) + ' ' + r1(hy0 - hr * 0.35) + 'q' + r1(-hr * 0.35) + ' ' + r1(hr * 0.55) + ' ' + r1(hr * 0.25) + ' ' + r1(hr * 0.9) + 'q' + r1(hr * 0.45) + ' ' + r1(-hr * 0.1) + ' ' + r1(hr * 0.55) + ' ' + r1(-hr * 0.55) + '" fill="' + skin[0] + '" stroke="' + INK + '" stroke-width="1.6" stroke-linejoin="round"/>';
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

  // Логотип «Кода тела» (fitquest/logo-mark.png) в векторе: вертикальные штрихи, складывающиеся в фигуру.
  // [x0, x1, y0, y1] в пикселях исходника 260×415; tip — заострённые «лепестки»
  var LOGO = [[24, 26, 30, 394], [42, 45, 65, 361], [60, 63, 53, 132], [60, 63, 154, 376], [79, 84, 96, 141], [92, 100, 50, 167], [92, 100, 221, 325, 1],
    [108, 115, 81, 398], [124, 131, 8, 279], [139, 147, 83, 396], [155, 162, 50, 167], [155, 162, 221, 326, 1], [170, 175, 98, 141], [187, 190, 69, 167],
    [200, 203, 57, 394], [217, 219, 30, 363], [234, 236, 65, 383]];
  function logoMark(cx, top, h, col, op) {
    var k = h / 415, x0 = cx - 130 * k, s = '<g opacity="' + (op == null ? 1 : op) + '">';
    for (var i = 0; i < LOGO.length; i++) {
      var L = LOGO[i], x = x0 + (L[0] + L[1]) / 2 * k, w = Math.max(0.85, (L[1] - L[0] + 1) * k);
      if (L[4]) s += '<path d="M' + r1(x) + ' ' + r1(top + L[2] * k) + 'Q' + r1(x + w * 1.1) + ' ' + r1(top + (L[2] + L[3]) / 2 * k) + ' ' + r1(x) + ' ' + r1(top + L[3] * k) + 'Q' + r1(x - w * 1.1) + ' ' + r1(top + (L[2] + L[3]) / 2 * k) + ' ' + r1(x) + ' ' + r1(top + L[2] * k) + 'Z" fill="' + col + '"/>';
      else s += '<path d="M' + r1(x) + ' ' + r1(top + L[2] * k) + 'V' + r1(top + L[3] * k) + '" stroke="' + col + '" stroke-width="' + r1(w * 10) / 10 + '" stroke-linecap="round"/>';
    }
    return s + '</g>';
  }
  // Живой логотип за бойцом: штрихи + золотые шарики, бегущие по ним снизу вверх.
  // Чем дальше путь (glow 0..1), тем ярче логотип и больше/быстрее шарики. Отдельный слой — не перерисовывается в анимации тела.
  function logoBg(uid, glow, animate) {
    var top = 34, h = 268, k = h / 415, x0 = CX - 130 * k, s = '';
    s += '<defs><radialGradient id="lb' + uid + '"><stop offset="0" stop-color="#fff4d8"/><stop offset=".35" stop-color="' + GOLD2 + '" stop-opacity=".9"/><stop offset="1" stop-color="' + GOLD + '" stop-opacity="0"/></radialGradient></defs>';
    s += logoMark(CX, top, h, GOLD, r1((0.17 + 0.15 * glow) * 100) / 100);
    if (!animate) return s;
    var per = 1 + Math.round(glow * 2), seed = 7;
    function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
    for (var i = 0; i < LOGO.length; i++) {
      var L = LOGO[i]; if (L[4]) continue;
      var x = r1(x0 + (L[0] + L[1]) / 2 * k), y0 = r1(top + L[2] * k), y1 = r1(top + L[3] * k), len = y1 - y0;
      for (var j = 0; j < per; j++) {
        var dur = r1((len / (28 + 26 * glow)) * (0.8 + rnd() * 0.5) * 10) / 10, beg = r1(-rnd() * dur * 10) / 10, rr = r1(3.2 + rnd() * 2.2);
        s += '<g opacity="0"><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.15;.8;1" dur="' + dur + 's" begin="' + beg + 's" repeatCount="indefinite"/>' +
          '<circle cx="' + x + '" cy="' + y1 + '" r="' + rr + '" fill="url(#lb' + uid + ')"><animate attributeName="cy" from="' + y1 + '" to="' + y0 + '" dur="' + dur + 's" begin="' + beg + 's" repeatCount="indefinite"/></circle></g>';
      }
    }
    return s;
  }
  // светотень: тёмная копия + сдвинутая влево светлая, обрезка по контуру (свет слева сверху)
  var SHN = 0;
  function cel(d, base, dark, k, uid) {
    var id = uid + 'cs' + (++SHN);
    return '<clipPath id="' + id + '"><path d="' + d + '"/></clipPath><g clip-path="url(#' + id + ')"><path d="' + d + '" fill="' + dark + '"/><path d="' + d + '" fill="' + base + '" transform="translate(' + (-k) + ' ' + (-k * 0.4) + ')"/></g>';
  }
  function darken(hex, k) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    r = Math.round(r * k); g = Math.round(g * k); b = Math.round(b * k);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }
  function lighten(hex) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    r = Math.min(255, r + 14); g = Math.min(255, g + 12); b = Math.min(255, b + 10);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }

  // Медали за достижения (значки игры): до 3 висячих медалей, остальные — орденские планки над ними.
  var RIB = [['#a3262e', '#d4b47a'], ['#2f5d8a', '#e8e8e8'], ['#5f7046', '#d4b47a'], ['#6b3fa0', '#f3dcaa'], ['#e8e8e8', '#a3262e'], ['#1d1d22', '#ff783c']];
  function hashI(str) { var h = 0; for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return Math.abs(h); }
  function medalsSvg(list, cx, y, uid, grow) {
    var s = '', hang = list.slice(0, 3), bars = list.slice(3, 9), n = hang.length;
    for (var i = 0; i < bars.length; i++) {          // планки: ряд по 3 над медалями
      var c = RIB[hashI(bars[i]) % RIB.length], bx = cx + (i % 3 - 1) * 6.2 - 2.8, by = y - 6 - Math.floor(i / 3) * 3.6;
      s += '<rect x="' + r1(bx) + '" y="' + r1(by) + '" width="5.6" height="3.2" fill="' + c[0] + '" stroke="' + INK + '" stroke-width=".6"/><path d="M' + r1(bx + 2.8) + ' ' + r1(by) + 'v3.2" stroke="' + c[1] + '" stroke-width="1.1"/>';
    }
    for (var j = 0; j < n; j++) {
      var mx0 = cx + (j - (n - 1) / 2) * 8.6, c2 = RIB[hashI(hang[j]) % RIB.length];
      var k = j === n - 1 && list.length <= 3 ? grow : (j === n - 1 ? 1 : 1);
      if (list.length > 3 && j === n - 1) k = 1;
      var kk = k >= 1 ? 1 : (k < 0.6 ? k / 0.6 * 1.25 : 1.25 - (k - 0.6) / 0.4 * 0.25);   // рост с отскоком
      var m = '<rect x="' + r1(mx0 - 3.2) + '" y="' + r1(y - 4) + '" width="6.4" height="6" fill="' + c2[0] + '" stroke="' + INK + '" stroke-width=".8"/>' +
        '<path d="M' + r1(mx0) + ' ' + r1(y - 4) + 'v6" stroke="' + c2[1] + '" stroke-width="1.4"/>' +
        el('circle', { cx: r1(mx0), cy: r1(y + 5.5), r: 3.7, fill: 'url(#gd' + uid + ')', stroke: INK, 'stroke-width': 0.9 }) + star5(mx0, y + 5.5, 2.2, '#8a6a32');
      if (kk < 1) m = '<g opacity="' + r1(Math.min(1, k * 2) * 100) / 100 + '" transform="translate(' + r1(mx0) + ' ' + r1(y) + ') scale(' + r1(kk * 100) / 100 + ') translate(' + r1(-mx0) + ' ' + r1(-y) + ')">' + m + '</g>';
      s += m;
    }
    return s;
  }
  function medal(x, y, uid, second) {
    return '<rect x="' + r1(x - 4) + '" y="' + r1(y - 4) + '" width="8" height="6" fill="' + (second ? '#2f5d8a' : '#a3262e') + '" stroke="' + INK + '" stroke-width=".9"/>' +
      '<path d="M' + r1(x - 1.3) + ' ' + r1(y - 4) + 'v6M' + r1(x + 1.3) + ' ' + r1(y - 4) + 'v6" stroke="' + GOLD + '" stroke-width=".9"/>' +
      el('circle', { cx: r1(x), cy: r1(y + 6.5), r: 4.2, fill: 'url(#gd' + uid + ')', stroke: INK, 'stroke-width': 1 }) +
      star5(x, y + 6.5, 2.4, '#8a6a32');
  }

  // Погоны по образцу ВС РФ (Указ Президента № 293), lv — ступень формы (см. GEAR):
  // рядовой — чистый погон; ефрейтор, мл. сержант, сержант — 1/2/3 лычки поперёк; старшина — широкая лычка вдоль;
  // мл. лейтенант 1, лейтенант 2, капитан 4 малые звезды на одном просвете; майор 1 и полковник 3 крупные на двух просветах;
  // генерал — золотой погон «зигзаг» с крупной звездой.
  function epaulette(lv, nw, S, sh, f, uid, grey) {
    var x0 = CX + nw + 3, x1 = CX + S - 2, len = x1 - x0;
    var gen = lv >= 15, gold = gen;
    var d = smooth([[x0 - 1, sh - 5, 1], [x1 - 1, sh - 1.2], [x1 + 1.2, sh + 4.5, 1], [x1 - 1, sh + 9.2, 1], [x0 - 1, sh + 5, 1]], true);
    if (grey) return '<path d="' + d + '" fill="#8d9097" stroke="' + INK + '" stroke-width="1.1"/>' + star5(x0 + len * 0.62, sh + 2.5, 3.2, '#4a4d53');   // серые генеральские погоны Армии Завтра
    var s = '<path d="' + d + '" fill="' + (gold ? 'url(#gd' + uid + ')' : '#2e3a23') + '" stroke="' + INK + '" stroke-width="1.1"/>';
    function P(t, v) { return [x0 + t * len, sh + 4 * t + v * 4.4]; }      // t — вдоль погона (0 у воротника), v — поперёк
    function line(t0, v0, t1, v1, w, c) { var a = P(t0, v0), b = P(t1, v1); return '<path d="M' + r1(a[0]) + ' ' + r1(a[1]) + 'L' + r1(b[0]) + ' ' + r1(b[1]) + '" stroke="' + (c || GOLD) + '" stroke-width="' + w + '" stroke-linecap="round"/>'; }
    function st(t, v, r, c) { var a = P(t, v); return star5(a[0], a[1], r, c || GOLD2); }
    var i;
    if (lv <= 2) return s;                                           // рядовой — чистый погон
    if (lv <= 5) { for (i = 0; i < lv - 2; i++) s += line(0.84 - i * 0.15, -0.78, 0.84 - i * 0.15, 0.78, 2.1); return s; }   // ефрейтор 1, мл. сержант 2, сержант 3
    if (lv === 6) return s + line(0.76, -0.78, 0.76, 0.78, 4.4);       // старший сержант — широкая поперёк
    if (lv === 7) return s + line(0.16, 0, 0.92, 0, 4.2);             // старшина — широкая вдоль
    if (lv <= 11) {                                                  // младшие офицеры: 1 просвет, малые звёзды
      s += line(0.04, 0, 0.97, 0, 1.3, '#141b0e');                     // мл. лейтенант 1, лейтенант 2, ст. лейтенант 3, капитан 4
      var sm = lv === 8 ? [[0.7, 0]] : [[0.82, -0.5], [0.82, 0.5], [0.56, 0], [0.3, 0]].slice(0, lv - 7);
      for (i = 0; i < sm.length; i++) s += st(sm[i][0], sm[i][1], 2.05);
      return s;
    }
    if (lv <= 14) {                                                  // старшие офицеры: 2 просвета, крупные звёзды
      s += line(0.04, -0.3, 0.97, -0.3, 1.2, '#141b0e') + line(0.04, 0.3, 0.97, 0.3, 1.2, '#141b0e');
      if (lv === 12) return s + st(0.7, 0, 3.1);                    // майор — 1
      return s + st(0.82, -0.55, 2.5) + st(0.82, 0.55, 2.5) + st(0.5, 0, 2.5);     // полковник — 3
    }
    // генерал: золотой погон с «зигзагом» и крупной звездой; Легенда — огненная звезда в венке
    var zz = 'M'; for (i = 0; i <= 8; i++) { var a = P(0.06 + i * 0.11, i % 2 ? 0.75 : -0.75); zz += (i ? 'L' : '') + r1(a[0]) + ' ' + r1(a[1]); }
    s += '<path d="' + zz + '" fill="none" stroke="#8a6a32" stroke-width=".8" opacity=".7"/>';
    return s + st(0.62, 0, 3.6, '#fff4d8');                          // генерал — крупная звезда на золотом «зигзаге»
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
    if (st !== 3) s += '<path d="M' + r1(CX - rx * 0.62) + ' ' + r1(hy - ry * 0.62) + 'Q' + r1(CX - rx * 0.2) + ' ' + r1(hy - ry * 0.98) + ' ' + r1(CX + rx * 0.35) + ' ' + r1(hy - ry * 0.9) + '" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="3.2" stroke-linecap="round"/>';
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
    if (P.eyes === 'tired') {             // усталые глаза: тяжёлые веки, тени под глазами, плоский рот
      var skinA = g.skin;
      for (var s5 = -1; s5 <= 1; s5 += 2) {
        var tx5 = CX + s5 * exo;
        out.push('<path d="M' + r1(tx5 - erx * 1.5) + ' ' + r1(ey - ery * 1.6) + 'H' + r1(tx5 + erx * 1.5) + 'V' + r1(ey - ery * 0.1) + 'Q' + r1(tx5) + ' ' + r1(ey + ery * 0.25) + ' ' + r1(tx5 - erx * 1.5) + ' ' + r1(ey - ery * 0.1) + 'Z" fill="' + skinA[0] + '"/>');
        out.push('<path d="M' + r1(tx5 - erx * 1.25) + ' ' + r1(ey - ery * 0.05) + 'Q' + r1(tx5) + ' ' + r1(ey + ery * 0.3) + ' ' + r1(tx5 + erx * 1.25) + ' ' + r1(ey - ery * 0.05) + '" fill="none" stroke="#231a17" stroke-width="2" stroke-linecap="round"/>');
        out.push('<path d="M' + r1(tx5 - erx * 1.1) + ' ' + r1(ey + ery * 1.25) + 'Q' + r1(tx5) + ' ' + r1(ey + ery * 1.75) + ' ' + r1(tx5 + erx * 1.1) + ' ' + r1(ey + ery * 1.25) + '" fill="none" stroke="#6a4a5a" stroke-width="1.6" opacity=".5" stroke-linecap="round"/>');
      }
      out.push('<path d="M' + r1(CX - 6) + ' ' + r1(my + 1.5) + 'Q' + CX + ' ' + r1(my - 0.5) + ' ' + r1(CX + 6) + ' ' + r1(my + 1.5) + '" fill="none" stroke="#6b3a2e" stroke-width="2.2" stroke-linecap="round"/>');
    } else {
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
    if (P.mask) out.push(maskSvg(hy, rx, ry, f, uid));
    out.push(hat(P.uniform === 'grey' ? 13 : lv, hy, rx, ry, uid, fem, P.uniform === 'grey'));
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
    if (kind === 1) return '<path d="' + d + '" fill="' + hairC + '" opacity=".2"/>';
    var tex = '';                      // фактура: пряди светлее и темнее
    for (var i = -3; i <= 3; i++) {
      var x = CX + i * 6.5, y0 = my + 8 + Math.abs(i) * -1.5;
      tex += '<path d="M' + r1(x) + ' ' + r1(y0) + 'q' + (i < 0 ? -1.5 : 1.5) + ' 5 ' + (i < 0 ? -0.5 : 0.5) + ' ' + r1(6 + (full ? 4 : 0) - Math.abs(i) * 0.6) + '" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="1.3" stroke-linecap="round"/>';
    }
    return '<path d="' + d + '" fill="' + hairC + '" stroke="' + INK + '" stroke-width="1.6" stroke-linejoin="round"/>' + tex;
  }

  // гладкая серая маска без лица — до момента «Маска снята»
  function maskSvg(hy, rx, ry, f, uid) {
    var m = smooth(sym([CX, hy - ry * 0.62], [[CX + rx * 0.86, hy - ry * 0.5], [CX + rx * 0.98, hy + 2], [CX + rx * 0.78, hy + ry * 0.62], [CX + rx * 0.3, hy + ry * 0.96]], [CX, hy + ry]), true);
    return '<defs><radialGradient id="mk' + uid + '" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="#c9ccd2"/><stop offset=".6" stop-color="#8d9097"/><stop offset="1" stop-color="#5f6269"/></radialGradient></defs>' +
      '<path d="' + m + '" fill="url(#mk' + uid + ')" stroke="' + INK + '" stroke-width="2"/>' +
      '<path d="M' + r1(CX - rx * 0.5) + ' ' + r1(hy - ry * 0.3) + 'Q' + r1(CX - rx * 0.2) + ' ' + r1(hy - ry * 0.48) + ' ' + r1(CX + rx * 0.1) + ' ' + r1(hy - ry * 0.4) + '" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="3" stroke-linecap="round"/>';
  }
  function hat(lv, hy, rx, ry, uid, fem, grey) {
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
    s += '<path d="' + smooth([[CX - rx * 0.93, bb, 1], [CX - rx * 0.95, bt], [CX - rx * 1.22, bt - 7], [CX - rx * 0.7, hy - ry - 13], [CX + rx * 0.7, hy - ry - 13], [CX + rx * 1.22, bt - 7], [CX + rx * 0.95, bt], [CX + rx * 0.93, bb, 1]], true) + '" fill="' + (grey ? '#6b6e75' : '#3c4a2c') + '" ' + O + '/>';
    s += '<path d="M' + r1(CX - rx * 0.94) + ' ' + r1(bt + 1) + 'Q' + CX + ' ' + r1(bt + 4) + ' ' + r1(CX + rx * 0.94) + ' ' + r1(bt + 1) + 'V' + r1(bb) + 'Q' + CX + ' ' + r1(bb + 3) + ' ' + r1(CX - rx * 0.94) + ' ' + r1(bb) + 'Z" fill="' + (grey ? '#3a3c42' : '#a3262e') + '" ' + O + '/>';
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
  function svgWrap(inner, label, uid, vb, bg) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + (vb || '0 0 ' + VBW + ' ' + VBH) + '" role="img" aria-label="' + label + '" style="display:block;width:100%;height:100%;overflow:' + (vb ? 'hidden' : 'visible') + '">' +
      '<g class="av-bg" pointer-events="none">' + (bg || '') + '</g><g class="av-body" data-uid="' + uid + '">' + inner + '</g><g class="av-fx" pointer-events="none"></g></svg>';
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
    var lg = !opts.head && opts.bg !== false && opts.logo !== false ? logoBg(uid, P.glow, opts.anim !== false) : '';
    return svgWrap(body, labelOf(state, opts), uid, opts.head ? (CX - 62) + ' ' + r1(P.headY - 64) + ' 124 124' : null, lg);
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
    var bgg = root.querySelector('.av-bg'), lgKey = opts.bg === false || opts.logo === false ? 'off' : r1(P1.glow * 10) + '';
    var reduce0 = false;
    try { reduce0 = root.ownerDocument.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
    if (bgg && av.lg !== lgKey) { av.lg = lgKey; bgg.innerHTML = lgKey === 'off' ? '' : logoBg(av.uid, P1.glow, !reduce0); }

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
    var gearSwap = P0.level !== P1.level;
    if (gearSwap) { dur = Math.max(dur, 1500); if (!root.querySelector('#sil' + av.uid)) root.insertAdjacentHTML('afterbegin',
      '<defs><filter id="sil' + av.uid + '" x="-20%" y="-20%" width="140%" height="140%"><feFlood flood-color="#120f0a"/><feComposite in2="SourceAlpha" operator="in" result="d"/>' +
      '<feMorphology in="SourceAlpha" operator="dilate" radius="1.2" result="e"/><feFlood flood-color="' + GOLD + '"/><feComposite in2="e" operator="in" result="g"/>' +
      '<feMerge><feMergeNode in="g"/><feMergeNode in="d"/></feMerge></filter></defs>'); }
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
      var P = mixP(P0, P1, e), fxo = { pump: up ? Math.sin(Math.PI * t) : 0, flash: up ? Math.sin(Math.PI * t) * 0.6 : 0, ring: withSparks ? clamp(ms / 1000, 0, 1) : 1 };
      var html = drawBody(P, av.uid, fxo);
      if (gearSwap) {          // смена звания: боец уходит в тёмный силуэт, форма меняется в темноте, силуэт тает
        var dk = t < 0.2 ? 0 : t < 0.42 ? (t - 0.2) / 0.22 : t < 0.58 ? 1 : t < 0.85 ? 1 - (t - 0.58) / 0.27 : 0;
        dk = dk * dk * (3 - 2 * dk);
        P.level = t < 0.5 ? P0.level : P1.level; html = drawBody(P, av.uid, fxo);
        if (dk > 0.01) { var Ps = {}; for (var kk in P) Ps[kk] = P[kk]; Ps.bg = false;
          html += '<g filter="url(#sil' + av.uid + ')" opacity="' + r1(dk * 100) / 100 + '">' + drawBody(Ps, av.uid + 's', {}) + '</g>'; }
      }
      body.innerHTML = html;
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


  /* ------------------------------------------------------------------ праздник нового звания */
  // Avatar.rankUp({state, fromState?, from, to, rankName(l), line, sign, onClose, sound, haptic}) — полноэкранный праздник:
  // лучи, конфетти, «НОВОЕ ЗВАНИЕ!», боец переодевается в новую форму, что открылось, фраза Паши, кнопка.
  var UNLOCK = { 2: 'Форма, кепка, берцы и чистые погоны', 3: 'Лычка ефрейтора и жетон', 4: 'Вторая лычка и напульсник', 5: 'Три лычки, красный берет и золотой рант',
    6: 'Продольная лычка старшины и золотая бляха', 7: 'Офицерский просвет и первая звезда', 8: 'Две звезды лейтенанта, синий берет и звезда на рукаве',
    9: 'Четыре звезды капитана и золотой жетон', 10: 'Два просвета, большая звезда и фуражка', 11: 'Три большие звезды полковника',
    12: 'Золотые генеральские погоны, золотой берет и сияние' };
  var RU_CSS = '.avru{position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;background:radial-gradient(circle at 50% 42%,#3b2c14,#0b0b0c 62%);opacity:0;transition:opacity .35s;font-family:-apple-system,"PT Sans",sans-serif;color:#f1ece3;padding:20px 16px calc(20px + env(safe-area-inset-bottom,0px))}' +
    '.avru.on{opacity:1}.avru .rays{position:absolute;left:50%;top:42%;width:240vmax;height:240vmax;margin:-120vmax 0 0 -120vmax;background:repeating-conic-gradient(from 0deg,rgba(243,220,170,.16) 0 7deg,transparent 7deg 18deg);animation:avruSpin 18s linear infinite;pointer-events:none}' +
    '.avru .glow{position:absolute;left:50%;top:42%;width:520px;height:520px;margin:-260px 0 0 -260px;border-radius:50%;background:radial-gradient(circle,rgba(255,214,120,.55),rgba(212,180,122,.15) 45%,transparent 70%);animation:avruPulse 1.6s ease-in-out infinite;pointer-events:none}' +
    '.avru .cf{position:absolute;top:-20px;width:9px;height:14px;border-radius:2px;pointer-events:none;z-index:1;animation:avruFall linear forwards}' +
    '.avru>h2,.avru>.lv,.avru>.fig,.avru>.unl,.avru>.say,.avru>button{z-index:2}' +
    '.avru h2{position:relative;margin:0;font-family:"Russo One",sans-serif;font-size:34px;letter-spacing:.04em;background:linear-gradient(180deg,#fff4d8,#d4b47a 55%,#a8854b);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 0 18px rgba(255,214,120,.6));animation:avruPop .7s cubic-bezier(.2,1.6,.4,1) both}' +
    '.avru .lv{position:relative;margin:10px 0 4px;display:flex;align-items:center;gap:10px;animation:avruPop .7s .15s cubic-bezier(.2,1.6,.4,1) both}' +
    '.avru .lv b{display:grid;place-items:center;width:46px;height:46px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff4d8,#d4b47a 60%,#8a6a32);color:#1a140b;font-family:"Russo One",sans-serif;font-size:22px;box-shadow:0 0 22px rgba(255,214,120,.7)}' +
    '.avru .lv span{font-family:"Russo One",sans-serif;font-size:24px;line-height:1.15;color:#fff4d8;text-shadow:0 2px 12px #000;max-width:260px}.avru .lv span em{display:block;font-style:normal;font-size:17px;color:#f3dcaa}' +
    '.avru .fig{position:relative;width:min(62vw,250px);height:min(78vw,320px);animation:avruRise .8s .2s cubic-bezier(.2,1.3,.4,1) both}' +
    '.avru .unl{position:relative;margin-top:4px;padding:8px 14px;border-radius:14px;background:rgba(23,24,28,.8);border:1px solid #d4b47a;color:#f3dcaa;font-weight:700;font-size:15px;line-height:1.35;text-align:center;animation:avruPop .6s 1.2s both}' +
    '.avru .say{position:relative;margin:10px 0 0;max-width:340px;text-align:center;font-size:16px;line-height:1.4;color:#e9e1d2;animation:avruPop .6s 1.5s both}.avru .say i{display:block;font-size:13px;color:#b8b2a8;margin-top:3px}' +
    '.avru button{position:relative;margin-top:14px;width:min(100%,360px);padding:15px;border:0;border-radius:16px;font-family:"Russo One",sans-serif;font-size:17px;color:#15120d;background:linear-gradient(180deg,#fff4d8,#d4b47a 60%,#b8935a);box-shadow:0 10px 30px rgba(212,180,122,.4);animation:avruPop .6s 1.8s both}' +
    '@keyframes avruSpin{to{transform:rotate(360deg)}}@keyframes avruPulse{50%{transform:scale(1.12);opacity:.8}}' +
    '@keyframes avruFall{to{transform:translate3d(var(--dx),110vh,0) rotate(var(--r))}}@keyframes avruPop{from{transform:scale(.3);opacity:0}}@keyframes avruRise{from{transform:translateY(40px) scale(.8);opacity:0}}' +
    '@media (prefers-reduced-motion:reduce){.avru .rays,.avru .glow{animation:none}.avru .cf{display:none}}';
  function rankUp(o) {
    o = o || {};
    var doc = document, from = o.from || 1, to = o.to || from + 1;
    if (!doc.getElementById('avru-css')) { var st = doc.createElement('style'); st.id = 'avru-css'; st.textContent = RU_CSS; doc.head.appendChild(st); }
    var old = doc.querySelector('.avru'); if (old) old.remove();
    var ov = doc.createElement('div'); ov.className = 'avru'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Новое звание');
    var name = o.rankName ? o.rankName(to) : RANKS[to - 1];
    var opened = []; for (var l = from + 1; l <= to; l++) if (UNLOCK[l]) opened.push(UNLOCK[l]);
    if (o.restore) opened = [];
    ov.innerHTML = '<div class="rays"></div><div class="glow"></div><h2>' + (o.restore ? 'ЗВАНИЕ ВОЗВРАЩЕНО!' : 'НОВОЕ ЗВАНИЕ!') + '</h2>' +
      '<div class="lv"><b>' + to + '</b><span>' + rankParts(name)[0] + (rankParts(name)[1] ? '<em>' + rankParts(name)[1] + '</em>' : '') + '</span></div>' + (o.state ? '<div class="fig"></div>' : '') +
      (opened.length ? '<div class="unl">🎖 Открыто: ' + opened.slice(-3).join(' · ') + (opened.length > 3 ? ' · и ещё ' + (opened.length - 3) : '') + '</div>' : '') +
      (o.line ? '<div class="say">' + o.line + (o.sign ? '<i>— ' + o.sign + '</i>' : '') + '</div>' : '') +
      '<button type="button">СЛУЖУ «КОДУ ТЕЛА»!</button>';
    var cols = ['#d4b47a', '#f3dcaa', '#fff4d8', '#a3262e', '#5f7046', '#ffb547', '#ffffff'];
    for (var i = 0; i < (o.restore ? 28 : 70); i++) {
      var c = doc.createElement('i'); c.className = 'cf';
      c.style.left = (Math.random() * 100) + 'vw'; c.style.background = cols[i % cols.length];
      c.style.setProperty('--dx', ((Math.random() - 0.5) * 30) + 'vw'); c.style.setProperty('--r', (360 + Math.random() * 900) + 'deg');
      c.style.animationDuration = (2.2 + Math.random() * 2.4) + 's'; c.style.animationDelay = (Math.random() * 1.4) + 's';
      if (i % 3 === 0) { c.style.width = '7px'; c.style.height = '7px'; c.style.borderRadius = '50%'; }
      ov.appendChild(c);
    }
    doc.body.appendChild(ov);
    requestAnimationFrame(function () { ov.classList.add('on'); });
    if (o.state) setTimeout(function () {       // боец переодевается: старая форма → новая, с искрами
      render(ov.querySelector('.fig'), o.state, { from: o.fromState || o.state, fromLevel: from, level: to, animate: true, duration: 1300 });
    }, 450);
    try { if (o.haptic) o.haptic(); } catch (e) {}
    try { if (o.sound) setTimeout(o.sound, 300); } catch (e) {}
    var close = function () { ov.classList.remove('on'); setTimeout(function () { ov.remove(); if (o.onClose) o.onClose(); }, 350); };
    ov.querySelector('button').onclick = close;
    return { close: close, el: ov };
  }

  /* ------------------------------------------------------------------ разжалование */
  // Avatar.demote({state, from, to, rankName(l), line, sign, sound, onClose}) — без унижения: погон тускнеет, знак со звоном
  // отлетает, форма через тёмный силуэт откатывается на прошлую ступень, боец разводит руками. Анимация ≤ 3 с.
  var DM_CSS = '.avdm{position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;' +
    'background:radial-gradient(circle at 50% 40%,#232633,#0b0b0c 66%);opacity:0;transition:opacity .35s;font-family:-apple-system,"PT Sans",sans-serif;color:#f1ece3;padding:20px 16px calc(20px + env(safe-area-inset-bottom,0px))}' +
    '.avdm.on{opacity:1}.avdm h2{margin:0;font-family:"Russo One",sans-serif;font-size:28px;letter-spacing:.04em;color:#c9ccd2;animation:avruPop .6s both}' +
    '.avdm .lv{margin:8px 0 2px;font-size:17px;color:#e9e1d2;text-align:center;animation:avruPop .6s .1s both}.avdm .lv{white-space:nowrap}.avdm .lv b{font-family:"Russo One",sans-serif;font-size:min(19px,4.6vw);color:#f3dcaa}' +
    '.avdm .fig{position:relative;width:min(60vw,240px);height:min(76vw,300px);transition:filter 1s}.avdm .fig.dim{filter:saturate(.55) brightness(.82)}' +
    '.avdm .figw{position:relative}.avdm .pin{position:absolute;left:68%;top:31%;width:20px;height:20px;opacity:0;pointer-events:none}.avdm .pin.go{animation:avdmFly 1.3s cubic-bezier(.3,.7,.4,1) forwards}' +
    '.avdm .ret{margin-top:6px;padding:10px 14px;border-radius:14px;background:rgba(23,24,28,.85);border:1px solid #7a684a;color:#f3dcaa;font-weight:700;font-size:15px;text-align:center;animation:avruPop .6s 2.4s both}' +
    '.avdm .say{margin:16px 0 0;max-width:340px;text-align:center;font-size:16px;line-height:1.4;color:#e9e1d2;animation:avruPop .6s 2.6s both}.avdm .say i{display:block;font-size:13px;color:#b8b2a8;margin-top:3px}' +
    '.avdm button{margin-top:14px;width:min(100%,360px);min-height:50px;padding:14px;border:0;border-radius:16px;font-family:"Russo One",sans-serif;font-size:16px;color:#15120d;background:linear-gradient(180deg,#fff4d8,#d4b47a 60%,#b8935a);animation:avruPop .6s 2.8s both}' +
    '@keyframes avdmFly{0%{opacity:1;transform:translate(0,0) rotate(0) scale(1)}35%{opacity:1;transform:translate(46px,-70px) rotate(220deg) scale(1.25)}100%{opacity:0;transform:translate(90px,170px) rotate(620deg) scale(.7)}}' +
    '@keyframes avruPop{from{transform:scale(.3);opacity:0}}@media (prefers-reduced-motion:reduce){.avdm .pin{display:none}}';
  function demote(o) {
    o = o || {};
    var doc = document, from = o.from || 2, to = o.to || Math.max(1, from - 1);
    if (!doc.getElementById('avdm-css')) { var st = doc.createElement('style'); st.id = 'avdm-css'; st.textContent = DM_CSS; doc.head.appendChild(st); }
    var old = doc.querySelector('.avdm'); if (old) old.remove();
    var gen = o.rankGen ? o.rankGen(to) : RANKS_GEN[to - 1] || RANKS[to - 1];
    var ov = doc.createElement('div'); ov.className = 'avdm'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Разжалование');
    var gear = GEAR[clamp(from, 1, MAXL)], pin = gear >= 8 ? star5(11, 11, 10, GOLD2) : '<rect x="2" y="7" width="18" height="8" rx="2" fill="' + GOLD + '" stroke="' + INK + '" stroke-width="1.2"/>';
    ov.innerHTML = '<h2>РАЗЖАЛОВАН</h2><div class="lv">до <b>' + gen + '</b></div>' +
      (o.state ? '<div class="figw"><div class="fig"></div><svg class="pin" viewBox="0 0 22 22">' + pin + '</svg></div>' : '') +
      (o.line && /(3|три)\s*дн/i.test(o.line) ? '' : '<div class="ret">🎖 3 дня с приказом — и погоны вернутся</div>') +
      (o.line ? '<div class="say">' + o.line + (o.sign ? '<i>— ' + o.sign + '</i>' : '') + '</div>' : '') +
      '<button type="button">ПОНЯЛ, ВОЗВРАЩАЮСЬ В СТРОЙ</button>';
    doc.body.appendChild(ov);
    requestAnimationFrame(function () { ov.classList.add('on'); });
    if (o.state) {
      var fig = ov.querySelector('.fig');
      render(fig, o.state, { level: from, animate: false, logo: false, bg: false });
      setTimeout(function () { fig.classList.add('dim'); }, 250);                                       // погон тускнеет
      setTimeout(function () { var p = ov.querySelector('.pin'); if (p) p.classList.add('go'); try { if (o.sound) o.sound(); } catch (e) {} }, 550);   // знак отлетает со звоном
      setTimeout(function () { render(fig, o.state, { from: o.state, fromLevel: from, level: to, animate: true, duration: 1200, sparks: false, logo: false, bg: false }); }, 800);
      setTimeout(function () { fig.classList.remove('dim'); render(fig, o.state, { from: o.state, fromLevel: to, level: to, shrug: 1, animate: true, duration: 600, sparks: false, logo: false, bg: false }); }, 2150);   // разводит руками
    }
    var close = function () { ov.classList.remove('on'); setTimeout(function () { ov.remove(); if (o.onClose) o.onClose(); }, 350); };
    ov.querySelector('button').onclick = close;
    return { close: close, el: ov };
  }

  root.Avatar = {
    create: create, progress: progress, render: render, stage: stage, svg: svg, today: today,
    params: params, RANKS: RANKS.slice(), RANKS_GEN: RANKS_GEN.slice(), rankParts: rankParts, STAGES: STAGES.slice(), EVENTS: JSON.parse(JSON.stringify(EVENTS)),
    DAY_CAP: DAY_CAP, FULL: FULL, GOAL_MODE: GOAL_MODE, version: 2,
    SKINS: SKINS.map(function (x) { return x[0]; }), HAIRS: HAIRS.slice(), EYE_COLORS: EYE_COLORS.slice(),
    FACE: JSON.parse(JSON.stringify(FACE)), faceOf: faceOf, randomFace: randomFace, rankUp: rankUp, demote: demote, UNLOCK: JSON.parse(JSON.stringify(UNLOCK))
  };
})(typeof window !== 'undefined' ? window : this);
