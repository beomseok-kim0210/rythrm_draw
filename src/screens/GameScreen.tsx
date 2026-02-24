import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useHandTracker } from '../hooks/useHandTracker';
import { useGameLoop } from '../hooks/useGameLoop';
import { AudioEngine } from '../audio/AudioEngine';
import { BeatEngine } from '../core/BeatEngine';
import { GuideLayer, INNER_RADIUS } from '../rendering/GuideLayer';
import { ParticleSystem } from '../rendering/ParticleSystem';
import {
  judgeNote,
  makeMissResult,
  makeInitialScoreState,
  applyJudgement,
} from '../core/Scoring';
import type { GestureType, ScoreState, JudgementResult, Judgement } from '../types';

const W = 1280;
const H = 720;
const JUDGE_WINDOW_MS = 320;
const ATTEMPT_COOLDOWN_MS = 120;
const JUDGEMENT_DISPLAY_MS = 850;
const HIT_RADIUS_MULTIPLIER = 1.35;
const WRIST_FLICK_VELOCITY = 0.35; // px/ms
const WRIST_FLICK_COOLDOWN_MS = 90;
const WRIST_FLICK_ANGULAR_VELOCITY = 0.0016; // rad/ms

interface WristState {
  lastY: number;
  lastT: number;
  emaV: number;
  slowV: number;
  lastAngle: number;
  emaAngV: number;
  lastTriggerAt: number;
}

interface GameScreenProps {
  beatmapUrl: string;
  onExit?: () => void;
}

