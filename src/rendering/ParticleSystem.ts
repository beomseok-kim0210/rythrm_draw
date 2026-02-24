import type { Judgement } from '../types';

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number;
  decay: number;
  radius: number;
  color: string;
}

const JUDGEMENT_COLORS: Record<Judgement, string> = {
  PERFECT: '#00ffcc',
  GOOD:    '#ffff00',
  BAD:     '#ff8800',
  MISS:    '#888888',
  WRONG:   '#cc44ff',
};

export class ParticleSystem {
  private particles: Particle[] = [];

  /** 판정에 따라 파티클 발사 (MISS는 스킵) */
  emitJudgement(x: number, y: number, judgement: Judgement): void {
    if (judgement === 'MISS') return;
    const color = JUDGEMENT_COLORS[judgement];
    const count = judgement === 'PERFECT' ? 8 : 4;

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const speed = judgement === 'PERFECT'
        ? 2.5 + Math.random() * 2
        : 1.5 + Math.random() * 1.5;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: judgement === 'PERFECT' ? 0.025 : 0.04,
        radius: judgement === 'PERFECT' ? 5 : 3,
        color,
      });
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    this.particles = this.particles.filter((p) => p.life > 0);

    for (const p of this.particles) {
      p.x  += p.vx;
      p.y  += p.vy;
      p.vy += 0.06;
      p.life -= p.decay;

      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle   = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur  = 6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.1, p.radius * p.life), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  clear(): void { this.particles = []; }
}
