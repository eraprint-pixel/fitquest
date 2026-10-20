// Счёт повторений по точкам тела (MediaPipe Pose, 33 точки).
// Один и тот же код у приложения (index.html) и у проверки на видео («проверка счёта/»).
//
// У каждого упражнения есть «показатель» (угол в суставе, высота пятки…) и два порога:
// повторение — это уход за порог «вниз» и возврат за порог «вверх». Между порогами — запас,
// чтобы дрожание распознавания не давало лишних повторений.
//
// Точки MediaPipe — доли ширины и высоты кадра. Кадр с телефона не квадратный, поэтому углы
// считаем после поправки на пропорции (update(lm, now, aspect), aspect = ширина / высота кадра):
// без неё наклонные кости искажались до 15°, и пороги зависели от того, как камера отдаёт кадр.

export const VIS = 0.5;          // точка считается видимой с такой уверенности
export const MIN_REP_MS = 450;   // быстрее не бывает — это дрожание распознавания
const POSE_GRACE = 8;            // столько кадров подряд (~0,3 с) «не та поза», прежде чем сбросить начатое повторение

export function angle(a, b, c) {
  const r = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  const d = Math.abs(r * 180 / Math.PI);
  return d > 180 ? 360 - d : d;
}
/** Наклон корпуса (середина плеч → середина таза) от горизонтали: 0 — лёжа, 90 — стоя. */
export function torsoTilt(lm) {
  const sx = (lm[11].x + lm[12].x) / 2, sy = (lm[11].y + lm[12].y) / 2;
  const hx = (lm[23].x + lm[24].x) / 2, hy = (lm[23].y + lm[24].y) / 2;
  return Math.atan2(Math.abs(sy - hy), Math.abs(sx - hx)) * 180 / Math.PI;
}
/** Точки с поправкой на пропорции кадра: x переводим в доли высоты. */
export function fitAspect(lm, aspect = 1) {
  return aspect === 1 ? lm : lm.map(p => ({ ...p, x: p.x * aspect }));
}
const vis = (lm, ids) => Math.min(...ids.map(i => lm[i].visibility ?? 1));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const LEGS = [[23, 25, 27], [24, 26, 28]], ARMS = [[11, 13, 15], [12, 14, 16]];
/** Угол в суставе на стороне, которую камера видит лучше. */
function sideAngle(lm, pts) {
  const v = pts.map(t => vis(lm, t));
  const side = v[0] >= v[1] ? 0 : 1;
  const [a, b, c] = pts[side].map(i => lm[i]);
  return { value: angle(a, b, c), vis: v[side], side };
}
/** Самый согнутый из видимых суставов (обе ноги / обе руки). Лицом к камере сгиб виден только
 *  на одной ноге — «сторона, которую видно лучше» давала прямую ногу, и присед не засчитывался. */
function minAngle(lm, pts) {
  const v = pts.map(t => vis(lm, t)), a = pts.map(t => angle(lm[t[0]], lm[t[1]], lm[t[2]]));
  const ok = [0, 1].filter(i => v[i] >= VIS);
  if (!ok.length) return { value: a[v[0] >= v[1] ? 0 : 1], vis: Math.max(...v), side: v[0] >= v[1] ? 0 : 1 };
  const side = ok.length === 2 ? (a[0] <= a[1] ? 0 : 1) : ok[0];
  return { value: a[side], vis: v[side], side };
}
/** Глубина приседа по бедру: насколько колено ниже таза, в длинах голени (стоя ≈ 1, бедро параллельно полу ≈ 0).
 *  Работает и боком, и лицом к камере; переводим в «угол», чтобы пороги были в тех же градусах. */
function thighAngle(lm) {
  const r = [0, 1].filter(i => vis(lm, LEGS[i]) >= VIS).map(i => {
    const [h, k, a] = LEGS[i].map(j => lm[j]);
    return (k.y - h.y) / Math.max(dist(k, a), 1e-3);
  });
  return r.length ? 90 + 90 * Math.max(-1, Math.min(1, Math.min(...r))) : 180;
}
/** Плечо: угол таз–плечо–локоть (0 — рука вдоль тела, 90 — в сторону, 180 — вверх). */
const shoulder = (lm, i) => angle(lm[[23, 24][i]], lm[[11, 12][i]], lm[[13, 14][i]]);
/** Кисти выше макушки: запястья выше носа хотя бы на треть длины корпуса. */
function handsUp(lm) {
  const torso = dist({ x: (lm[11].x + lm[12].x) / 2, y: (lm[11].y + lm[12].y) / 2 }, { x: (lm[23].x + lm[24].x) / 2, y: (lm[23].y + lm[24].y) / 2 });
  return Math.max(lm[15].y, lm[16].y) < lm[0].y - torso * .1 && vis(lm, [15, 16]) >= VIS * .6;
}
const squatMetric = lm => { const m = minAngle(lm, LEGS); m.value = Math.min(m.value, thighAngle(lm)); return m; };

