import { useEffect, useRef, useState, useCallback } from 'react';
import { HandTracker } from '../core/HandTracker';
import type { TrackerOutput } from '../types';

const IDLE_OUTPUT: TrackerOutput = {
  landmarks: null,
  fingertip: null,
  gesture: 'IDLE',
  gestureState: { current: 'IDLE', pending: 'IDLE', confirmedFrames: 0, isConfirmed: false },
  hands: [],
  timestamp: 0,
};

interface UseHandTrackerResult {
  trackerOutput: TrackerOutput;
  isReady: boolean;
  error: string | null;
}

export function useHandTracker(
  videoRef: React.RefObject<HTMLVideoElement>
): UseHandTrackerResult {
  const trackerRef = useRef<HandTracker | null>(null);
  const rafRef = useRef<number>(0);
  const stoppedRef = useRef(false);
  const [trackerOutput, setTrackerOutput] = useState<TrackerOutput>(IDLE_OUTPUT);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processLoop = useCallback(async () => {
    if (!trackerRef.current || stoppedRef.current) return;

    await trackerRef.current.process();
    if (stoppedRef.current) return;
    const output = trackerRef.current.getOutput();
    setTrackerOutput(output);

    if (stoppedRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      processLoop();
    });
  }, []);

  useEffect(() => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const tracker = new HandTracker();
    trackerRef.current = tracker;

    let cancelled = false;
    stoppedRef.current = false;

    async function setup() {
      try {
        // Request webcam
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720, facingMode: 'user' },
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        video.srcObject = stream;
        await video.play();

        await tracker.init(video);

        if (!cancelled) {
          setIsReady(true);
          processLoop();
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Webcam/MediaPipe init failed');
        }
      }
    }

    setup();

    return () => {
      cancelled = true;
      stoppedRef.current = true;
      cancelAnimationFrame(rafRef.current);
      tracker.destroy();

      // Stop webcam stream
      const srcObj = video.srcObject as MediaStream | null;
      srcObj?.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    };
  }, [videoRef, processLoop]);

  return { trackerOutput, isReady, error };
}
