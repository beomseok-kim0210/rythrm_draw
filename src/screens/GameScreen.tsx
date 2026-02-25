import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useHandTracker } from '../hooks/useHandTracker';
import { useGameLoop } from '../hooks/useGameLoop';
import { AudioEngine } from '../audio/AudioEngine';
import { BeatEngine } from '../core/BeatEngine';
import { GuideLayer } from '../rendering/GuideLayer';
import { ParticleSystem } from '../rendering/ParticleSystem';
import { CinematicLayer, type CinematicStyle } from '../rendering/CinematicLayer';
import { getSwipeGeometry } from '../core/SwipeMath';
import {
  judgeNote,
  makeMissResult,
  makeInitialScoreState,
  applyJudgement,
  isAccurateJudgement,
} from '../core/Scoring';
import type {
  GestureType,
  ScoreState,
  JudgementResult,
  Judgement,
  Note,
} from '../types';

const BASE_WIDTH = 1280;
const BASE_HEIGHT = 720;
const JUDGE_WINDOW_MS = 270;
const ATTEMPT_COOLDOWN_MS = 120;
const JUDGEMENT_DISPLAY_MS = 850;
const HIT_RADIUS_MULTIPLIER = 1.12;
const WRIST_FLICK_VELOCITY = 0.35; // px/ms
const WRIST_FLICK_COOLDOWN_MS = 90;
const WRIST_FLICK_ANGULAR_VELOCITY = 0.0016; // rad/ms
const SWIPE_START_RADIUS_MULTIPLIER = 0.62;
const SWIPE_CORRIDOR_RADIUS_MULTIPLIER = 0.54;
const SWIPE_COMPLETE_PROGRESS = 0.95;
const CALIBRATION_MIN_HANDS = 1;
const DEPTH_COMPENSATION_MIN = 0.72;
const DEPTH_COMPENSATION_MAX = 1.35;
const CALIBRATION_SMOOTHING = 0.12;

interface WristState {
  lastY: number;
  lastT: number;
  emaV: number;
  slowV: number;
  lastAngle: number;
  emaAngV: number;
  lastTriggerAt: number;
}

interface DomainWindow {
  id: string;
  promptStartMs: number;
  courseStartMs: number;
  courseEndMs: number;
  requiredGesture: GestureType;
  style: CinematicStyle;
  title: string;
  subtitle: string;
}

interface SwipeTrackState {
  noteId: string;
  handId: number;
  startedMs: number;
  bestProgress: number;
  lastProgressMs: number;
}

interface HandAxisCalibration {
  palmSpan: number;
}

interface GameScreenProps {
  beatmapUrl: string;
  onExit?: () => void;
}

