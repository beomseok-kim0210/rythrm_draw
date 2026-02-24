import type { GestureType, RequiredGesture, HandLandmark } from '../types';
import type { ScheduledNote } from '../core/BeatEngine';
import { APPROACH_MS } from '../core/BeatEngine';

export const INNER_RADIUS = 90;
const OUTER_RADIUS_START = 200;

const GESTURE_COLORS: Record<RequiredGesture, string> = {
  ROCK: '#58d6ff',
  SCISSORS: '#58d6ff',
  PAPER: '#58d6ff',
};

type FeedbackKind = 'PERFECT' | 'GOOD' | 'BAD' | 'MISS' | 'WRONG';

interface RingBurst {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  color: string;
}

interface FeedbackText {
  x: number;
  y: number;
  text: string;
  color: string;
  alpha: number;
  vy: number;
}

const FEEDBACK_CONFIG: Record<
  FeedbackKind,
  { text: string; color: string; ringColor: string }
> = {
  PERFECT: { text: 'PERFECT!', color: '#ffff44', ringColor: '#ffffff' },
  GOOD: { text: 'GOOD', color: '#44ff88', ringColor: '#44ff88' },
  BAD: { text: 'BAD', color: '#ff9900', ringColor: '#ff9900' },
  MISS: { text: 'MISS', color: '#888888', ringColor: '#888888' },
  WRONG: { text: 'WRONG!', color: '#cc44ff', ringColor: '#ff3344' },
};

const HAND_CONNECTIONS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

export class GuideLayer {
  private ringBursts: RingBurst[] = [];
  private feedbackTexts: FeedbackText[] = [];
  private approachPulseFired = new Set<string>();

  addFeedback(x: number, y: number, kind: FeedbackKind): void {
    const cfg = FEEDBACK_CONFIG[kind];

    if (kind !== 'MISS') {
      this.ringBursts.push({
        x,
        y,
        radius: INNER_RADIUS,
        maxRadius: kind === 'PERFECT' ? INNER_RADIUS + 90 : INNER_RADIUS + 55,
        alpha: 1,
        color: cfg.ringColor,
      });
    }

    if (kind === 'WRONG') {
      this.ringBursts.push({
        x: x - 16,
        y,
        radius: 10,
        maxRadius: 36,
        alpha: 0.9,
        color: '#ff3344',
      });
      this.ringBursts.push({
        x: x + 16,
        y,
        radius: 10,
        maxRadius: 36,
        alpha: 0.9,
        color: '#ff3344',
      });
    }

    this.feedbackTexts.push({
      x,
      y: y - INNER_RADIUS - 14,
      text: cfg.text,
      color: cfg.color,
      alpha: 1,
      vy: -1.25,
    });
  }

  render(
    ctx: CanvasRenderingContext2D,
    cursors: Array<{
      point: { x: number; y: number };
      gesture: GestureType;
      pendingGesture: GestureType;
      swing: number;
      landmarks: HandLandmark[];
    }>,
    activeNotes: ScheduledNote[],
    currentTimeMs: number
  ): void {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;

    for (const note of activeNotes) {
      const timeLeft = note.t_ms - currentTimeMs;
      if (timeLeft > APPROACH_MS || timeLeft < -200) continue;
      this.drawNote(ctx, note.id, note.x * w, note.y * h, timeLeft, note.required_gesture as RequiredGesture);
    }

    this.ringBursts = this.ringBursts.filter((r) => r.alpha > 0);
    for (const r of this.ringBursts) {
      ctx.save();
      ctx.globalAlpha = r.alpha;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      r.radius += (r.maxRadius - INNER_RADIUS) / 18;
      r.alpha -= 0.055;
    }

    this.feedbackTexts = this.feedbackTexts.filter((t) => t.alpha > 0);
    for (const t of this.feedbackTexts) {
      ctx.save();
      ctx.globalAlpha = t.alpha;
      ctx.font = 'bold 26px monospace';
      ctx.fillStyle = t.color;
      ctx.textAlign = 'center';
      ctx.fillText(t.text, t.x, t.y);
      ctx.restore();
      t.y += t.vy;
      t.alpha -= 0.022;
    }

    for (const c of cursors) {
      this.drawCursor(
        ctx,
        c.point,
        c.gesture,
        c.pendingGesture,
        c.swing,
        c.landmarks
      );
    }
  }

