import type { GamePhase } from '../types';

type TransitionMap = Partial<Record<GamePhase, GamePhase[]>>;

const ALLOWED_TRANSITIONS: TransitionMap = {
  SONG_SELECT:  ['CALIBRATION'],
  CALIBRATION:  ['TUTORIAL', 'PLAYING'],
  TUTORIAL:     ['PLAYING'],
  PLAYING:      ['PAUSED', 'RESULT'],
  PAUSED:       ['PLAYING', 'SONG_SELECT'],
  RESULT:       ['SONG_SELECT'],
};

type PhaseChangeListener = (from: GamePhase, to: GamePhase) => void;

/**
 * Simple state machine for game phases.
 *
 * TODO (Week 2): Connect to Zustand gameStore.
 * TODO (Week 2): Trigger audio start/stop on PLAYING transitions.
 */
export class StateMachine {
  private current: GamePhase = 'SONG_SELECT';
  private listeners: PhaseChangeListener[] = [];

  getPhase(): GamePhase {
    return this.current;
  }

  transition(to: GamePhase): boolean {
    const allowed = ALLOWED_TRANSITIONS[this.current] ?? [];
    if (!allowed.includes(to)) {
      console.warn(`StateMachine: invalid transition ${this.current} → ${to}`);
      return false;
    }
    const from = this.current;
    this.current = to;
    this.listeners.forEach((fn) => fn(from, to));
    return true;
  }

  onPhaseChange(listener: PhaseChangeListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }
}