function renderBackground(
  ctx: CanvasRenderingContext2D,
  _video: HTMLVideoElement | null,
  bassEnergy: number,
  audioMs: number
): void {
  const t = audioMs / 1000;
  ctx.fillStyle = '#05070c';
  ctx.fillRect(0, 0, W, H);

  const baseDark = Math.max(0.28, 0.45 - bassEnergy * 0.2);
  ctx.fillStyle = `rgba(4,8,18,${baseDark})`;
  ctx.fillRect(0, 0, W, H);

  const gradient = ctx.createLinearGradient(0, 0, W, H);
  gradient.addColorStop(0, 'rgba(0,180,255,0.14)');
  gradient.addColorStop(0.5, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, 'rgba(0,255,190,0.10)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);

  const laneOffset = (t * 140) % 220;
  ctx.save();
  ctx.globalAlpha = 0.14 + bassEnergy * 0.18;
  ctx.strokeStyle = '#38b4ff';
  ctx.lineWidth = 1.2;
  for (let y = -220; y < H + 220; y += 44) {
    ctx.beginPath();
    ctx.moveTo(0, y + laneOffset);
    ctx.lineTo(W, y + laneOffset - 120);
    ctx.stroke();
  }
  ctx.restore();

  const pulse = 1 + bassEnergy * 0.45;
  ctx.save();
  ctx.globalAlpha = 0.16 + bassEnergy * 0.12;
  ctx.strokeStyle = '#00ffd5';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(W * 0.5, H * 0.52, 190 * pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  const spotlight = ctx.createRadialGradient(
    W * 0.5,
    H * 0.5,
    60,
    W * 0.5,
    H * 0.5,
    W * 0.62
  );
  spotlight.addColorStop(0, 'rgba(255,255,255,0.08)');
  spotlight.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = spotlight;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.strokeStyle = `rgba(90,210,255,${0.35 + bassEnergy * 0.25})`;
  ctx.lineWidth = 2;
  ctx.strokeRect(10, 10, W - 20, H - 20);
  ctx.restore();
}

function renderHUD(
  ctx: CanvasRenderingContext2D,
  score: ScoreState,
  gesture: GestureType,
  pendingGesture: GestureType,
  judgementDisplay: { result: JudgementResult; expiresAt: number } | null,
  isTrackerReady: boolean,
  isSongReady: boolean,
  isStarted: boolean,
  finished: boolean,
  totalNotes: number
): void {
  ctx.clearRect(0, 0, W, H);

  const judged =
    score.counts.PERFECT +
    score.counts.GOOD +
    score.counts.BAD +
    score.counts.MISS +
    score.counts.WRONG;

  ctx.font = 'bold 46px monospace';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(score.total).padStart(7, '0'), 18, 56);

  ctx.font = 'bold 22px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  const accText = `ACC ${score.accuracy.toFixed(1)}%`;
  const accW = ctx.measureText(accText).width;
  ctx.fillText(accText, W - accW - 18, 36);

  ctx.font = 'bold 18px monospace';
  ctx.fillStyle = '#99ccff';
  ctx.fillText(`NOTES ${judged}/${Math.max(totalNotes, 0)}`, W - 210, 64);

  if (score.combo > 0) {
    ctx.font = 'bold 28px monospace';
    ctx.fillStyle = '#00ffcc';
    ctx.fillText(`x${score.combo}`, 18, 90);
  }

  const gestureEmoji: Record<GestureType, string> = {
    ROCK: '✊',
    SCISSORS: '✌',
    PAPER: '✋',
    POINT: '👆',
    IDLE: '○',
  };
  const gestureLabel = `${gestureEmoji[gesture]}${pendingGesture !== gesture ? ` (${gestureEmoji[pendingGesture]})` : ''}`;
  ctx.font = 'bold 18px monospace';
  ctx.fillStyle = '#ffffff';
  const gw = ctx.measureText(gestureLabel).width;
  ctx.fillText(gestureLabel, W - gw - 18, H - 20);

  if (judgementDisplay) {
    const remain = judgementDisplay.expiresAt - performance.now();
    if (remain > 0) {
      const j = judgementDisplay.result.judgement;
      const colorMap: Record<Judgement, string> = {
        PERFECT: '#00ffcc',
        GOOD: '#ffff44',
        BAD: '#ff9900',
        MISS: '#ff4444',
        WRONG: '#cc44ff',
      };
      ctx.save();
      ctx.globalAlpha = Math.min(1, remain / 240);
      ctx.font = 'bold 44px monospace';
      ctx.fillStyle = colorMap[j];
      const tw = ctx.measureText(j).width;
      ctx.fillText(j, (W - tw) / 2, H * 0.78);
      ctx.restore();
    }
  }

  if (!isTrackerReady) {
    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = '#ffcc00';
    ctx.fillText('Camera/Hand tracking initializing...', 18, H - 18);
  } else if (!isSongReady) {
    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = '#ffcc00';
    ctx.fillText('Loading beatmap and audio...', 18, H - 18);
  } else if (!isStarted && !finished) {
    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = '#88ddff';
    ctx.fillText('Flick your wrist like a drumstick to hit notes', 18, H - 18);
  } else if (finished) {
    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = '#88ff99';
    ctx.fillText('Track finished', 18, H - 18);
  }
}

function resolveAudioUrl(audioFile: string): string {
  if (audioFile.startsWith('http://') || audioFile.startsWith('https://') || audioFile.startsWith('/')) {
    return audioFile;
  }
  return `/songs/${audioFile}`;
}

function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export default function GameScreen({ beatmapUrl, onExit }: GameScreenProps): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const guideCanvasRef = useRef<HTMLCanvasElement>(null);
  const particleCanvasRef = useRef<HTMLCanvasElement>(null);
  const uiCanvasRef = useRef<HTMLCanvasElement>(null);
  const bgCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const guideCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const particleCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const uiCtxRef = useRef<CanvasRenderingContext2D | null>(null);

  const audioRef = useRef<AudioEngine>(new AudioEngine());
  const beatRef = useRef<BeatEngine>(new BeatEngine());
  const guideRef = useRef<GuideLayer>(new GuideLayer());
  const particleRef = useRef<ParticleSystem>(new ParticleSystem());

  const scoreRef = useRef<ScoreState>(makeInitialScoreState());
  const offsetMsRef = useRef(0);
  const totalNotesRef = useRef(0);
  const lastAttemptRef = useRef<Map<string, number>>(new Map());
  const wristStateRef = useRef<Map<number, WristState>>(new Map());
  const judgementDisplayRef = useRef<{ result: JudgementResult; expiresAt: number } | null>(null);

  const [score, setScore] = useState<ScoreState>(makeInitialScoreState());
  const [isSongReady, setIsSongReady] = useState(false);
  const [isStarted, setIsStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [, setJudgementDisplay] = useState<{ result: JudgementResult; expiresAt: number } | null>(null);

  const { trackerOutput, isReady: isTrackerReady, error: trackerError } = useHandTracker(
    videoRef as React.RefObject<HTMLVideoElement>
  );

  const applyResult = useCallback((result: JudgementResult) => {
    scoreRef.current = applyJudgement(scoreRef.current, result);
    setScore({ ...scoreRef.current });

    const display = { result, expiresAt: performance.now() + JUDGEMENT_DISPLAY_MS };
    judgementDisplayRef.current = display;
    setJudgementDisplay(display);
  }, []);

  const resetRuntimeState = useCallback(() => {
    scoreRef.current = makeInitialScoreState();
    setScore({ ...scoreRef.current });
    judgementDisplayRef.current = null;
    setJudgementDisplay(null);
    lastAttemptRef.current.clear();
    wristStateRef.current.clear();
    particleRef.current.clear();
    beatRef.current.reset();
    setFinished(false);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    const beat = beatRef.current;
    let cancelled = false;

    setIsSongReady(false);
    setIsStarted(false);
    setFinished(false);
    setLoadError(null);
    resetRuntimeState();

    async function init() {
      const beatmap = await beat.loadBeatmap(beatmapUrl);
      if (cancelled) return;

      const maxNoteMs = beatmap.notes.reduce((max, n) => Math.max(max, n.t_ms), 0);
      totalNotesRef.current = beatmap.notes.length;
      offsetMsRef.current = beatmap.offset_ms ?? 0;

      if (beatmap.audio_file === '__demo__') {
        const estimatedBeats = Math.ceil((maxNoteMs + 2000) / (60000 / beatmap.bpm));
        audio.generateDemoTone(beatmap.bpm, Math.max(estimatedBeats, 24));
      } else if (beatmap.audio_file === '__demo_groove__') {
        audio.generateGrooveTone(beatmap.bpm, maxNoteMs + 2000);
      } else {
        await audio.loadUrl(resolveAudioUrl(beatmap.audio_file));
      }

      if (cancelled) return;

      beat.setTimeSource(() => audio.getCurrentMs() + offsetMsRef.current);
      setIsSongReady(true);
    }

    init().catch((e) => {
      if (!cancelled) {
        setLoadError(e instanceof Error ? e.message : 'Failed to load track');
      }
    });

    return () => {
      cancelled = true;
      audio.destroy();
    };
  }, [beatmapUrl, resetRuntimeState]);

  useEffect(() => {
    bgCtxRef.current = bgCanvasRef.current?.getContext('2d', { desynchronized: true }) ?? null;
    guideCtxRef.current = guideCanvasRef.current?.getContext('2d', { desynchronized: true }) ?? null;
    particleCtxRef.current =
      particleCanvasRef.current?.getContext('2d', { desynchronized: true }) ?? null;
    uiCtxRef.current = uiCanvasRef.current?.getContext('2d', { desynchronized: true }) ?? null;
  }, []);

  const startGame = useCallback(() => {
    if (!isSongReady) return;
    resetRuntimeState();
    audioRef.current.play();
    setIsStarted(true);
  }, [isSongReady, resetRuntimeState]);

  const restartGame = useCallback(() => {
    if (!isSongReady) return;
    audioRef.current.stop();
    startGame();
  }, [isSongReady, startGame]);

  const onFrame = useCallback(() => {
    const { gesture, gestureState, hands } = trackerOutput;
    const audio = audioRef.current;
    const beat = beatRef.current;
    const guide = guideRef.current;
    const particle = particleRef.current;
    const gameActive = isStarted && !finished;

    const bassEnergy = audio.getBassEnergy();
    const audioMs = beat.getCurrentMs();

    const bgCtx = bgCtxRef.current;
    if (bgCtx) renderBackground(bgCtx, videoRef.current, bassEnergy, audioMs);

    const activeNotes = beat.getActiveNotes();
    const now = performance.now();
    const activeHandIds = new Set(hands.map((h) => h.id));
    const triggeredHandIds = new Set<number>();

    for (const hand of hands) {
      const wristLm = hand.landmarks[0];
      const wristY = (wristLm?.y ?? hand.fingertip.y / H) * H;
      const st = wristStateRef.current.get(hand.id);

      if (!st) {
        wristStateRef.current.set(hand.id, {
          lastY: wristY,
          lastT: now,
          emaV: 0,
          slowV: 0,
          lastAngle: Math.atan2(
            (hand.landmarks[9]?.y ?? hand.landmarks[0]?.y ?? 0) -
              (hand.landmarks[0]?.y ?? 0),
            (hand.landmarks[9]?.x ?? hand.landmarks[0]?.x ?? 0) -
              (hand.landmarks[0]?.x ?? 0)
          ),
          emaAngV: 0,
          lastTriggerAt: -Infinity,
        });
        continue;
      }

      const dt = Math.max(1, now - st.lastT);
      const v = (wristY - st.lastY) / dt;
      st.emaV = st.emaV * 0.45 + v * 0.55;
      st.slowV = st.slowV * 0.9 + v * 0.1;
      const spikeV = st.emaV - st.slowV;

      const angle = Math.atan2(
        (hand.landmarks[9]?.y ?? hand.landmarks[0]?.y ?? 0) -
          (hand.landmarks[0]?.y ?? 0),
        (hand.landmarks[9]?.x ?? hand.landmarks[0]?.x ?? 0) -
          (hand.landmarks[0]?.x ?? 0)
      );
      const angV = angleDiff(angle, st.lastAngle) / dt;
      st.emaAngV = st.emaAngV * 0.45 + angV * 0.55;
      st.lastAngle = angle;

      const flickByWrist =
        Math.abs(spikeV) >= WRIST_FLICK_VELOCITY &&
        Math.abs(st.emaAngV) >= WRIST_FLICK_ANGULAR_VELOCITY;
      const hardSwing =
        Math.abs(spikeV) >= WRIST_FLICK_VELOCITY * 1.9;

      if (
        (flickByWrist || hardSwing) &&
        now - st.lastTriggerAt >= WRIST_FLICK_COOLDOWN_MS
      ) {
        st.lastTriggerAt = now;
        triggeredHandIds.add(hand.id);
      }

      st.lastY = wristY;
      st.lastT = now;
      wristStateRef.current.set(hand.id, st);
    }

    for (const id of Array.from(wristStateRef.current.keys())) {
      if (!activeHandIds.has(id)) wristStateRef.current.delete(id);
    }

    const tapPointById = new Map<number, { x: number; y: number }>();
    for (const hand of hands) {
      const idx = hand.landmarks[8];
      if (!idx) continue;
      tapPointById.set(hand.id, {
        x: idx.x * W,
        y: idx.y * H,
      });
    }

    const strikeHands = hands.filter((h) => triggeredHandIds.has(h.id));

    if (gameActive && strikeHands.length > 0) {
      const usedHandIds = new Set<number>();
      const sorted = [...activeNotes].sort(
        (a, b) => Math.abs(a.t_ms - audioMs) - Math.abs(b.t_ms - audioMs)
      );

      for (const note of sorted) {
        const nx = note.x * W;
        const ny = note.y * H;
        if (Math.abs(audioMs - note.t_ms) > JUDGE_WINDOW_MS) continue;

        const candidates = strikeHands
          .filter((hand) => !usedHandIds.has(hand.id))
          .filter((hand) => tapPointById.has(hand.id))
          .map((hand) => {
            const tap = tapPointById.get(hand.id)!;
            const dx = tap.x - nx;
            const dy = tap.y - ny;
            const dist = Math.sqrt(dx * dx + dy * dy);
            return { hand, dist };
          })
          .filter((item) => item.dist <= INNER_RADIUS * HIT_RADIUS_MULTIPLIER)
          .sort((a, b) => a.dist - b.dist);

        if (!candidates.length) continue;

        const chosen = candidates[0].hand;
        const lastAttempt = lastAttemptRef.current.get(note.id) ?? -Infinity;
        if (audioMs - lastAttempt < ATTEMPT_COOLDOWN_MS) continue;
        lastAttemptRef.current.set(note.id, audioMs);

        const result = judgeNote(
          note,
          tapPointById.get(chosen.id)!,
          audioMs,
          note.required_gesture,
          W,
          H,
          scoreRef.current.combo
        );
        if (result.judgement === 'WRONG') {
          guide.addFeedback(nx, ny, 'WRONG');
          applyResult(result);
          usedHandIds.add(chosen.id);
          continue;
        }

        beat.markHit(note.id);
        guide.addFeedback(nx, ny, result.judgement);
        particle.emitJudgement(nx, ny, result.judgement);
        applyResult(result);
        usedHandIds.add(chosen.id);
      }
    }

    const newMisses = beat.drainNewMisses();
    for (const n of newMisses) {
      const missResult = makeMissResult(n, W, H);
      guide.addFeedback(n.x * W, n.y * H, 'MISS');
      applyResult(missResult);
    }

    if (gameActive && beat.isComplete()) {
      setFinished(true);
      setIsStarted(false);
      audio.stop();
    }

    const guideCtx = guideCtxRef.current;
    if (guideCtx) {
      const cursors = hands
        .filter((h) => tapPointById.has(h.id))
        .map((h) => ({
          point: tapPointById.get(h.id)!,
          gesture: h.gesture,
          pendingGesture: h.gestureState.pending,
          swing: Math.min(
            1,
            Math.abs(wristStateRef.current.get(h.id)?.emaV ?? 0) / WRIST_FLICK_VELOCITY
          ),
          landmarks: h.landmarks,
        }));
      guide.render(guideCtx, cursors, activeNotes, audioMs);
    }

    const particleCtx = particleCtxRef.current;
    if (particleCtx) particle.render(particleCtx);

    const uiCtx = uiCtxRef.current;
    if (uiCtx) {
      renderHUD(
        uiCtx,
        scoreRef.current,
        gesture,
        gestureState.pending,
        judgementDisplayRef.current,
        isTrackerReady,
        isSongReady,
        isStarted,
        finished,
        totalNotesRef.current
      );
    }
  }, [trackerOutput, isTrackerReady, isSongReady, isStarted, finished, applyResult]);

  useGameLoop({ active: true, onFrame });

  const canvasStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    transform: 'translateZ(0)',
    willChange: 'transform, opacity',
    backfaceVisibility: 'hidden',
  };

  const errorText = trackerError ?? loadError;

  return (
    <div
      style={{
        position: 'relative',
        width: W,
        height: H,
        margin: '0 auto',
        background: '#000',
        overflow: 'hidden',
      }}
    >
      <video
        ref={videoRef}
        style={{ position: 'absolute', left: -9999, visibility: 'hidden', pointerEvents: 'none' }}
        width={W}
        height={H}
        playsInline
        muted
      />

      <canvas ref={bgCanvasRef} width={W} height={H} style={{ ...canvasStyle, zIndex: 1 }} />
      <canvas ref={guideCanvasRef} width={W} height={H} style={{ ...canvasStyle, zIndex: 2 }} />
      <canvas ref={particleCanvasRef} width={W} height={H} style={{ ...canvasStyle, zIndex: 3 }} />
      <canvas ref={uiCanvasRef} width={W} height={H} style={{ ...canvasStyle, zIndex: 4 }} />

      <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 5 }}>
        <button
          onClick={() => onExit?.()}
          style={{
            background: 'rgba(0,0,0,0.45)',
            border: '1px solid #5588aa',
            color: '#d8f2ff',
            padding: '6px 10px',
            cursor: 'pointer',
            fontFamily: 'monospace',
          }}
        >
          Song Select
        </button>
      </div>

      {errorText && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.75)',
            color: '#ff7777',
            fontFamily: 'monospace',
            fontSize: 18,
            padding: 20,
            textAlign: 'center',
          }}
        >
          {errorText}
        </div>
      )}

      {!errorText && isSongReady && !isStarted && !finished && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 6,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.42)',
            color: '#ffffff',
            fontFamily: 'monospace',
            gap: 14,
          }}
        >
          <div style={{ fontSize: 28, fontWeight: 700 }}>Ready to Play</div>
          <div>Move hand to circles and flick your wrist to strike on beat.</div>
          <button
            onClick={startGame}
            style={{
              marginTop: 6,
              background: '#00c4a4',
              border: 'none',
              color: '#001a18',
              padding: '12px 22px',
              fontFamily: 'monospace',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            START
          </button>
        </div>
      )}

      {finished && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 6,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.45)',
            color: '#ffffff',
            fontFamily: 'monospace',
            gap: 10,
          }}
        >
          <div style={{ fontSize: 30, fontWeight: 700 }}>Result</div>
          <div>Score: {score.total}</div>
          <div>Accuracy: {score.accuracy.toFixed(1)}%</div>
          <div>Max Combo: {score.maxCombo}</div>
          <button
            onClick={restartGame}
            style={{
              marginTop: 8,
              background: '#00c4a4',
              border: 'none',
              color: '#001a18',
              padding: '10px 18px',
              fontFamily: 'monospace',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            REPLAY
          </button>
        </div>
      )}
    </div>
  );
}
