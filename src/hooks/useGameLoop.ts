import { useEffect, useRef, useCallback } from 'react';

type LoopCallback = (deltaMs: number, timestamp: number) => void;

interface UseGameLoopOptions {
  active: boolean;
  onFrame: LoopCallback;
}

/**
 * requestAnimationFrame-based game loop.
 * Calls `onFrame(deltaMs, timestamp)` every frame while `active` is true.
 */
export function useGameLoop({ active, onFrame }: UseGameLoopOptions): void {
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const onFrameRef = useRef<LoopCallback>(onFrame);

  // Keep the callback ref updated without re-subscribing the effect
  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  const loop = useCallback((timestamp: number) => {
    const delta = lastTimeRef.current === 0 ? 0 : timestamp - lastTimeRef.current;
    lastTimeRef.current = timestamp;

    try {
      onFrameRef.current(delta, timestamp);
    } catch (err) {
      // Keep loop alive even when one frame throws.
      // eslint-disable-next-line no-console
      console.error('useGameLoop frame error', err);
    }

    rafRef.current = requestAnimationFrame(loop);
  }, []);

  useEffect(() => {
    if (!active) {
      cancelAnimationFrame(rafRef.current);
      lastTimeRef.current = 0;
      return;
    }

    lastTimeRef.current = 0;
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      lastTimeRef.current = 0;
    };
  }, [active, loop]);
}
