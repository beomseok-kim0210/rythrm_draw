import type { GestureType, RequiredGesture, HandLandmark } from '../types';
import type { ScheduledNote } from '../core/BeatEngine';
import { APPROACH_MS } from '../core/BeatEngine';
import {
  getSwipeGeometry,
  getSwipeSpeedTier,
} from '../core/SwipeMath';

export const INNER_RADIUS = 90;
const OUTER_RADIUS_START = 200;
const BASE_WIDTH = 1280;
const BASE_HEIGHT = 720;

const GESTURE_COLORS: Record<RequiredGesture, string> = {
  ROCK: '#58d6ff',
  SCISSORS: '#58d6ff',
  PAPER: '#58d6ff',
};
const SWIPE_PATH_COLOR = '#ff8f3f';
const SWIPE_FILL_COLOR = 'rgba(255,133,58,0.2)';

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
  private viewportScale = 1;

  setViewport(width: number, height: number): void {
    const scale = Math.min(width / BASE_WIDTH, height / BASE_HEIGHT);
    this.viewportScale = Math.max(0.65, Math.min(1.8, scale));
  }

  getInnerRadius(): number {
    return INNER_RADIUS * this.viewportScale;
  }

  addFeedback(x: number, y: number, kind: FeedbackKind): void {
    const cfg = FEEDBACK_CONFIG[kind];
    const inner = this.getInnerRadius();

    if (kind !== 'MISS') {
      this.ringBursts.push({
        x,
        y,
        radius: inner,
        maxRadius: kind === 'PERFECT' ? inner + 90 * this.viewportScale : inner + 55 * this.viewportScale,
        alpha: 1,
        color: cfg.ringColor,
      });
    }

    if (kind === 'WRONG') {
      this.ringBursts.push({
        x: x - 16 * this.viewportScale,
        y,
        radius: 10 * this.viewportScale,
        maxRadius: 36 * this.viewportScale,
        alpha: 0.9,
        color: '#ff3344',
      });
      this.ringBursts.push({
        x: x + 16 * this.viewportScale,
        y,
        radius: 10 * this.viewportScale,
        maxRadius: 36 * this.viewportScale,
        alpha: 0.9,
        color: '#ff3344',
      });
    }

    this.feedbackTexts.push({
      x,
      y: y - inner - 14 * this.viewportScale,
      text: cfg.text,
      color: cfg.color,
      alpha: 1,
      vy: -1.25 * this.viewportScale,
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
    currentTimeMs: number,
    swipeProgressMap?: Map<string, number>
  ): void {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    this.setViewport(w, h);
    const inner = this.getInnerRadius();

    for (const note of activeNotes) {
      const timeLeft = note.t_ms - currentTimeMs;
      const lateWindow = note.type === 'SWIPE' ? -Math.max(220, note.len_ms ?? 520) : -200;
      if (timeLeft > APPROACH_MS || timeLeft < lateWindow) continue;
      this.drawNote(
        ctx,
        note,
        timeLeft,
        inner,
        swipeProgressMap?.get(note.id) ?? 0
      );
    }

    this.ringBursts = this.ringBursts.filter((r) => r.alpha > 0);
    for (const r of this.ringBursts) {
      ctx.save();
      ctx.globalAlpha = r.alpha;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 3 * this.viewportScale;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      r.radius += (r.maxRadius - inner) / 18;
      r.alpha -= 0.055;
    }

    this.feedbackTexts = this.feedbackTexts.filter((t) => t.alpha > 0);
    for (const t of this.feedbackTexts) {
      ctx.save();
      ctx.globalAlpha = t.alpha;
      ctx.font = `bold ${Math.max(16, 26 * this.viewportScale)}px monospace`;
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
    note: ScheduledNote,
    timeLeft: number,
    inner: number,
    swipeProgress: number
  ): void {
    const x = note.x * ctx.canvas.width;
    const y = note.y * ctx.canvas.height;
    const noteId = note.id;
    const rg = note.required_gesture as RequiredGesture;
    const noteType = note.type;
    const color = GESTURE_COLORS[rg];
    const progress = Math.max(0, Math.min(1, 1 - timeLeft / APPROACH_MS));
    const outerStart = OUTER_RADIUS_START * this.viewportScale;
    const outerR = outerStart - (outerStart - inner) * progress;
    const ringAlpha = 0.4 + 0.5 * progress;

    ctx.save();
    if (noteType === 'SWIPE') {
      this.drawSwipePath(ctx, note, inner, swipeProgress);
    } else {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = `${color}33`;
      ctx.beginPath();
      ctx.arc(x, y, inner, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = color;
      ctx.lineWidth = 3.5 * this.viewportScale;
      ctx.beginPath();
      ctx.arc(x, y, inner, 0, Math.PI * 2);
      ctx.stroke();

      this.drawTapIcon(ctx, x, y, color);
    }

    if (Math.abs(outerR - inner) < 1.2 * this.viewportScale) {
      if (!this.approachPulseFired.has(noteId)) {
        this.approachPulseFired.add(noteId);
        this.ringBursts.push({
          x,
          y,
          radius: inner - 6 * this.viewportScale,
          maxRadius: inner + 32 * this.viewportScale,
          alpha: 0.95,
          color: '#ffffff',
        });
      }
    } else if (outerR > inner + 12 * this.viewportScale) {
      this.approachPulseFired.delete(noteId);
    }

    if (outerR > inner + this.viewportScale) {
      ctx.globalAlpha = ringAlpha;
      ctx.strokeStyle = noteType === 'SWIPE' ? SWIPE_PATH_COLOR : color;
      ctx.lineWidth = 3 * this.viewportScale;
      ctx.beginPath();
      ctx.arc(x, y, outerR, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawTapIcon(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    color: string
  ): void {
    const scale = this.viewportScale;
    ctx.save();
    ctx.translate(x, y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 2.6 * scale;
    ctx.beginPath();
    this.pathRoundedRect(ctx, -14 * scale, -7 * scale, 28 * scale, 24 * scale, 6 * scale);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = color;
    ctx.lineWidth = 2.6 * scale;
    ctx.beginPath();
    ctx.moveTo(-17 * scale, -18 * scale);
    ctx.lineTo(0, -scale);
    ctx.lineTo(17 * scale, -18 * scale);
    ctx.stroke();

    ctx.lineWidth = 2.2 * scale;
    ctx.beginPath();
    ctx.arc(0, -scale, 2.8 * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawSwipePath(
    ctx: CanvasRenderingContext2D,
    note: ScheduledNote,
    inner: number,
    swipeProgress: number
  ): void {
    const geom = getSwipeGeometry(note, ctx.canvas.width, ctx.canvas.height, inner);
    const scale = this.viewportScale;
    const startR = inner;
    const endR = inner;
    const lineWidth = inner * 0.36;
    const progress = Math.max(0, Math.min(1, swipeProgress));
    const progressX = geom.startX + (geom.endX - geom.startX) * progress;
    const progressY = geom.startY + (geom.endY - geom.startY) * progress;
    const perpX = -geom.dirY;
    const perpY = geom.dirX;
    const palette = this.getSwipePalette(note, inner);

    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = palette.path;
    ctx.lineWidth = lineWidth + 4 * scale;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(geom.startX, geom.startY);
    ctx.lineTo(geom.endX, geom.endY);
    ctx.stroke();

    ctx.globalAlpha = 0.33;
    ctx.fillStyle = palette.fill;
    ctx.beginPath();
    ctx.moveTo(geom.startX + perpX * lineWidth * 0.55, geom.startY + perpY * lineWidth * 0.55);
    ctx.lineTo(geom.endX + perpX * lineWidth * 0.48, geom.endY + perpY * lineWidth * 0.48);
    ctx.lineTo(geom.endX - perpX * lineWidth * 0.48, geom.endY - perpY * lineWidth * 0.48);
    ctx.lineTo(geom.startX - perpX * lineWidth * 0.55, geom.startY - perpY * lineWidth * 0.55);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 0.98;
    ctx.strokeStyle = palette.progress;
    ctx.lineWidth = lineWidth * 0.5;
    ctx.beginPath();
    ctx.moveTo(geom.startX, geom.startY);
    ctx.lineTo(progressX, progressY);
    ctx.stroke();

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = palette.path;
    ctx.beginPath();
    ctx.arc(geom.startX, geom.startY, startR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = palette.progress;
    ctx.lineWidth = 3.5 * scale;
    ctx.stroke();

    ctx.globalAlpha = 0.9;
    ctx.fillStyle = palette.accent;
    ctx.beginPath();
    ctx.arc(geom.endX, geom.endY, endR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = palette.progress;
    ctx.lineWidth = 3.5 * scale;
    ctx.stroke();

    const arrowSize = 21 * scale;
    ctx.fillStyle = palette.progress;
    ctx.beginPath();
    ctx.moveTo(geom.endX, geom.endY);
    ctx.lineTo(
      geom.endX - geom.dirX * arrowSize - perpX * arrowSize * 0.72,
      geom.endY - geom.dirY * arrowSize - perpY * arrowSize * 0.72
    );
    ctx.lineTo(
      geom.endX - geom.dirX * arrowSize + perpX * arrowSize * 0.72,
      geom.endY - geom.dirY * arrowSize + perpY * arrowSize * 0.72
    );
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 0.42;
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 2.2 * scale;
    for (let i = 1; i <= 3; i++) {
      const k = i / 3;
      ctx.beginPath();
      ctx.moveTo(
        geom.startX + geom.dirX * geom.pathLength * (0.12 + 0.24 * k),
        geom.startY + geom.dirY * geom.pathLength * (0.12 + 0.24 * k)
      );
      ctx.lineTo(
        geom.startX + geom.dirX * geom.pathLength * (0.12 + 0.24 * k) + perpX * 10 * scale,
        geom.startY + geom.dirY * geom.pathLength * (0.12 + 0.24 * k) + perpY * 10 * scale
      );
      ctx.stroke();
    }

    ctx.restore();
  }

  private getSwipePalette(
    note: ScheduledNote,
    inner: number
  ): { path: string; fill: string; progress: string; accent: string } {
    const tier = getSwipeSpeedTier(note, inner);
    if (tier === 'FAST') {
      return {
        path: '#ff6363',
        fill: 'rgba(255,88,88,0.22)',
        progress: '#ffe1dd',
        accent: '#ffb39e',
      };
    }
    if (tier === 'MED') {
      return {
        path: SWIPE_PATH_COLOR,
        fill: SWIPE_FILL_COLOR,
        progress: '#fff5c4',
        accent: '#ffd078',
      };
    }
    return {
      path: '#42dd9b',
      fill: 'rgba(60,220,156,0.22)',
      progress: '#dcffe8',
      accent: '#91f2ca',
    };
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
    const scale = this.viewportScale;
    const tapX = point.x;
    const tapY = point.y;

    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = 'rgba(120,220,255,0.9)';
    ctx.lineWidth = 2 * scale;
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
      ctx.arc(lm.x * ctx.canvas.width, lm.y * ctx.canvas.height, 2.1 * scale, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = colorMap[gesture];
    ctx.beginPath();
    ctx.arc(tapX, tapY, (30 + swing * 14) * scale, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.96;
    ctx.fillStyle = colorMap[gesture];
    ctx.beginPath();
    ctx.arc(tapX, tapY, (15 + swing * 6.5) * scale, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(tapX, tapY, 4.2 * scale, 0, Math.PI * 2);
    ctx.fill();

    if (pendingGesture !== gesture && pendingGesture !== 'IDLE') {
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = colorMap[pendingGesture];
      ctx.beginPath();
      ctx.arc(tapX, tapY, 18 * scale, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
