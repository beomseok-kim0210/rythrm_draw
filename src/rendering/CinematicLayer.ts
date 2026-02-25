export type CinematicStyle = 'RED_VORTEX' | 'WHITE_GATE' | 'CRIMSON_SHRINE';

interface SceneParticle {
  seedA: number;
  seedB: number;
  seedC: number;
  speed: number;
  size: number;
  alpha: number;
  layer: number;
}

interface ActiveScene {
  style: CinematicStyle;
  title: string;
  subtitle: string;
  startMs: number;
  endMs: number;
}

const TAU = Math.PI * 2;

export class CinematicLayer {
  private active: ActiveScene | null = null;
  private particles: SceneParticle[] = [];

  trigger(
    style: CinematicStyle,
    title: string,
    subtitle: string,
    nowMs: number,
    durationMs = 4200
  ): void {
    this.active = {
      style,
      title,
      subtitle,
      startMs: nowMs,
      endMs: nowMs + durationMs,
    };

    const count = style === 'RED_VORTEX' ? 1100 : style === 'WHITE_GATE' ? 900 : 1000;
    this.particles = Array.from({ length: count }, (_, idx) => ({
      seedA: Math.random(),
      seedB: Math.random(),
      seedC: Math.random(),
      speed: 0.45 + Math.random() * 1.55,
      size: 0.7 + Math.random() * 2.4,
      alpha: 0.12 + Math.random() * 0.88,
      layer: idx % 3,
    }));
  }

  clear(): void {
    this.active = null;
    this.particles = [];
  }

  getActiveTitle(): string | null {
    return this.active?.title ?? null;
  }

  render(ctx: CanvasRenderingContext2D, audioMs: number, bassEnergy: number): void {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    ctx.clearRect(0, 0, w, h);

    const scene = this.active;
    if (!scene) return;

    if (audioMs > scene.endMs) {
      this.clear();
      return;
    }

    const life = Math.max(1, scene.endMs - scene.startMs);
    const progress = (audioMs - scene.startMs) / life;
    const t = audioMs / 1000;
    const fadeIn = Math.min(1, progress * 4);
    const fadeOut = Math.min(1, (1 - progress) * 2.4);
    const opacity = Math.max(0, Math.min(1, fadeIn * fadeOut));

    this.drawBackdrop(ctx, t, bassEnergy, opacity);

    switch (scene.style) {
      case 'RED_VORTEX':
        this.drawRedVortex(ctx, t, bassEnergy, opacity);
        break;
      case 'WHITE_GATE':
        this.drawWhiteGate(ctx, t, bassEnergy, opacity);
        break;
      case 'CRIMSON_SHRINE':
        this.drawCrimsonShrine(ctx, t, bassEnergy, opacity);
        break;
    }

    this.drawVignette(ctx, opacity);
    this.drawScanlines(ctx, t, opacity);
    this.drawTitle(ctx, scene.title, scene.subtitle, opacity);
  }

