// Loaded globally from index.html CDN scripts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Hands: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const HAND_CONNECTIONS: any;

import { GestureDetector } from './GestureDetector';
import type { HandLandmark, TrackerOutput, TrackedHand } from '../types';

export { HAND_CONNECTIONS };

const EMA_ALPHA = 0.55;
const LOST_HAND_TIMEOUT_MS = 300;
const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;
const MAX_HANDS = 2;

interface EmaState {
  x: number;
  y: number;
}

export class HandTracker {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private hands: any = null;
  private gestureDetectors: GestureDetector[] = [
    new GestureDetector(),
    new GestureDetector(),
  ];
  private emaStates: Array<EmaState | null> = [null, null];
  private lastOutput: TrackerOutput;
  private lastDetectedAt = 0;
  private isInitialized = false;
  private videoElement: HTMLVideoElement | null = null;

  constructor() {
    this.lastOutput = this.makeIdleOutput();
  }

  async init(videoEl: HTMLVideoElement): Promise<void> {
    this.videoElement = videoEl;

    this.hands = new Hands({
      locateFile: (file: string) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`,
    });

    this.hands.setOptions({
      maxNumHands: MAX_HANDS,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.45,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.hands.onResults((results: any) => this.onResults(results));

    await this.hands.initialize();
    this.isInitialized = true;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private onResults(results: any): void {
    const now = performance.now();
    const allLandmarks = (results.multiHandLandmarks ?? []) as HandLandmark[][];
    const allHandedness = results.multiHandedness ?? [];

    if (!allLandmarks.length) {
      return;
    }

    this.lastDetectedAt = now;
    const trackedHands: TrackedHand[] = [];

    const usedSlots = new Set<number>();

    for (let i = 0; i < Math.min(MAX_HANDS, allLandmarks.length); i++) {
      const landmarks = allLandmarks[i];
      const handedness = allHandedness[i]?.label ?? 'Unknown';
      const slot = this.pickSlot(handedness, usedSlots);
      usedSlots.add(slot);

      const anchor = this.getHandAnchor(landmarks);
      const mirroredX = 1 - anchor.x;
      const mirroredY = anchor.y;

      if (!this.emaStates[slot]) {
        this.emaStates[slot] = { x: mirroredX, y: mirroredY };
      } else {
        this.emaStates[slot]!.x =
          EMA_ALPHA * mirroredX + (1 - EMA_ALPHA) * this.emaStates[slot]!.x;
        this.emaStates[slot]!.y =
          EMA_ALPHA * mirroredY + (1 - EMA_ALPHA) * this.emaStates[slot]!.y;
      }

      const mirroredLandmarks: HandLandmark[] = landmarks.map((lm) => ({
        x: 1 - lm.x,
        y: lm.y,
        z: lm.z,
      }));

      const gestureState = this.gestureDetectors[slot].detect(mirroredLandmarks);

      trackedHands.push({
        id: slot,
        handedness,
        landmarks: mirroredLandmarks,
        fingertip: {
          x: this.emaStates[slot]!.x * CANVAS_WIDTH,
          y: this.emaStates[slot]!.y * CANVAS_HEIGHT,
        },
        gesture: gestureState.current,
        gestureState,
      });
    }

    for (let i = 0; i < MAX_HANDS; i++) {
      if (usedSlots.has(i)) continue;
      this.emaStates[i] = null;
      this.gestureDetectors[i].reset();
    }

    const primary = trackedHands[0] ?? null;
    this.lastOutput = {
      landmarks: primary?.landmarks ?? null,
      fingertip: primary?.fingertip ?? null,
      gesture: primary?.gesture ?? 'IDLE',
      gestureState:
        primary?.gestureState ?? {
          current: 'IDLE',
          pending: 'IDLE',
          confirmedFrames: 0,
          isConfirmed: false,
        },
      hands: trackedHands,
      timestamp: now,
    };
  }

  async process(): Promise<void> {
    if (!this.isInitialized || !this.hands || !this.videoElement) return;
    if (this.videoElement.readyState < 2) return;

    try {
      await this.hands.send({ image: this.videoElement });
    } catch {
      // Ignore transient frame-send errors.
    }
  }

  getOutput(): TrackerOutput {
    const now = performance.now();
    const timeSinceLast = now - this.lastDetectedAt;

    if (this.lastDetectedAt > 0 && timeSinceLast > LOST_HAND_TIMEOUT_MS) {
      this.emaStates = [null, null];
      this.gestureDetectors.forEach((d) => d.reset());
      this.lastOutput = this.makeIdleOutput();
    }

    return this.lastOutput;
  }

  destroy(): void {
    this.hands?.close();
    this.hands = null;
    this.isInitialized = false;
  }

  private getHandAnchor(landmarks: HandLandmark[]): { x: number; y: number } {
    // Palm center approximation: wrist + MCP joints.
    const anchorIds = [0, 5, 9, 13, 17];
    let sx = 0;
    let sy = 0;
    for (const idx of anchorIds) {
      sx += landmarks[idx].x;
      sy += landmarks[idx].y;
    }
    return {
      x: sx / anchorIds.length,
      y: sy / anchorIds.length,
    };
  }

  private pickSlot(
    handedness: 'Left' | 'Right' | 'Unknown',
    usedSlots: Set<number>
  ): number {
    if (handedness === 'Left' && !usedSlots.has(0)) return 0;
    if (handedness === 'Right' && !usedSlots.has(1)) return 1;
    if (!usedSlots.has(0)) return 0;
    return 1;
  }

  private makeIdleOutput(): TrackerOutput {
    return {
      landmarks: null,
      fingertip: null,
      gesture: 'IDLE',
      gestureState: {
        current: 'IDLE',
        pending: 'IDLE',
        confirmedFrames: 0,
        isConfirmed: false,
      },
      hands: [],
      timestamp: performance.now(),
    };
  }
}