  private drawNote(
    ctx: CanvasRenderingContext2D,
    noteId: string,
    x: number,
    y: number,
    timeLeft: number,
    rg: RequiredGesture
  ): void {
    const color = GESTURE_COLORS[rg];
    const progress = Math.max(0, Math.min(1, 1 - timeLeft / APPROACH_MS));
    const outerR = OUTER_RADIUS_START - (OUTER_RADIUS_START - INNER_RADIUS) * progress;
    const ringAlpha = 0.4 + 0.5 * progress;

    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = `${color}33`;
    ctx.beginPath();
    ctx.arc(x, y, INNER_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = color;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(x, y, INNER_RADIUS, 0, Math.PI * 2);
    ctx.stroke();

    this.drawGestureIcon(ctx, x, y, rg, color);

    // Outside ring touches target ring timing pulse.
    if (Math.abs(outerR - INNER_RADIUS) < 1.2) {
      if (!this.approachPulseFired.has(noteId)) {
        this.approachPulseFired.add(noteId);
        this.ringBursts.push({
          x,
          y,
          radius: INNER_RADIUS - 6,
          maxRadius: INNER_RADIUS + 32,
          alpha: 0.95,
          color: '#ffffff',
        });
      }
    } else if (outerR > INNER_RADIUS + 12) {
      this.approachPulseFired.delete(noteId);
    }

    if (outerR > INNER_RADIUS + 1) {
      ctx.globalAlpha = ringAlpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, outerR, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawGestureIcon(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    gesture: RequiredGesture,
    color: string
  ): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Unified strike icon (drum hit) for wrist-flick mode.
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    this.pathRoundedRect(ctx, -14, -7, 28, 24, 6);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = color;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(-17, -18);
    ctx.lineTo(0, -1);
    ctx.lineTo(17, -18);
    ctx.stroke();

    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, -1, 2.8, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  private pathRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ): void {
    const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  private drawCursor(
    ctx: CanvasRenderingContext2D,
    point: { x: number; y: number },
    gesture: GestureType,
    pendingGesture: GestureType,
    swing: number,
    landmarks: HandLandmark[]
  ): void {
    const colorMap: Record<GestureType, string> = {
      ROCK: '#ff4a4a',
      SCISSORS: '#ffd84a',
      PAPER: '#4aa9ff',
      POINT: '#88ff88',
      IDLE: 'rgba(255,255,255,0.45)',
    };

    const tapX = point.x;
    const tapY = point.y;

    // Raw MediaPipe hand overlay.
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = 'rgba(120,220,255,0.9)';
    ctx.lineWidth = 2;
    for (const [a, b] of HAND_CONNECTIONS) {
      const la = landmarks[a];
      const lb = landmarks[b];
      if (!la || !lb) continue;
      ctx.beginPath();
      ctx.moveTo(la.x * ctx.canvas.width, la.y * ctx.canvas.height);
      ctx.lineTo(lb.x * ctx.canvas.width, lb.y * ctx.canvas.height);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(210,245,255,0.95)';
    for (const lm of landmarks) {
      ctx.beginPath();
      ctx.arc(lm.x * ctx.canvas.width, lm.y * ctx.canvas.height, 2.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = colorMap[gesture];
    ctx.beginPath();
    ctx.arc(tapX, tapY, 30 + swing * 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.96;
    ctx.fillStyle = colorMap[gesture];
    ctx.beginPath();
    ctx.arc(tapX, tapY, 15 + swing * 6.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(tapX, tapY, 4.2, 0, Math.PI * 2);
    ctx.fill();

    if (pendingGesture !== gesture && pendingGesture !== 'IDLE') {
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = colorMap[pendingGesture];
      ctx.beginPath();
      ctx.arc(tapX, tapY, 18, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
