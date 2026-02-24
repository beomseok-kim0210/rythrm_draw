import type { TrackerOutput, Stroke } from '../types';

export interface ReplayFrame {
  timestamp: number;
  trackerOutput: TrackerOutput;
  strokes: Stroke[];
}

/**
 * Records game frames for replay / export.
 *
 * TODO (Week 2): Integrate with useGameLoop and wire to ResultScreen.
 * TODO (Week 2): Add playback() method that iterates recorded frames.
 */
export class ReplayRecorder {
  private frames: ReplayFrame[] = [];
  private recording = false;

  start(): void {
    this.frames = [];
    this.recording = true;
  }

  stop(): ReplayFrame[] {
    this.recording = false;
    return this.frames;
  }

  record(frame: ReplayFrame): void {
    if (!this.recording) return;
    // Deep-copy strokes to avoid mutation issues
    this.frames.push({
      ...frame,
      strokes: frame.strokes.map((s) => ({
        ...s,
        points: [...s.points],
      })),
    });
  }

  getFrames(): ReplayFrame[] {
    return this.frames;
  }

  exportJson(): string {
    return JSON.stringify(this.frames);
  }
}
