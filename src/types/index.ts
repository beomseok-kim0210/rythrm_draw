// ============================================================
// Hand / Gesture Types
// ============================================================

export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

export type GestureType = 'ROCK' | 'SCISSORS' | 'PAPER' | 'POINT' | 'IDLE';

export interface GestureState {
  current: GestureType;
  pending: GestureType;
  confirmedFrames: number;
  isConfirmed: boolean;
}

export interface TrackedHand {
  id: number;
  handedness: 'Left' | 'Right' | 'Unknown';
  landmarks: HandLandmark[];
  fingertip: { x: number; y: number };
  gesture: GestureType;
  gestureState: GestureState;
}

export interface TrackerOutput {
  landmarks: HandLandmark[] | null;
  fingertip: { x: number; y: number } | null;
  gesture: GestureType;
  gestureState: GestureState;
  hands: TrackedHand[];
  timestamp: number;
}

// ============================================================
// Drawing Types
// ============================================================

export interface Point {
  x: number;
  y: number;
  t: number;
  pressure?: number;
}

export type BrushType = 'normal' | 'neon' | 'watercolor';

export interface Stroke {
  id: string;
  points: Point[];
  brushType: BrushType;
  color: string;
  width: number;
  opacity: number;
  isErased: boolean;
}

// ============================================================
// Beatmap Types
// ============================================================

export type NoteType = 'TAP' | 'SWIPE' | 'TRACE';

export type RequiredGesture = 'ROCK' | 'SCISSORS' | 'PAPER';
export type RequiredHand = 'LEFT' | 'RIGHT' | 'ANY';

export interface Note {
  id: string;
  t_ms: number;
  type: NoteType;
  x: number;
  y: number;
  required_gesture: RequiredGesture;
  required_hand?: RequiredHand;
  len_ms?: number;
  path?: { x: number; y: number }[];
  direction?: { dx: number; dy: number };
}

export interface Beatmap {
  track_id: string;
  title: string;
  artist: string;
  bpm: number;
  offset_ms: number;
  audio_file: string;
  notes: Note[];
}

// ============================================================
// Judgement / Score Types
// ============================================================

export type Judgement = 'PERFECT' | 'GOOD' | 'BAD' | 'MISS' | 'WRONG';

export interface JudgementResult {
  noteId: string;
  judgement: Judgement;
  timingDelta: number;
  distanceDelta: number;
  gestureMatch: boolean;
  score: number;
  x: number;
  y: number;
  timestamp: number;
}

export interface ScoreState {
  total: number;
  combo: number;
  maxCombo: number;
  counts: Record<Judgement, number>;
  accuracy: number;
}

// ============================================================
// Game Phase / State
// ============================================================

export type GamePhase =
  | 'SONG_SELECT'
  | 'CALIBRATION'
  | 'TUTORIAL'
  | 'PLAYING'
  | 'PAUSED'
  | 'RESULT';

// ============================================================
// Rendering Types
// ============================================================

export interface ParticleConfig {
  x: number;
  y: number;
  color: string;
  count: number;
  radius: number;
}

export interface RenderState {
  strokes: Stroke[];
  fingertip: { x: number; y: number } | null;
  gesture: GestureType;
  score: ScoreState;
  lastJudgement: JudgementResult | null;
  phase: GamePhase;
  currentBrush: BrushType;
  activeNotes: Note[];
  audioTime: number;
}
