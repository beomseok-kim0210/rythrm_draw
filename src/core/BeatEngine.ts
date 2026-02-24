import type { Beatmap, Note } from '../types';

export const APPROACH_MS = 1500;
export const MISS_WINDOW_MS = 200;

export interface ScheduledNote extends Note {
  hit: boolean;
  missed: boolean;
  _missReported?: boolean;
}

export class BeatEngine {
  private beatmap: Beatmap | null = null;
  private notes: ScheduledNote[] = [];
  private getAudioMs: () => number = () => 0;

  setTimeSource(fn: () => number): void {
    this.getAudioMs = fn;
  }

  async loadBeatmap(url: string): Promise<Beatmap> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`BeatEngine: fetch failed ${url}`);
    const data: Beatmap = await res.json();
    this.beatmap = data;
    this.notes = data.notes.map((n) => ({ ...n, hit: false, missed: false }));
    return data;
  }

  loadBeatmapDirect(bm: Beatmap): void {
    this.beatmap = bm;
    this.notes = bm.notes.map((n) => ({ ...n, hit: false, missed: false }));
  }

  reset(): void {
    this.notes = this.beatmap
      ? this.beatmap.notes.map((n) => ({ ...n, hit: false, missed: false }))
      : [];
  }

  getCurrentMs(): number {
    return this.getAudioMs();
  }

  getActiveNotes(): ScheduledNote[] {
    const t = this.getCurrentMs();

    for (const n of this.notes) {
      if (!n.hit && !n.missed && t - n.t_ms > MISS_WINDOW_MS) {
        n.missed = true;
      }
    }

    return this.notes.filter(
      (n) =>
        !n.hit &&
        !n.missed &&
        n.t_ms - t <= APPROACH_MS &&
        n.t_ms - t >= -MISS_WINDOW_MS
    );
  }

  drainNewMisses(): ScheduledNote[] {
    const fresh = this.notes.filter((n) => n.missed && !n._missReported);
    fresh.forEach((n) => {
      n._missReported = true;
    });
    return fresh;
  }

  markHit(noteId: string): void {
    const n = this.notes.find((note) => note.id === noteId);
    if (n) n.hit = true;
  }

  isComplete(): boolean {
    return this.notes.length > 0 && this.notes.every((n) => n.hit || n.missed);
  }

  getBeatmap(): Beatmap | null {
    return this.beatmap;
  }
}