function renderBackground(
  ctx: CanvasRenderingContext2D,
  bassEnergy: number,
  audioMs: number,
  width: number,
  height: number
): void {
  const t = audioMs / 1000;
  const scale = Math.min(width / BASE_WIDTH, height / BASE_HEIGHT);

  ctx.fillStyle = '#05070c';
  ctx.fillRect(0, 0, width, height);

  const baseDark = Math.max(0.28, 0.45 - bassEnergy * 0.2);
  ctx.fillStyle = `rgba(4,8,18,${baseDark})`;
  ctx.fillRect(0, 0, width, height);

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, 'rgba(0,180,255,0.14)');
  gradient.addColorStop(0.5, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, 'rgba(0,255,190,0.10)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const laneOffset = (t * 140) % 220;
  ctx.save();
  ctx.globalAlpha = 0.14 + bassEnergy * 0.18;
  ctx.strokeStyle = '#38b4ff';
  ctx.lineWidth = 1.2 * scale;
  for (let y = -220 * scale; y < height + 220 * scale; y += 44 * scale) {
    ctx.beginPath();
    ctx.moveTo(0, y + laneOffset * scale);
    ctx.lineTo(width, y + laneOffset * scale - 120 * scale);
    ctx.stroke();
  }
  ctx.restore();

  const pulse = 1 + bassEnergy * 0.45;
  ctx.save();
  ctx.globalAlpha = 0.16 + bassEnergy * 0.12;
  ctx.strokeStyle = '#00ffd5';
  ctx.lineWidth = 3 * scale;
  ctx.beginPath();
  ctx.arc(width * 0.5, height * 0.52, 190 * scale * pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  const spotlight = ctx.createRadialGradient(
    width * 0.5,
    height * 0.5,
    60 * scale,
    width * 0.5,
    height * 0.5,
    width * 0.62
  );
  spotlight.addColorStop(0, 'rgba(255,255,255,0.08)');
  spotlight.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = spotlight;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.strokeStyle = `rgba(90,210,255,${0.35 + bassEnergy * 0.25})`;
  ctx.lineWidth = 2 * scale;
  ctx.strokeRect(10 * scale, 10 * scale, width - 20 * scale, height - 20 * scale);
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
  totalNotes: number,
  width: number,
  height: number,
  domainPrompt: string | null,
  activeCinematicTitle: string | null,
  isFullscreen: boolean
): void {
  ctx.clearRect(0, 0, width, height);
  const scale = Math.min(width / BASE_WIDTH, height / BASE_HEIGHT);

  const judged =
    score.counts.PERFECT +
    score.counts.GOOD +
    score.counts.BAD +
    score.counts.MISS +
    score.counts.WRONG;

  ctx.font = `700 ${Math.max(28, 46 * scale)}px monospace`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(score.total).padStart(7, '0'), 18 * scale, 56 * scale);

  ctx.font = `700 ${Math.max(13, 22 * scale)}px monospace`;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  const accText = `ACC ${score.accuracy.toFixed(1)}%`;
  const accW = ctx.measureText(accText).width;
  ctx.fillText(accText, width - accW - 18 * scale, 36 * scale);

  ctx.font = `700 ${Math.max(11, 18 * scale)}px monospace`;
  ctx.fillStyle = '#99ccff';
  ctx.fillText(`NOTES ${judged}/${Math.max(totalNotes, 0)}`, width - 230 * scale, 64 * scale);

  if (score.combo > 0) {
    ctx.font = `700 ${Math.max(18, 28 * scale)}px monospace`;
    ctx.fillStyle = '#00ffcc';
    ctx.fillText(`x${score.combo}`, 18 * scale, 94 * scale);
  }

  const gestureLabel =
    pendingGesture !== gesture
      ? `GESTURE ${gesture} -> ${pendingGesture}`
      : `GESTURE ${gesture}`;
  ctx.font = `700 ${Math.max(11, 17 * scale)}px monospace`;
  ctx.fillStyle = '#ffffff';
  const gw = ctx.measureText(gestureLabel).width;
  ctx.fillText(gestureLabel, width - gw - 18 * scale, height - 22 * scale);

  const fullscreenLabel = isFullscreen ? 'FULLSCREEN ON' : 'WINDOWED';
  ctx.font = `700 ${Math.max(11, 16 * scale)}px monospace`;
  ctx.fillStyle = '#7de3ff';
  ctx.fillText(fullscreenLabel, 18 * scale, height - 22 * scale);

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
      ctx.font = `700 ${Math.max(26, 44 * scale)}px monospace`;
      ctx.fillStyle = colorMap[j];
      const tw = ctx.measureText(j).width;
      ctx.fillText(j, (width - tw) / 2, height * 0.78);
      ctx.restore();
    }
  }

  if (domainPrompt) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `700 ${Math.max(14, 20 * scale)}px monospace`;
    ctx.fillStyle = 'rgba(130,255,255,0.95)';
    ctx.fillText(domainPrompt, width * 0.5, 32 * scale);
    ctx.restore();
  }

  if (activeCinematicTitle) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `700 ${Math.max(11, 15 * scale)}px monospace`;
    ctx.fillStyle = 'rgba(230,240,255,0.9)';
    ctx.fillText(activeCinematicTitle, width * 0.5, height - 50 * scale);
    ctx.restore();
  }

  if (!isTrackerReady) {
    ctx.font = `700 ${Math.max(11, 18 * scale)}px monospace`;
    ctx.fillStyle = '#ffcc00';
    ctx.fillText('Camera/Hand tracking initializing...', 18 * scale, height - 18 * scale);
  } else if (!isSongReady) {
    ctx.font = `700 ${Math.max(11, 18 * scale)}px monospace`;
    ctx.fillStyle = '#ffcc00';
    ctx.fillText('Loading beatmap and audio...', 18 * scale, height - 18 * scale);
  } else if (!isStarted && !finished) {
    ctx.font = `700 ${Math.max(11, 18 * scale)}px monospace`;
    ctx.fillStyle = '#88ddff';
    ctx.fillText('Tap flick + swipe trace mode active.', 18 * scale, height - 18 * scale);
  } else if (finished) {
    ctx.font = `700 ${Math.max(11, 18 * scale)}px monospace`;
    ctx.fillStyle = '#88ff99';
    ctx.fillText('Track finished', 18 * scale, height - 18 * scale);
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

function getPalmSpan(landmarks: { x: number; y: number }[]): number {
  const a = landmarks[5];
  const b = landmarks[17];
  if (!a || !b) return 0.09;
  return Math.max(0.02, Math.hypot(a.x - b.x, a.y - b.y));
}

function buildDomainWindows(maxNoteMs: number): DomainWindow[] {
  const base = Math.max(9000, maxNoteMs + 1000);
  const c1 = Math.round(base * 0.34);
  const c2 = Math.round(base * 0.58);
  const c3 = Math.round(base * 0.8);
  const courseDuration = 2100;
  const prepDuration = 1400;

  return [
    {
      id: 'domain-red',
      promptStartMs: c1 - prepDuration,
      courseStartMs: c1,
      courseEndMs: c1 + courseDuration,
      requiredGesture: 'SCISSORS',
      style: 'RED_VORTEX',
      title: 'CURSED TECHNIQUE: RED MAELSTROM',
      subtitle: 'SCISSORS PREP -> PERFECT COURSE',
    },
    {
      id: 'domain-white',
      promptStartMs: c2 - prepDuration,
      courseStartMs: c2,
      courseEndMs: c2 + courseDuration,
      requiredGesture: 'PAPER',
      style: 'WHITE_GATE',
      title: 'DOMAIN EXPANSION: CELESTIAL GATE',
      subtitle: 'PAPER PREP -> PERFECT COURSE',
    },
    {
      id: 'domain-crimson',
      promptStartMs: c3 - prepDuration,
      courseStartMs: c3,
      courseEndMs: c3 + courseDuration,
      requiredGesture: 'ROCK',
      style: 'CRIMSON_SHRINE',
      title: 'DOMAIN EXPANSION: MALEVOLENT SHRINE',
      subtitle: 'ROCK PREP -> PERFECT COURSE',
    },
  ];
}

export default function GameScreen({ beatmapUrl, onExit }: GameScreenProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const cinemaCanvasRef = useRef<HTMLCanvasElement>(null);
  const guideCanvasRef = useRef<HTMLCanvasElement>(null);
  const particleCanvasRef = useRef<HTMLCanvasElement>(null);
  const uiCanvasRef = useRef<HTMLCanvasElement>(null);
  const bgCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const cinemaCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const guideCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const particleCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const uiCtxRef = useRef<CanvasRenderingContext2D | null>(null);

  const audioRef = useRef<AudioEngine>(new AudioEngine());
  const beatRef = useRef<BeatEngine>(new BeatEngine());
  const guideRef = useRef<GuideLayer>(new GuideLayer());
  const particleRef = useRef<ParticleSystem>(new ParticleSystem());
  const cinematicRef = useRef<CinematicLayer>(new CinematicLayer());

  const scoreRef = useRef<ScoreState>(makeInitialScoreState());
  const offsetMsRef = useRef(0);
  const totalNotesRef = useRef(0);
  const lastAttemptRef = useRef<Map<string, number>>(new Map());
  const swipeTracksRef = useRef<Map<string, SwipeTrackState>>(new Map());
  const swipeProgressRef = useRef<Map<string, number>>(new Map());
  const wristStateRef = useRef<Map<number, WristState>>(new Map());
  const handCalibrationRef = useRef<Map<number, HandAxisCalibration>>(new Map());
  const judgementDisplayRef = useRef<{ result: JudgementResult; expiresAt: number } | null>(null);
  const domainWindowsRef = useRef<DomainWindow[]>([]);
  const armedDomainsRef = useRef<Set<string>>(new Set());
  const startedDomainsRef = useRef<Set<string>>(new Set());
  const failedDomainsRef = useRef<Set<string>>(new Set());
  const triggeredDomainsRef = useRef<Set<string>>(new Set());

  const [score, setScore] = useState<ScoreState>(makeInitialScoreState());
  const [isSongReady, setIsSongReady] = useState(false);
  const [isStarted, setIsStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => Boolean(document.fullscreenElement));
  const [stageSize, setStageSize] = useState({
    width: Math.max(1, window.innerWidth),
    height: Math.max(1, window.innerHeight),
  });
  const stageSizeRef = useRef(stageSize);
  const [, setJudgementDisplay] = useState<{ result: JudgementResult; expiresAt: number } | null>(null);

  const { trackerOutput, isReady: isTrackerReady, error: trackerError } = useHandTracker(
    videoRef as React.RefObject<HTMLVideoElement>
  );

  useEffect(() => {
    stageSizeRef.current = stageSize;
  }, [stageSize]);

  useEffect(() => {
    const onResize = () => {
      setStageSize({
        width: Math.max(1, window.innerWidth),
        height: Math.max(1, window.innerHeight),
      });
    };

    window.addEventListener('resize', onResize);
    onResize();
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
      setStageSize({
        width: Math.max(1, window.innerWidth),
        height: Math.max(1, window.innerHeight),
      });
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const host = containerRef.current;
    if (!host) return;

    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }

    if (host.requestFullscreen) {
      void host.requestFullscreen();
    }
  }, []);

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
    swipeTracksRef.current.clear();
    swipeProgressRef.current.clear();
    wristStateRef.current.clear();
    particleRef.current.clear();
    cinematicRef.current.clear();
    armedDomainsRef.current.clear();
    startedDomainsRef.current.clear();
    failedDomainsRef.current.clear();
    triggeredDomainsRef.current.clear();
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
      domainWindowsRef.current = buildDomainWindows(maxNoteMs);

      if (beatmap.audio_file === '__demo__') {
        const estimatedBeats = Math.ceil((maxNoteMs + 2000) / (60000 / beatmap.bpm));
        audio.generateDemoTone(beatmap.bpm, Math.max(estimatedBeats, 24));
      } else if (beatmap.audio_file === '__demo_groove__') {
        audio.generateGrooveTone(beatmap.bpm, maxNoteMs + 2400);
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
    cinemaCtxRef.current =
      cinemaCanvasRef.current?.getContext('2d', { desynchronized: true }) ?? null;
    guideCtxRef.current = guideCanvasRef.current?.getContext('2d', { desynchronized: true }) ?? null;
    particleCtxRef.current =
      particleCanvasRef.current?.getContext('2d', { desynchronized: true }) ?? null;
    uiCtxRef.current = uiCanvasRef.current?.getContext('2d', { desynchronized: true }) ?? null;
  }, []);

  const startGame = useCallback(() => {
    if (!isSongReady || !isTrackerReady || trackerOutput.hands.length < CALIBRATION_MIN_HANDS) return;
    resetRuntimeState();
    audioRef.current.play();
    setIsStarted(true);
  }, [isSongReady, isTrackerReady, trackerOutput.hands.length, resetRuntimeState]);

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
    const cinematic = cinematicRef.current;
    const gameActive = isStarted && !finished;

    const { width, height } = stageSizeRef.current;

    const bassEnergy = audio.getBassEnergy();
    const audioMs = beat.getCurrentMs();

    const bgCtx = bgCtxRef.current;
    if (bgCtx) renderBackground(bgCtx, bassEnergy, audioMs, width, height);

    const cinemaCtx = cinemaCtxRef.current;
    if (cinemaCtx) cinematic.render(cinemaCtx, audioMs, bassEnergy);

    guide.setViewport(width, height);
    const innerRadius = guide.getInnerRadius();
    const tapHitRadius = innerRadius * HIT_RADIUS_MULTIPLIER;

    const activeNotes = beat.getActiveNotes();
    const now = performance.now();
    const activeHandIds = new Set(hands.map((h) => h.id));
    const triggeredHandIds = new Set<number>();

    const tapPointById = new Map<number, { x: number; y: number }>();
    for (const hand of hands) {
      const idx = hand.landmarks[8];
      if (!idx) continue;
      const span = getPalmSpan(hand.landmarks);
      const calibration = handCalibrationRef.current.get(hand.id);
      if (!calibration) {
        handCalibrationRef.current.set(hand.id, { palmSpan: span });
      } else if (!isStarted) {
        calibration.palmSpan =
          calibration.palmSpan * (1 - CALIBRATION_SMOOTHING) + span * CALIBRATION_SMOOTHING;
        handCalibrationRef.current.set(hand.id, calibration);
      }

      const refSpan = handCalibrationRef.current.get(hand.id)?.palmSpan ?? span;
      const depthScale = Math.max(
        DEPTH_COMPENSATION_MIN,
        Math.min(DEPTH_COMPENSATION_MAX, refSpan / Math.max(0.02, span))
      );
      const anchor = hand.landmarks[0] ?? idx;
      const compensatedX = anchor.x + (idx.x - anchor.x) * depthScale;
      const clampedX = Math.max(0, Math.min(1, compensatedX));
      const clampedY = Math.max(0, Math.min(1, idx.y));
      tapPointById.set(hand.id, {
        x: clampedX * width,
        y: clampedY * height,
      });
    }

    for (const hand of hands) {
      const tapPoint = tapPointById.get(hand.id);
      if (!tapPoint) continue;

      const wristLm = hand.landmarks[0];
      const wristY = (wristLm?.y ?? tapPoint.y / height) * height;
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
      const hardSwing = Math.abs(spikeV) >= WRIST_FLICK_VELOCITY * 1.9;

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
    for (const id of Array.from(handCalibrationRef.current.keys())) {
      if (!activeHandIds.has(id)) handCalibrationRef.current.delete(id);
    }

    let domainPrompt: string | null = null;
    for (const window of domainWindowsRef.current) {
      if (startedDomainsRef.current.has(window.id) && audioMs > window.courseEndMs) {
        startedDomainsRef.current.delete(window.id);
        if (!failedDomainsRef.current.has(window.id)) {
          triggeredDomainsRef.current.add(window.id);
        }
        cinematic.clear();
      }
    }

    const prepDomain = domainWindowsRef.current.find(
      (window) =>
        !triggeredDomainsRef.current.has(window.id) &&
        !failedDomainsRef.current.has(window.id) &&
        audioMs >= window.promptStartMs &&
        audioMs < window.courseStartMs
    );
    if (prepDomain) {
      const hasGesture = hands.some((hand) => hand.gesture === prepDomain.requiredGesture);
      if (hasGesture) {
        armedDomainsRef.current.add(prepDomain.id);
      }
      const isArmed = armedDomainsRef.current.has(prepDomain.id);
      domainPrompt = isArmed
        ? `${prepDomain.title}: ARMED`
        : `PREP ${prepDomain.requiredGesture} to arm ${prepDomain.title}`;
    }

    const runningDomain = domainWindowsRef.current.find(
      (window) =>
        armedDomainsRef.current.has(window.id) &&
        !failedDomainsRef.current.has(window.id) &&
        audioMs >= window.courseStartMs &&
        audioMs <= window.courseEndMs
    );

    if (runningDomain) {
      domainPrompt = `${runningDomain.title}: maintain PERFECT/GOOD`;
      if (!startedDomainsRef.current.has(runningDomain.id)) {
        startedDomainsRef.current.add(runningDomain.id);
        cinematic.trigger(
          runningDomain.style,
          runningDomain.title,
          runningDomain.subtitle,
          audioMs,
          Math.max(650, runningDomain.courseEndMs - audioMs)
        );
      }
    }

    const failRunningDomain = (judgement: Judgement): void => {
      if (!runningDomain) return;
      if (isAccurateJudgement(judgement)) return;
      failedDomainsRef.current.add(runningDomain.id);
      startedDomainsRef.current.delete(runningDomain.id);
      cinematic.clear();
      domainPrompt = `${runningDomain.title}: FAILED`;
    };

    const completeDomainByHit = (note: Note, judgement: Judgement): void => {
      if (!runningDomain) return;
      if (note.required_gesture !== runningDomain.requiredGesture) return;
      if (!isAccurateJudgement(judgement)) {
        failRunningDomain(judgement);
      }
    };

    const finalizeSwipeHit = (note: Note, result: JudgementResult): void => {
      beat.markHit(note.id);
      swipeTracksRef.current.delete(note.id);
      swipeProgressRef.current.delete(note.id);
      guide.addFeedback(note.x * width, note.y * height, result.judgement);
      if (result.judgement !== 'MISS') {
        particle.emitJudgement(note.x * width, note.y * height, result.judgement);
      }
      if (isAccurateJudgement(result.judgement)) {
        audio.playHitTone(note, result.judgement);
      }
      completeDomainByHit(note, result.judgement);
      applyResult(result);
      if (runningDomain && !isAccurateJudgement(result.judgement)) {
        failRunningDomain(result.judgement);
      }
    };

    const failSwipeNote = (note: Note): void => {
      const missed = beat.markMiss(note.id);
      swipeTracksRef.current.delete(note.id);
      swipeProgressRef.current.delete(note.id);
      if (!missed) return;

      const missResult = makeMissResult(note, width, height);
      guide.addFeedback(note.x * width, note.y * height, 'MISS');
      applyResult(missResult);
      failRunningDomain('MISS');
    };

    for (const note of activeNotes) {
      if (note.type !== 'SWIPE') continue;
      const geom = getSwipeGeometry(note, width, height, innerRadius);
      const startRadius = innerRadius * SWIPE_START_RADIUS_MULTIPLIER;
      const corridorRadius = innerRadius * SWIPE_CORRIDOR_RADIUS_MULTIPLIER;
      const expiryMs = note.t_ms + Math.max(420, note.len_ms ?? 520);

      let track = swipeTracksRef.current.get(note.id) ?? null;

      if (!track && audioMs >= note.t_ms - JUDGE_WINDOW_MS && audioMs <= expiryMs) {
        const startCandidate = hands
          .filter((hand) => tapPointById.has(hand.id))
          .map((hand) => {
            const tap = tapPointById.get(hand.id)!;
            const dx = tap.x - geom.startX;
            const dy = tap.y - geom.startY;
            return { handId: hand.id, dist: Math.sqrt(dx * dx + dy * dy) };
          })
          .filter((item) => item.dist <= startRadius)
          .sort((a, b) => a.dist - b.dist)[0];

        if (startCandidate) {
          track = {
            noteId: note.id,
            handId: startCandidate.handId,
            startedMs: audioMs,
            bestProgress: 0,
            lastProgressMs: audioMs,
          };
          swipeTracksRef.current.set(note.id, track);
          swipeProgressRef.current.set(note.id, 0);
        }
      }

      if (!track) continue;

      const tap = tapPointById.get(track.handId);
      if (tap) {
        const relX = tap.x - geom.startX;
        const relY = tap.y - geom.startY;
        const projectionPx = relX * geom.dirX + relY * geom.dirY;
        const lateralPx = Math.abs(relX * geom.dirY - relY * geom.dirX);
        const progress = Math.max(0, Math.min(1, projectionPx / geom.pathLength));

        if (lateralPx <= corridorRadius && projectionPx >= -startRadius * 0.55) {
          track.bestProgress = Math.max(track.bestProgress, progress);
          track.lastProgressMs = audioMs;
          swipeTracksRef.current.set(note.id, track);
          swipeProgressRef.current.set(note.id, track.bestProgress);
        }

        if (track.bestProgress >= SWIPE_COMPLETE_PROGRESS) {
          const fullResult = judgeNote(
            note,
            { x: geom.startX, y: geom.startY },
            track.startedMs,
            note.required_gesture,
            width,
            height,
            scoreRef.current.combo
          );
          finalizeSwipeHit(note, fullResult);
          continue;
        }
      }

      const stalled = audioMs - track.lastProgressMs > 320 && audioMs > note.t_ms + 120;
      const timedOut = audioMs > expiryMs;
      if (stalled || timedOut) {
        failSwipeNote(note);
      }
    }

    const strikeHands = hands.filter((h) => triggeredHandIds.has(h.id));

    if (gameActive) {
      const usedHandIds = new Set<number>();
      const sorted = [...activeNotes].sort(
        (a, b) => Math.abs(a.t_ms - audioMs) - Math.abs(b.t_ms - audioMs)
      );

      for (const note of sorted) {
        if (note.type === 'SWIPE') continue;
        const noteX = note.x * width;
        const noteY = note.y * height;
        if (Math.abs(audioMs - note.t_ms) > JUDGE_WINDOW_MS) continue;

        const lastAttempt = lastAttemptRef.current.get(note.id) ?? -Infinity;
        if (audioMs - lastAttempt < ATTEMPT_COOLDOWN_MS) continue;

        const candidates = strikeHands
          .filter((hand) => !usedHandIds.has(hand.id))
          .filter((hand) => tapPointById.has(hand.id))
          .map((hand) => {
            const tap = tapPointById.get(hand.id)!;
            const dx = tap.x - noteX;
            const dy = tap.y - noteY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            return { hand, tap, dist };
          })
          .filter((item) => item.dist <= tapHitRadius)
          .sort((a, b) => a.dist - b.dist);

        if (!candidates.length) continue;

        const chosen = candidates[0];
        lastAttemptRef.current.set(note.id, audioMs);

        const result = judgeNote(
          note,
          chosen.tap,
          audioMs,
          note.required_gesture,
          width,
          height,
          scoreRef.current.combo
        );

        if (result.judgement === 'WRONG') {
          guide.addFeedback(noteX, noteY, 'WRONG');
          applyResult(result);
          usedHandIds.add(chosen.hand.id);
          failRunningDomain(result.judgement);
          continue;
        }

        beat.markHit(note.id);
        guide.addFeedback(noteX, noteY, result.judgement);
        particle.emitJudgement(noteX, noteY, result.judgement);
        if (isAccurateJudgement(result.judgement)) {
          audio.playHitTone(note, result.judgement);
        }
        completeDomainByHit(note, result.judgement);
        applyResult(result);
        usedHandIds.add(chosen.hand.id);
        failRunningDomain(result.judgement);
      }
    }

    const newMisses = beat.drainNewMisses();
    for (const n of newMisses) {
      const missResult = makeMissResult(n, width, height);
      guide.addFeedback(n.x * width, n.y * height, 'MISS');
      applyResult(missResult);
      failRunningDomain('MISS');
      swipeTracksRef.current.delete(n.id);
      swipeProgressRef.current.delete(n.id);
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
      guide.render(guideCtx, cursors, activeNotes, audioMs, swipeProgressRef.current);
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
        totalNotesRef.current,
        width,
        height,
        domainPrompt,
        cinematic.getActiveTitle(),
        isFullscreen
      );
    }
  }, [trackerOutput, isTrackerReady, isSongReady, isStarted, finished, applyResult, isFullscreen]);

  useGameLoop({ active: true, onFrame });

  const canvasStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    transform: 'translateZ(0)',
    willChange: 'transform, opacity',
    backfaceVisibility: 'hidden',
    pointerEvents: 'none',
  };

  const errorText = trackerError ?? loadError;
  const hasTrackedHand = trackerOutput.hands.length >= CALIBRATION_MIN_HANDS;
  const canStart = isSongReady && isTrackerReady && hasTrackedHand;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        margin: 0,
        background: '#000',
        overflow: 'hidden',
      }}
    >
      <video
        ref={videoRef}
        style={{ position: 'absolute', left: -9999, visibility: 'hidden', pointerEvents: 'none' }}
        width={BASE_WIDTH}
        height={BASE_HEIGHT}
        playsInline
        muted
      />

      <canvas ref={bgCanvasRef} width={stageSize.width} height={stageSize.height} style={{ ...canvasStyle, zIndex: 1 }} />
      <canvas ref={cinemaCanvasRef} width={stageSize.width} height={stageSize.height} style={{ ...canvasStyle, zIndex: 2 }} />
      <canvas ref={guideCanvasRef} width={stageSize.width} height={stageSize.height} style={{ ...canvasStyle, zIndex: 3 }} />
      <canvas ref={particleCanvasRef} width={stageSize.width} height={stageSize.height} style={{ ...canvasStyle, zIndex: 4 }} />
      <canvas ref={uiCanvasRef} width={stageSize.width} height={stageSize.height} style={{ ...canvasStyle, zIndex: 5 }} />

      <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 6, display: 'flex', gap: 8 }}>
        <button
          onClick={() => onExit?.()}
          style={{
            background: 'rgba(0,0,0,0.45)',
            border: '1px solid #5588aa',
            color: '#d8f2ff',
            padding: '7px 11px',
            cursor: 'pointer',
            fontFamily: 'monospace',
          }}
        >
          Song Select
        </button>
        <button
          onClick={toggleFullscreen}
          style={{
            background: 'rgba(0,0,0,0.45)',
            border: '1px solid #45b7e6',
            color: '#d8f2ff',
            padding: '7px 11px',
            cursor: 'pointer',
            fontFamily: 'monospace',
          }}
        >
          {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
        </button>
      </div>

      {errorText && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 7,
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
            zIndex: 7,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.42)',
            color: '#ffffff',
            fontFamily: 'monospace',
            gap: 14,
            textAlign: 'center',
            padding: 18,
          }}
        >
          <div style={{ fontSize: 28, fontWeight: 700 }}>Ready to Play</div>
          <div>Move fingertip to notes and flick wrist on beat.</div>
          <div>Swipe notes: trace from first circle to last circle.</div>
          <div>Domain: do prep gesture, then keep PERFECT/GOOD during course.</div>
          {!hasTrackedHand && (
            <div style={{ color: '#ffd67a' }}>Show your hand to camera to unlock START.</div>
          )}
          <button
            onClick={startGame}
            disabled={!canStart}
            style={{
              marginTop: 6,
              background: canStart ? '#00c4a4' : '#50706b',
              border: 'none',
              color: '#001a18',
              padding: '12px 22px',
              fontFamily: 'monospace',
              fontWeight: 700,
              cursor: canStart ? 'pointer' : 'not-allowed',
              opacity: canStart ? 1 : 0.75,
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
            zIndex: 7,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.45)',
            color: '#ffffff',
            fontFamily: 'monospace',
            gap: 10,
            textAlign: 'center',
            padding: 16,
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

