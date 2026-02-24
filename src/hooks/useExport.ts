import { useCallback } from 'react';
import type { Stroke } from '../types';

/**
 * TODO (Week 2): Hook for exporting the canvas / replay data.
 * Currently provides a basic PNG export from a canvas element.
 */
export function useExport(canvasRef: React.RefObject<HTMLCanvasElement>) {
  const exportPng = useCallback((filename = 'rhythm-draw.png') => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, [canvasRef]);

  // TODO (Week 2): exportReplay(frames: ReplayFrame[]) → JSON download
  // TODO (Week 2): exportSvg(strokes: Stroke[]) → SVG download

  return { exportPng };
}

// Suppress unused import warning until Week 2 wiring
export type { Stroke };
