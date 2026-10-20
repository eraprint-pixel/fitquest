// Счёт повторений по точкам тела (MediaPipe Pose, 33 точки).
// Один и тот же код у приложения (index.html) и у проверки на видео («проверка счёта/»).
//
// У каждого упражнения есть «показатель» (угол в суставе, высота пятки…) и два порога:
// повторение — это уход за порог «вниз» и возврат за порог «вверх». Между порогами — запас,
// чтобы дрожание распознавания не давало лишних повторений.

export const VIS = 0.5;          // точка считается видимой с такой уверенности
export const MIN_REP_MS = 450;   // быстрее не бывает — это дрожание распознавания

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
const vis = (lm, ids) => Math.min(...ids.map(i => lm[i].visibility ?? 1));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
/** Угол в суставе на стороне, которую камера видит лучше. */
function sideAngle(lm, pts) {
  const v = pts.map(t => vis(lm, t));
  const side = v[0] >= v[1] ? 0 : 1;
  const [a, b, c] = pts[side].map(i => lm[i]);
  return { value: angle(a, b, c), vis: v[side], side };
}

// dir −1: показатель уменьшается при движении (угол сгиба), +1: растёт (подъём пятки).
// torso — допустимый наклон корпуса от горизонтали: приседают стоя, отжимаются лёжа.
// Без этого «отжимания» засчитывались, когда человек стоит и жестикулирует.
export const EX = {
  // floor — меньше этого угла сустав не сгибается: такой угол — ошибка распознавания (обрезанные ноги, смена плана)
  squat: { name: "Приседания", ico: "🦵", skill: "legs", kind: "reps", dir: -1, down: 105, up: 160, torso: [35, 90], floor: 30,
           pts: [[23, 25, 27], [24, 26, 28]], metric: lm => sideAngle(lm, EX.squat.pts),
           tip: "Поставьте телефон так, чтобы было видно всё тело — лучше боком, в 2–3 метрах." },
  pushup: { name: "Отжимания", ico: "💪", skill: "str", kind: "reps", dir: -1, down: 95, up: 155, torso: [0, 40], floor: 15,
            pts: [[11, 13, 15], [12, 14, 16]], metric: lm => sideAngle(lm, EX.pushup.pts),
            tip: "Поставьте телефон на пол сбоку, в 1,5–2 метрах, чтобы были видны руки и корпус." },
  // выпад: сгибается переднее колено — берём меньший из двух углов в коленях
  lunge: { name: "Выпады", ico: "🚶", skill: "legs", kind: "reps", dir: -1, down: 110, up: 155, torso: [55, 90], floor: 45, minRepMs: 900,
           pts: [[23, 25, 27], [24, 26, 28]],
           metric: lm => {
             const l = angle(lm[23], lm[25], lm[27]), r = angle(lm[24], lm[26], lm[28]);
             return { value: Math.min(l, r), vis: Math.min(vis(lm, [23, 25, 27]), vis(lm, [24, 26, 28])), side: l <= r ? 0 : 1 };
           },
           tip: "Встаньте боком к камере в 2–3 метрах, чтобы были видны обе ноги целиком." },
  // подъём на носки: насколько пятка выше носка, в долях длины голени
  calf: { name: "На носки", ico: "🦶", skill: "legs", kind: "reps", dir: 1, down: 0.10, up: 0.035, torso: [55, 90],
          pts: [[25, 27, 29, 31], [26, 28, 30, 32]],
          metric: lm => {
            const v = [[25, 27, 29, 31], [26, 28, 30, 32]].map(t => vis(lm, t));
            const side = v[0] >= v[1] ? 0 : 1;
            const [knee, ankle, heel, toe] = [[25, 27, 29, 31], [26, 28, 30, 32]][side].map(i => lm[i]);
            return { value: (toe.y - heel.y) / Math.max(dist(knee, ankle), 1e-3), vis: v[side], side };
          },
          tip: "Встаньте боком к камере, ступни должны быть хорошо видны. Поднимайтесь на носки и опускайтесь." },
  // планка: время, пока корпус ровный и почти горизонтальный
  plank: { name: "Планка", ico: "🧱", skill: "end", kind: "hold", torso: [0, 30], straight: 155,
           pts: [[11, 23, 27], [12, 24, 28]], metric: lm => sideAngle(lm, EX.plank.pts),
           tip: "Поставьте телефон на пол сбоку в 1,5–2 метрах. Встаньте в планку — тело одной линией." },
};

/** Автомат «вверх → вниз → вверх»: повторение засчитывается при возврате наверх.
 *  Для планки — копит время, пока поза правильная. */
export class RepCounter {
  constructor(exKey, cfg = {}) {
    this.e = { ...EX[exKey], ...cfg };
    this.state = "up"; this.smooth = null; this.downAt = null; this.lastRepAt = -1e9; this.reps = 0;
    this.holdMs = 0; this.lastT = null; this.spike = 0;
  }
  /** lm — точки позы или null; now — мс. Возвращает, что показать на экране. */
  update(lm, now) {
    const e = this.e, dt = this.lastT == null ? 0 : Math.min(250, now - this.lastT);
    this.lastT = now;
    if (!lm) return { status: "nobody" };
    const m = e.metric(lm);
    if (m.vis < VIS) return { status: "lowvis", side: m.side };
    const tilt = torsoTilt(lm);
    if (tilt < e.torso[0] || tilt > e.torso[1]) {          // не та поза — не считаем и сбрасываем «вниз»
      this.state = "up"; this.smooth = null;
      return { status: "pose", side: m.side, tilt };
    }
    if (e.floor && m.value < e.floor) return { status: "lowvis", side: m.side };   // невозможный угол
    // угол не может скакнуть на 70° за кадр — это сбой распознавания; верим, только если держится 3 кадра
    if (e.dir < 0 && this.smooth != null && Math.abs(m.value - this.smooth) > 70 && ++this.spike < 3)
      return { status: "ok", side: m.side, angle: this.smooth, raw: m.value, depth: null, rep: false, state: this.state };
    this.spike = 0;
    this.smooth = this.smooth == null ? m.value : this.smooth * .6 + m.value * .4;
    if (e.kind === "hold") {
      const ok = this.smooth >= e.straight;                // тело одной линией: плечо-таз-лодыжка почти 180°
      if (ok) this.holdMs += dt;
      return { status: ok ? "ok" : "pose", side: m.side, holding: ok, holdMs: this.holdMs, depth: ok ? 1 : 0 };
    }
    // приводим к виду «меньше — глубже»: для подъёма на носки знак показателя меняем
    const v = e.dir < 0 ? this.smooth : -this.smooth, down = e.dir < 0 ? e.down : -e.down, up = e.dir < 0 ? e.up : -e.up;
    const depth = Math.max(0, Math.min(1, (up - v) / (up - down)));
    let rep = false;
    if (this.state === "up" && v < down) {
      this.state = "down"; this.downAt = now;
    } else if (this.state === "down" && v > up && now - this.downAt > (e.minRepMs || MIN_REP_MS) * .5
               && now - this.lastRepAt > (e.minRepMs || MIN_REP_MS)) {
      this.state = "up"; this.lastRepAt = now; this.reps++; rep = true;
    }
    return { status: "ok", side: m.side, angle: this.smooth, raw: m.value, depth, rep, state: this.state };
  }
}
