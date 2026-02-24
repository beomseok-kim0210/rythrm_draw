import type { Stroke } from '../types';

/**
 * Renders user strokes onto a canvas context.
 * Called every frame from GameScreen's render loop.
 *
 * TODO (Week 2): Add fade-out trail effect (store stroke timestamps, decay opacity).
 * TODO (Week 2): Add watercolor brush spread shader via OffscreenCanvas.
 */
export class StrokeLayer {
  render(ctx: CanvasRenderingContext2D, strokes: Stroke[], current: Stroke | null): void {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    const all = current ? [...strokes, current] : strokes;
    for (const stroke of all) {
      if (stroke.isErased || stroke.points.length < 2) continue;
      this.drawStroke(ctx, stroke);
    }
  }

  private drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
    const pts = stroke.points;
    ctx.save();
    ctx.globalAlpha = stroke.opacity;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (stroke.brushType === 'neon') {
      ctx.shadowColor = stroke.color;
      ctx.shadowBlur = 14;
    }

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);

    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }

    const last = pts[pts.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
    ctx.restore();
  }
}
