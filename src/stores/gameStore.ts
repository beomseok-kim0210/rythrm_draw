import { create } from 'zustand';
import type { GamePhase, ScoreState, JudgementResult, BrushType, Stroke } from '../types';
import { makeInitialScoreState } from '../core/Scoring';

interface GameStore {
  // Phase
  phase: GamePhase;
  setPhase: (phase: GamePhase) => void;

  // Score
  score: ScoreState;
  setScore: (score: ScoreState) => void;
  resetScore: () => void;

  // Drawing
  strokes: Stroke[];
  addStroke: (stroke: Stroke) => void;
  eraseStroke: (id: string) => void;
  clearStrokes: () => void;
  currentBrush: BrushType;
  setCurrentBrush: (brush: BrushType) => void;

  // Judgement
  lastJudgement: JudgementResult | null;
  setLastJudgement: (result: JudgementResult) => void;

  // Song
  selectedSongId: string | null;
  setSelectedSongId: (id: string) => void;
}

export const useGameStore = create<GameStore>((set) => ({
  // Phase
  phase: 'SONG_SELECT',
  setPhase: (phase) => set({ phase }),

  // Score
  score: makeInitialScoreState(),
  setScore: (score) => set({ score }),
  resetScore: () => set({ score: makeInitialScoreState() }),

  // Drawing
  strokes: [],
  addStroke: (stroke) => set((s) => ({ strokes: [...s.strokes, stroke] })),
  eraseStroke: (id) =>
    set((s) => ({
      strokes: s.strokes.map((st) => (st.id === id ? { ...st, isErased: true } : st)),
    })),
  clearStrokes: () => set({ strokes: [] }),
  currentBrush: 'normal',
  setCurrentBrush: (brush) => set({ currentBrush: brush }),

  // Judgement
  lastJudgement: null,
  setLastJudgement: (result) => set({ lastJudgement: result }),

  // Song
  selectedSongId: null,
  setSelectedSongId: (id) => set({ selectedSongId: id }),
}));
