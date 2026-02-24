/**
 * Compositor for the 5 canvas layers.
 * Each layer canvas is managed externally (via refs in GameScreen).
 * This module provides helper utilities shared by all layers.
 *
 * TODO (Week 2): Add compositing effects (glow pass, chromatic aberration).
 * TODO (Week 2): Implement offscreen canvas for better performance.
 */
export class Renderer {
  static clearLayer(ctx: CanvasRenderingContext2D): void {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }

  static drawRing(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    color: string,
    lineWidth = 2
  ): void {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  static drawText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    color = '#ffffff',
    font = 'bold 24px monospace'
  ): void {
    ctx.save();
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
  }
}