// dir −1: показатель уменьшается при движении (угол сгиба), +1: растёт (подъём пятки, руки в стороны).
// torso — допустимый наклон корпуса от горизонтали: приседают стоя, отжимаются лёжа.
// Без этого «отжимания» засчитывались, когда человек стоит и жестикулирует.
// pose(lm) — дополнительная проверка позы (false → «не та поза»), top(lm) — что ещё нужно для засчёта наверху.
// say — по каким словам узнать фразу тренера про это упражнение (чтобы на других упражнениях её не говорить);
// also — чьи фразы тоже подходят; max — показатель выше этого значит другое движение; front — снимают лицом к камере (фразы «повернись боком» не подходят).
// noP50 — без режима «Протокол 50» (у Паши скалолаз — по минуте, а не 50 повторов).
// tip и hints — на «ты», как говорит Паша, и в одну строку на экране 360 px (дизайн-стандарты).
// hints: start — пока нет повторений, down — после ухода вниз, pose — человек не в той позе.
export const EX = {
  // floor — меньше этого угла сустав не сгибается: такой угол — ошибка распознавания (обрезанные ноги, смена плана)
  squat: { name: "Приседания", ico: "🦵", skill: "legs", kind: "reps", dir: -1, down: 105, up: 160, torso: [35, 90], floor: 30,
           pts: [[23, 25, 27], [24, 26, 28]], metric: squatMetric, say: /присед/,
           tip: "Телефон в 2–3 м, всё тело в кадре",
           hints: { start: "Присядь — бёдра параллельно полу", pose: "Встань прямо, всё тело в кадре" } },
  // pose: корпус и бёдра одной линией (плечо–таз–колено ≥ 130°) — так и в полных, и в отжиманиях с колен;
  // лёжа на спине с руками за головой (скручивания) этот угол меньше — раньше там «отжимания» засчитывались
  pushup: { name: "Отжимания", ico: "💪", skill: "str", kind: "reps", dir: -1, down: 95, up: 150, torso: [0, 40], floor: 15,
            pts: [[11, 13, 15], [12, 14, 16]], metric: lm => sideAngle(lm, EX.pushup.pts), say: /отжим/,
            pose: lm => sideAngle(lm, [[11, 23, 25], [12, 24, 26]]).value >= 130,
            tip: "Телефон на пол сбоку, в 1,5–2 м",
            hints: { start: "Опустись ниже — согни руки", pose: "Упор лёжа, боком к камере" } },
  // выпад: сгибается переднее колено — берём самый согнутый из видимых коленей
  // (раньше требовали, чтобы были видны обе ноги, и выпады пропадали, когда дальнюю ногу закрывало тело)
  lunge: { name: "Выпады", ico: "🚶", skill: "legs", kind: "reps", dir: -1, down: 110, up: 155, torso: [55, 90], floor: 45, minRepMs: 900,
           pts: [[23, 25, 27], [24, 26, 28]], metric: lm => minAngle(lm, LEGS), say: /выпад/,
           tip: "Встань боком, в 2–3 м от телефона",
           hints: { start: "Шаг назад — колено почти до пола", pose: "Встань прямо, боком к камере" } },
  // подъём на носки: насколько пятка выше носка, в долях длины голени.
  // Если видны обе ступни — берём меньший подъём: при ходьбе пятка отрывается по очереди, на носках — обе сразу
  calf: { name: "На носки", ico: "🦶", skill: "legs", kind: "reps", dir: 1, down: 0.10, up: 0.035, torso: [55, 90], minRepMs: 600,
          pts: [[25, 27, 29, 31], [26, 28, 30, 32]], say: /носк|носоч|икр/,
          pose: lm => minAngle(lm, LEGS).value >= 145,   // на носки встают с прямыми ногами; согнутое колено — шаг или вставание
          metric: lm => {
            const P = [[25, 27, 29, 31], [26, 28, 30, 32]], v = P.map(t => vis(lm, t));
            const lift = P.map(t => { const [knee, ankle, heel, toe] = t.map(i => lm[i]); return (toe.y - heel.y) / Math.max(dist(knee, ankle), 1e-3); });
            if (v[0] >= VIS && v[1] >= VIS) return { value: Math.min(...lift), vis: Math.min(...v), side: lift[0] <= lift[1] ? 0 : 1 };
            const side = v[0] >= v[1] ? 0 : 1;
            return { value: lift[side], vis: v[side], side };
          },
          tip: "Встань боком, ступни в кадре",
          hints: { start: "Поднимись на носки до упора", pose: "Встань прямо, ноги прямые" } },
  // планка: время, пока корпус ровный и почти горизонтальный. Лёжа дальнюю сторону тела закрывает ближняя,
  // и уверенность в точках ниже — порог видимости vis для планки снижен
  plank: { name: "Планка", ico: "🧱", skill: "end", kind: "hold", torso: [0, 40], hold: [150, 180], vis: .4, label: "В ПЛАНКЕ", word: "в планке",
           pts: [[11, 23, 27], [12, 24, 28]], metric: lm => sideAngle(lm, EX.plank.pts), say: /планк/,
           tip: "Телефон на пол сбоку, в 1,5–2 м",
           hints: { start: "Держи! Тело одной линией", pose: "Встань в планку, боком к камере" } },
};