  private drawBackdrop(
    ctx: CanvasRenderingContext2D,
    t: number,
    bassEnergy: number,
    opacity: number
  ): void {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, `rgba(5,8,14,${0.48 * opacity})`);
    bg.addColorStop(1, `rgba(0,0,0,${0.62 * opacity})`);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const bloom = ctx.createRadialGradient(
      w * 0.5,
      h * 0.5,
      20,
      w * 0.5,
      h * 0.5,
      w * (0.48 + bassEnergy * 0.06)
    );
    bloom.addColorStop(0, `rgba(120,190,255,${0.05 * opacity})`);
    bloom.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bloom;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.globalAlpha = 0.04 * opacity;
    for (let i = 0; i < this.particles.length; i += 4) {
      const p = this.particles[i];
      const gx = ((p.seedA + t * 0.012 * (p.layer + 1)) % 1) * w;
      const gy = ((p.seedB + t * 0.009 * (2.4 - p.speed)) % 1) * h;
      const noise = (Math.sin((gx + gy) * 0.03 + t * 4 + p.seedC * TAU) + 1) * 0.5;
      ctx.fillStyle = `rgba(255,255,255,${0.025 + noise * 0.045})`;
      ctx.fillRect(gx, gy, 1.6, 1.6);
    }
    ctx.restore();
  }

  private drawRedVortex(
    ctx: CanvasRenderingContext2D,
    t: number,
    bassEnergy: number,
    opacity: number
  ): void {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const cx = w * 0.58;
    const cy = h * 0.47;
    const baseR = Math.min(w, h) * (0.39 + bassEnergy * 0.06);

    const core = ctx.createRadialGradient(cx, cy, 2, cx, cy, baseR * 0.44);
    core.addColorStop(0, `rgba(255,240,240,${0.85 * opacity})`);
    core.addColorStop(0.26, `rgba(255,80,80,${0.72 * opacity})`);
    core.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = core;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let arm = 0; arm < 6; arm++) {
      const armOffset = (arm / 6) * TAU;
      ctx.strokeStyle = `rgba(255,40,40,${0.12 * opacity})`;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      for (let i = 0; i <= 64; i++) {
        const k = i / 64;
        const angle = armOffset + t * 1.15 + k * TAU * 1.45;
        const radius = 12 + baseR * k;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius * 0.72;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const ring = baseR * (0.05 + p.seedA * 0.95);
      const angle = t * (0.8 + p.speed) + p.seedB * TAU + ring * 0.003;
      const radius = ring * (0.74 + 0.26 * Math.sin(t * 1.4 + p.seedC * TAU));
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius * 0.72;
      const prevX = cx + Math.cos(angle - 0.08 * p.speed) * (radius - 1.5);
      const prevY = cy + Math.sin(angle - 0.08 * p.speed) * (radius - 1.5) * 0.72;
      const alpha = (0.08 + p.alpha * 0.34) * opacity;

      ctx.strokeStyle = `rgba(255,45,45,${alpha * 0.58})`;
      ctx.lineWidth = 1 + p.size * 0.32;
      ctx.beginPath();
      ctx.moveTo(prevX, prevY);
      ctx.lineTo(x, y);
      ctx.stroke();

      ctx.fillStyle = `rgba(255,90,90,${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, p.size * (1 + bassEnergy * 0.35), 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.33 * opacity;
    ctx.strokeStyle = '#ff7777';
    for (let i = 0; i < 4; i++) {
      const k = i / 4;
      const rr = baseR * (0.18 + k * 0.2) * (1 + bassEnergy * 0.09);
      ctx.lineWidth = 2.2 - k * 0.3;
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawWhiteGate(
    ctx: CanvasRenderingContext2D,
    t: number,
    bassEnergy: number,
    opacity: number
  ): void {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const cx = w * 0.5;
    const cy = h * 0.52;
    const gateW = Math.min(w, h) * (0.23 + bassEnergy * 0.04);
    const gateH = gateW * 1.28;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      const speed = 0.01 + p.speed * 0.01;
      const x = ((p.seedA + t * speed * (p.layer + 1)) % 1) * w;
      const y = ((p.seedB + t * speed * (2.4 - p.layer)) % 1) * h;
      const alpha = (0.03 + p.alpha * 0.18 + p.layer * 0.02) * opacity;
      const size = p.size * (0.8 + p.layer * 0.25);

      ctx.fillStyle = `rgba(180,230,255,${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    const halo = ctx.createRadialGradient(cx, cy, gateW * 0.18, cx, cy, gateW * 2);
    halo.addColorStop(0, `rgba(255,255,255,${0.42 * opacity})`);
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = '#ffffff';
    ctx.shadowColor = '#ccffff';
    ctx.shadowBlur = 30 + bassEnergy * 26;
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.ellipse(cx, cy, gateW, gateH, 0, 0, TAU);
    ctx.stroke();

    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(155,255,255,0.95)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, gateW * 0.91, gateH * 0.91, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.34 * opacity;
    ctx.strokeStyle = '#d7ffff';
    for (let i = 0; i < 26; i++) {
      const k = i / 26;
      const angle = t * 0.7 + k * TAU;
      const ex = cx + Math.cos(angle) * gateW * 1.04;
      const ey = cy + Math.sin(angle) * gateH * 1.04;
      const tx = cx + Math.cos(angle) * gateW * 1.17;
      const ty = cy + Math.sin(angle) * gateH * 1.17;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawCrimsonShrine(
    ctx: CanvasRenderingContext2D,
    t: number,
    bassEnergy: number,
    opacity: number
  ): void {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const horizonY = h * 0.58;

    const sky = ctx.createLinearGradient(0, 0, 0, horizonY);
    sky.addColorStop(0, `rgba(14,0,0,${0.8 * opacity})`);
    sky.addColorStop(1, `rgba(0,0,0,${0.2 * opacity})`);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, horizonY);

    const ground = ctx.createRadialGradient(
      w * 0.5,
      h * 1.04,
      10,
      w * 0.5,
      h * 1.04,
      w * 0.74
    );
    ground.addColorStop(0, `rgba(255,70,70,${0.52 * opacity})`);
    ground.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      const k = (p.seedA + t * 0.045 * p.speed) % 1;
      const band = p.layer === 0 ? 0.62 : p.layer === 1 ? 0.76 : 0.9;
      const x = (p.seedB * 1.6 - 0.3) * w;
      const y = h * band - k * h * (0.3 + p.layer * 0.14);
      const alpha = (0.05 + p.alpha * 0.22) * opacity;
      ctx.fillStyle = `rgba(255,65,65,${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, p.size * (1 + bassEnergy * 0.3), 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    const centerX = w * 0.5;
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = '#ff4a4a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(centerX, h * 0.92, w * 0.3 + bassEnergy * 20, Math.PI, TAU);
    ctx.stroke();

    const gateW = w * 0.25;
    const topY = h * 0.28;
    const pillarY = h * 0.76;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(centerX - gateW * 0.5, topY);
    ctx.lineTo(centerX - gateW * 0.5, pillarY);
    ctx.moveTo(centerX + gateW * 0.5, topY);
    ctx.lineTo(centerX + gateW * 0.5, pillarY);
    ctx.moveTo(centerX - gateW * 0.58, topY);
    ctx.lineTo(centerX + gateW * 0.58, topY);
    ctx.stroke();
    ctx.restore();
  }

  private drawVignette(ctx: CanvasRenderingContext2D, opacity: number): void {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const vignette = ctx.createRadialGradient(w * 0.5, h * 0.52, 20, w * 0.5, h * 0.52, w * 0.62);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, `rgba(0,0,0,${0.58 * opacity})`);
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
  }

  private drawScanlines(ctx: CanvasRenderingContext2D, t: number, opacity: number): void {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const offset = (t * 20) % 4;
    ctx.save();
    ctx.globalAlpha = 0.06 * opacity;
    ctx.fillStyle = '#ffffff';
    for (let y = offset; y < h; y += 4) {
      ctx.fillRect(0, y, w, 1);
    }
    ctx.restore();
  }

  private drawTitle(
    ctx: CanvasRenderingContext2D,
    title: string,
    subtitle: string,
    opacity: number
  ): void {
    const w = ctx.canvas.width;
    const scale = Math.min(w / 1280, 1.8);

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.textAlign = 'center';
    ctx.lineWidth = Math.max(1.2, 2.2 * scale);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.fillStyle = '#e8f6ff';
    ctx.font = `800 ${Math.max(22, 38 * scale)}px "Trebuchet MS", sans-serif`;
    ctx.strokeText(title, w * 0.5, 70 * scale);
    ctx.fillText(title, w * 0.5, 70 * scale);

    ctx.fillStyle = '#78f4ff';
    ctx.font = `700 ${Math.max(11, 15 * scale)}px "Trebuchet MS", sans-serif`;
    ctx.fillText(subtitle, w * 0.5, 98 * scale);
    ctx.restore();
  }
}
