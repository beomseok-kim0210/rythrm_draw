import type { Note, Judgement, JudgementResult, ScoreState, GestureType } from '../types';

const PERFECT_MS = 90;
const GOOD_MS    = 170;
const BAD_MS     = 300;

const BASE_SCORES: Record<Judgement, number> = {
  PERFECT: 300,
  GOOD:    150,
  BAD:     50,
  MISS:    0,
  WRONG:   0,
};

export function classifyTiming(timingDeltaMs: number): 'PERFECT' | 'GOOD' | 'BAD' | null {
  const abs = Math.abs(timingDeltaMs);
  if (abs <= PERFECT_MS) return 'PERFECT';
  if (abs <= GOOD_MS)    return 'GOOD';
  if (abs <= BAD_MS)     return 'BAD';
  return null; // 범위 밖
}

/**
 * 제스처 포함 TAP 판정
 *
 * 조건: 타이밍 OK + 위치 OK + 제스처 OK → PERFECT/GOOD/BAD
 *       타이밍 OK + 위치 OK + 제스처 WRONG → WRONG (콤보 깨짐)
 */
export function judgeNote(
  note: Note,
  fingertip: { x: number; y: number },
  currentMs: number,
  currentGesture: GestureType,
  canvasW: number,
  canvasH: number,
  combo: number
): JudgementResult {
  const timingDelta  = currentMs - note.t_ms;
  const timingClass  = classifyTiming(timingDelta);
  const gestureMatch = currentGesture === note.required_gesture;

  const dx = fingertip.x / canvasW - note.x;
  const dy = fingertip.y / canvasH - note.y;
  const distanceDelta = Math.sqrt(dx * dx + dy * dy);

  let judgement: Judgement;
  if (timingClass === null) {
    judgement = 'MISS';
  } else if (!gestureMatch) {
    judgement = 'WRONG';
  } else {
    judgement = timingClass;
  }

  const comboMult = Math.min(1.0 + Math.floor(combo / 10) * 0.1, 2.0);
  const score = Math.round(BASE_SCORES[judgement] * comboMult);

  return {
    noteId: note.id,
    judgement,
    timingDelta,
    distanceDelta,
    gestureMatch,
    score,
    x: note.x * canvasW,
    y: note.y * canvasH,
    timestamp: performance.now(),
  };
}

export function makeMissResult(note: Note, canvasW: number, canvasH: number): JudgementResult {
  return {
    noteId: note.id,
    judgement: 'MISS',
    timingDelta: 999,
    distanceDelta: 1,
    gestureMatch: false,
    score: 0,
    x: note.x * canvasW,
    y: note.y * canvasH,
    timestamp: performance.now(),
  };
}

export function makeInitialScoreState(): ScoreState {
  return {
    total: 0,
    combo: 0,
    maxCombo: 0,
    counts: { PERFECT: 0, GOOD: 0, BAD: 0, MISS: 0, WRONG: 0 },
    accuracy: 100,
  };
}

export function applyJudgement(state: ScoreState, result: JudgementResult): ScoreState {
  const counts = { ...state.counts };
  counts[result.judgement]++;

  // MISS / WRONG → 콤보 초기화
  const breakCombo = result.judgement === 'MISS' || result.judgement === 'WRONG';
  const newCombo = breakCombo ? 0 : state.combo + 1;
  const maxCombo = Math.max(state.maxCombo, newCombo);
  const total    = state.total + result.score;

  // accuracy = (PERFECT*100 + GOOD*50) / (판정된 노트 수 * 100)
  const judgedNotes = counts.PERFECT + counts.GOOD + counts.BAD + counts.MISS + counts.WRONG;
  const weighted    = counts.PERFECT * 100 + counts.GOOD * 50;
  const accuracy    = judgedNotes > 0 ? (weighted / (judgedNotes * 100)) * 100 : 100;

  return { total, combo: newCombo, maxCombo, counts, accuracy };
}