// Новые упражнения из программ Паши (видео IMG_9766/9773/9774/9775). Свойства неперечисляемые:
// Object.keys(EX) — только те пять, что знает игровой слой (приказ дня, замена упражнения, тексты задач);
// весь список для выбора на экране — EX_ORDER. Когда игра добавит им тексты, достаточно убрать enumerable: false.
const NEW = {
  // махи гантелями в стороны: обе руки до уровня плеч. Считаем по меньшему из двух углов в плече —
  // взмах одной рукой не засчитывается
  raise: { name: "Махи в стороны", ico: "🏋️", skill: "str", kind: "reps", dir: 1, down: 70, up: 35, max: 140, torso: [60, 90], minRepMs: 700, front: true,
           pts: [[23, 11, 13], [24, 12, 14]], say: /(^|[^а-яё])мах|гантел/,
           metric: lm => {
             const v = [0, 1].map(i => vis(lm, [11 + i, 13 + i, 23 + i])), a = [0, 1].map(i => shoulder(lm, i));
             if (v[0] >= VIS && v[1] >= VIS) return { value: Math.min(...a), vis: Math.min(...v), side: a[0] <= a[1] ? 0 : 1 };
             const side = v[0] >= v[1] ? 0 : 1;
             return { value: a[side], vis: v[side], side };
           },
           tip: "Лицом к камере, в 2–3 м, руки в кадре",
           hints: { start: "Руки в стороны до плеч", down: "Плавно вниз", pose: "Встань прямо, лицом к камере" } },
  // присед с жимом над головой (трастер; у Паши — с медболом или грифом): присед, затем вставая — руки вверх.
  // Засчитывается, только когда после приседа кисти поднялись выше головы
  thruster: { name: "Присед с жимом", ico: "🙌", skill: "legs", kind: "reps", dir: -1, down: 110, up: 150, torso: [35, 90], floor: 30, minRepMs: 1000, front: true,
              pts: [[23, 25, 27], [24, 26, 28]], metric: squatMetric, top: handsUp, say: /(^|[^а-яё])жим|над голов/, also: ["squat"],
              tip: "Лицом к камере, в 2,5–3 м, руки в кадре",
              hints: { start: "Присед — и руки вверх", down: "Вставай и жми вверх ⬆️", pose: "Встань прямо, всё тело в кадре" } },
  // скалолаз: в упоре на прямых руках по очереди подтягивают колени к груди. Каждую ногу считаем отдельно
  // (alt): угол плечо–таз–колено ≤ 100° — колено у груди, ≥ 140° — нога снова сзади; одно подтягивание = один повтор.
  // Сбоку видно обе ноги; спереди ноги закрыты корпусом — поэтому только боком к камере
  climber: { name: "Скалолаз", ico: "⛰️", skill: "end", kind: "reps", alt: true, noP50: true, dir: -1, down: 100, up: 140, torso: [0, 45], vis: .3, minRepMs: 400,
             pts: [[11, 23, 25], [12, 24, 26]], say: /скалолаз/,
             // упор на прямых руках: локоть прямой, кисть ниже плеча (лёжа на спине или стоя — не считаем)
             pose: lm => { const a = sideAngle(lm, ARMS), [sh, el, wr] = ARMS[a.side].map(i => lm[i]);
                           return a.value >= 140 && wr.y - sh.y > dist(sh, el); },
             metric: lm => { const m = sideAngle(lm, [[11, 23, 25], [12, 24, 26]]); return { value: m.value, vis: m.vis, side: m.side }; },
             tip: "Телефон на пол сбоку, в 1,5–2 м",
             hints: { start: "Колено к груди, по очереди", down: "Теперь другую!", pose: "Упор на прямых, боком к камере" } },
  // стульчик у стены: время, пока колено согнуто примерно под прямым углом, а корпус вертикален
  wallsit: { name: "Стульчик", ico: "🪑", skill: "end", kind: "hold", torso: [55, 90], hold: [50, 125], label: "НА СТУЛЬЧИКЕ", word: "на стульчике",
             pts: [[23, 25, 27], [24, 26, 28]], metric: squatMetric, say: /стульчик|у стены|к стене/,
             tip: "Спиной к стене, боком к камере",
             hints: { start: "Держи! Колени под прямым углом", pose: "Опустись: бёдра параллельно полу" } },
  // скручивания: подъём лопаток лёжа на спине — корпус отрывается от пола. Пол в кадре бывает под углом,
  // поэтому наклон считаем от «нуля» лёжа (base), который подстраивается сам
  crunch: { name: "Скручивания", ico: "🔥", skill: "end", kind: "reps", dir: 1, down: 14, up: 6, rel: true, torso: [0, 60], vis: .4, minRepMs: 700,
            pts: [[11, 23, 25], [12, 24, 26]], say: /скруч|лопатк/,
            // лёжа на спине, колени согнуты и выше таза; в упоре лёжа (скалолаз, планка) колени ниже таза
            pose: lm => { const s = sideAngle(lm, LEGS), [h, k] = LEGS[s.side].map(i => lm[i]);
                          return s.value < 140 && k.y < h.y; },
            metric: lm => { const m = sideAngle(lm, [[11, 23, 25], [12, 24, 26]]); return { value: torsoTilt(lm), vis: m.vis, side: m.side }; },
            tip: "Телефон на пол сбоку, ляг на спину",
            hints: { start: "Оторви лопатки от пола", down: "Плавно вниз", pose: "Ляг на спину, колени согнуты" } },
};
for (const [k, e] of Object.entries(NEW)) Object.defineProperty(EX, k, { value: e, enumerable: false });
/** Порядок упражнений на экране выбора. Скручивания (crunch) пока скрыты: не проверены на съёмке сбоку. */
export const EX_ORDER = ["squat", "pushup", "lunge", "calf", "plank", "raise", "thruster", "climber", "wallsit"];

