import type { HandLandmark, GestureType, GestureState } from '../types';

const DEBOUNCE_FRAMES = 4;

export class GestureDetector {
  private pendingGesture: GestureType = 'IDLE';
  private pendingFrames = 0;
  private confirmedGesture: GestureType = 'IDLE';

  detect(landmarks: HandLandmark[]): GestureState {
    const raw = this.classify(landmarks);

    if (raw === this.pendingGesture) {
      this.pendingFrames = Math.min(this.pendingFrames + 1, DEBOUNCE_FRAMES);
    } else {
      this.pendingGesture = raw;
      this.pendingFrames = 1;
    }

    const isConfirmed = this.pendingFrames >= DEBOUNCE_FRAMES;
    if (isConfirmed) {
      this.confirmedGesture = raw;
    }

    return {
      current: this.confirmedGesture,
      pending: this.pendingGesture,
      confirmedFrames: this.pendingFrames,
      isConfirmed,
    };
  }

  reset(): void {
    this.pendingGesture = 'IDLE';
    this.pendingFrames = 0;
    this.confirmedGesture = 'IDLE';
  }

  private classify(lm: HandLandmark[]): GestureType {
    if (!lm || lm.length < 21) return 'IDLE';

    const index  = this.isFingerUp(lm, 'index');
    const middle = this.isFingerUp(lm, 'middle');
    const ring   = this.isFingerUp(lm, 'ring');
    const pinky  = this.isFingerUp(lm, 'pinky');

    if (index && middle && ring && pinky) return 'PAPER';
    if (index && middle && !ring && !pinky) return 'SCISSORS';
    if (index && !middle && !ring && !pinky) return 'POINT';
    if (!index && !middle && !ring && !pinky) return 'ROCK';

    return 'IDLE';
  }

  /**
   * tip.y < pip.y  →  손가락이 위쪽으로 펴짐
   *   index:  tip=8,  pip=6
   *   middle: tip=12, pip=10
   *   ring:   tip=16, pip=14
   *   pinky:  tip=20, pip=18
   */
  private isFingerUp(
    lm: HandLandmark[],
    finger: 'index' | 'middle' | 'ring' | 'pinky'
  ): boolean {
    const map: Record<string, [number, number]> = {
      index:  [8,  6],
      middle: [12, 10],
      ring:   [16, 14],
      pinky:  [20, 18],
    };
    const [tip, pip] = map[finger];
    if (!lm[tip] || !lm[pip]) return false;
    return lm[tip].y < lm[pip].y;
  }
}
