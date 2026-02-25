import type { Note } from '../types';

export interface SwipeGeometry {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  dirX: number;
  dirY: number;
  pathLength: number;
}

export function normalizeSwipeDirection(
  direction?: { dx: number; dy: number }
): { dx: number; dy: number } {
  const dx = direction?.dx ?? 1;
  const dy = direction?.dy ?? 0;
  const len = Math.hypot(dx, dy);
  if (len <= 0.0001) return { dx: 1, dy: 0 };
  return { dx: dx / len, dy: dy / len };
}

export function getSwipePathLengthPx(note: Pick<Note, 'len_ms'>, innerRadius: number): number {
  const base = innerRadius * 3.6;
  const lenScale = Math.max(0.9, Math.min(2.2, (note.len_ms ?? 520) / 520));
  return base * lenScale;
}

export function getSwipeRequiredSpeedPxPerSec(
  note: Pick<Note, 'len_ms'>,
  innerRadius: number
): number {
  const path = getSwipePathLengthPx(note, innerRadius);
  const durationMs = Math.max(300, note.len_ms ?? 520);
  return (path / durationMs) * 1000;
}

export function getSwipeSpeedTier(
  note: Pick<Note, 'len_ms'>,
  innerRadius: number
): 'SLOW' | 'MED' | 'FAST' {
  const speed = getSwipeRequiredSpeedPxPerSec(note, innerRadius);
  if (speed >= 1050) return 'FAST';
  if (speed >= 760) return 'MED';
  return 'SLOW';
}

export function getSwipeGeometry(
  note: Pick<Note, 'x' | 'y' | 'direction' | 'len_ms'>,
  width: number,
  height: number,
  innerRadius: number
): SwipeGeometry {
  const { dx, dy } = normalizeSwipeDirection(note.direction);
  const startX = note.x * width;
  const startY = note.y * height;
  const rawPathLength = getSwipePathLengthPx(note, innerRadius);
  const margin = Math.max(innerRadius * 1.08, 56);

  const maxAlongX =
    dx > 0
      ? (width - margin - startX) / dx
      : dx < 0
        ? (margin - startX) / dx
        : Number.POSITIVE_INFINITY;
  const maxAlongY =
    dy > 0
      ? (height - margin - startY) / dy
      : dy < 0
        ? (margin - startY) / dy
        : Number.POSITIVE_INFINITY;
  const maxForward = Math.max(
    innerRadius * 1.45,
    Math.min(maxAlongX, maxAlongY, rawPathLength)
  );

  const pathLength = Math.max(innerRadius * 1.45, maxForward);
  const endX = startX + dx * pathLength;
  const endY = startY + dy * pathLength;

  return {
    startX,
    startY,
    endX,
    endY,
    dirX: dx,
    dirY: dy,
    pathLength,
  };
}