/** Автомат «вверх → вниз → вверх»: повторение засчитывается при возврате наверх.
 *  Для удержаний (планка, стульчик) — копит время, пока поза правильная. */
export class RepCounter {
  constructor(exKey, cfg = {}) {
    this.e = { ...EX[exKey], ...cfg };
    this.state = "up"; this.smooth = null; this.downAt = null; this.lastRepAt = -1e9; this.reps = 0;
    this.holdMs = 0; this.lastT = null; this.spike = 0; this.offPose = 0; this.base = null;
    this.legs = [{ s: "up", v: null, at: -1e9 }, { s: "up", v: null, at: -1e9 }];   // для alt: своя «вверх-вниз» у каждой ноги
  }
  /** lm — точки позы или null; now — мс; aspect — ширина/высота кадра. Возвращает, что показать на экране. */
  update(lm, now, aspect = 1) {
    const e = this.e, dt = this.lastT == null ? 0 : Math.min(250, now - this.lastT);
    this.lastT = now;
    if (!lm) return { status: "nobody" };
    lm = fitAspect(lm, aspect);
    const m = e.metric(lm);
    if (m.vis < (e.vis ?? VIS)) return { status: "lowvis", side: m.side };
    const tilt = torsoTilt(lm);
    if (tilt < e.torso[0] || tilt > e.torso[1] || (e.pose && !e.pose(lm))) {   // не та поза — не считаем
      // одиночный кадр не в той позе (наклон в глубоком приседе, сбой) не сбрасывает начатое повторение
      if (++this.offPose >= POSE_GRACE) { this.state = "up"; this.smooth = null; this.base = null; for (const g of this.legs) { g.s = "up"; g.v = null; } }
      return { status: "pose", side: m.side, tilt, holdMs: e.kind === "hold" ? this.holdMs : undefined };
    }
    this.offPose = 0;
    if (e.alt) return this.alternate(lm, now);
    if (e.floor && m.value < e.floor) return { status: "lowvis", side: m.side };   // невозможный угол
    // max — выше этого уже другое движение (руки над головой — жим или тяга, а не махи): начатое повторение не считаем
    // и следующее засчитаем только после возврата в исходное положение (state "wait")
    if (e.max && m.value > e.max) { this.state = "wait"; return { status: "pose", side: m.side, tilt }; }
    // угол не может скакнуть на 70° за кадр — это сбой распознавания; верим, только если держится 3 кадра
    if (e.dir < 0 && this.smooth != null && Math.abs(m.value - this.smooth) > 70 && ++this.spike < 3)
      return { status: "ok", side: m.side, angle: this.smooth, raw: m.value, depth: null, rep: false, state: this.state };
    this.spike = 0;
    this.smooth = this.smooth == null ? m.value : this.smooth * .6 + m.value * .4;
    if (e.kind === "hold") {
      const ok = this.smooth >= e.hold[0] && this.smooth <= e.hold[1];
      if (ok) this.holdMs += dt;
      return { status: ok ? "ok" : "pose", side: m.side, holding: ok, holdMs: this.holdMs, depth: ok ? 1 : 0 };
    }
    // rel: пороги — отступ от «нуля» (base); ноль — самое низкое значение, медленно ползёт вверх (2°/с),
    // чтобы подстроиться, если человек лёг иначе или сдвинул телефон
    let val = this.smooth;
    if (e.rel) {
      if (this.base == null || val < this.base) this.base = val;
      else if (this.state === "up") this.base += dt * .002;
      val -= this.base;
    }
    // приводим к виду «меньше — глубже»: для подъёма на носки и махов знак показателя меняем
    const v = e.dir < 0 ? val : -val, down = e.dir < 0 ? e.down : -e.down, up = e.dir < 0 ? e.up : -e.up;
    const depth = Math.max(0, Math.min(1, (up - v) / (up - down)));
    const minMs = e.minRepMs || MIN_REP_MS;
    let rep = false;
    if (this.state === "wait") { if (v > up) this.state = "up"; }
    else if (this.state === "up" && v < down) {
      this.state = "down"; this.downAt = now;
    } else if (this.state === "down" && v > up && now - this.downAt > minMs * .5 && now - this.lastRepAt > minMs
               && (!e.top || e.top(lm))) {
      this.state = "up"; this.lastRepAt = now; this.reps++; rep = true;
    }
    return { status: "ok", side: m.side, angle: this.smooth, raw: m.value, depth, rep, state: this.state };
  }
  /** Попеременные движения (скалолаз): у каждой видимой ноги свой автомат; повтор — когда любая нога вернулась назад. */
  alternate(lm, now) {
    const e = this.e, minMs = e.minRepMs || MIN_REP_MS;
    let rep = false, depth = 0, side = 0, best = 1e9;
    for (const i of [0, 1]) {
      const g = this.legs[i], t = e.pts[i];
      if (vis(lm, t) < e.vis) continue;
      const a = angle(lm[t[0]], lm[t[1]], lm[t[2]]);
      g.v = g.v == null ? a : g.v * .5 + a * .5;
      if (g.v < best) { best = g.v; side = i; }
      depth = Math.max(depth, Math.max(0, Math.min(1, (e.up - g.v) / (e.up - e.down))));
      if (g.s === "up" && g.v < e.down) { g.s = "down"; g.downAt = now; }
      else if (g.s === "down" && g.v > e.up && now - g.at > minMs && now - this.lastRepAt > 250) {
        g.s = "up"; g.at = now; this.lastRepAt = now; this.reps++; rep = true;
      }
    }
    const state = this.legs.some(g => g.s === "down") ? "down" : "up";
    return { status: "ok", side, angle: best, depth, rep, state };
  }
}
