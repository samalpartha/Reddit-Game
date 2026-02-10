import type { RevealResponse, RevealPayload, GameMakerEvent } from '../shared/types';

// ═══════════════════════════════════════════════════════════════════════════════
// Daily Verdict – Canvas Reveal Experience
//
// A spectacular animated reveal using HTML5 Canvas with:
// - Particle confetti explosion
// - Physics-based stamp drop with bounce
// - Racing bar chart animation
// - Score counter with glow effects
// - Streak fire particles
//
// Falls back gracefully. GameMaker integration preserved.
// ═══════════════════════════════════════════════════════════════════════════════

declare global {
  interface Window {
    Module: any;
    GM_tick?: (time: number) => void;
    onGameSetWindowSize?: (width: number, height: number) => void;
    manifestFiles?: () => string;
    manifestFilesMD5?: () => string[];
    log_next_game_state?: () => void;
    wallpaper_update_config?: (config: string) => void;
    wallpaper_reset_config?: () => void;
    setAddAsyncMethod?: (method: any) => void;
    setJSExceptionHandler?: (handler: any) => void;
    hasJSExceptionHandler?: () => boolean;
    doJSExceptionHandler?: (exceptionJSON: string) => void;
    setWadLoadCallback?: (callback: any) => void;
    onFirstFrameRendered?: () => void;
    triggerAd?: (adId: string, ...callbacks: any[]) => void;
    triggerPayment?: (itemId: string, callback: any) => void;
    toggleElement?: (id: string) => void;
    set_acceptable_rollback?: (frames: number) => void;
    report_stats?: (statsData: any) => void;
    g_pAddAsyncMethod?: any;
    g_pJSExceptionHandler?: any;
    g_pWadLoadCallback?: any;
    DV_REVEAL_PAYLOAD?: RevealPayload;
    DV_onGameMakerEvent?: (event: GameMakerEvent) => void;
  }
}

// ─── Color Palette ──────────────────────────────────────────────────────────

const COLORS = {
  bg: '#0a0a0f',
  bgGrad: '#141428',
  text: '#ffffff',
  textDim: '#8a8f98',
  gold: '#f0c040',
  orange: '#ff4500',
  verdicts: ['#4caf50', '#f44336', '#ff9800', '#2196f3'],
  verdictsDim: ['rgba(76,175,80,0.3)', 'rgba(244,67,54,0.3)', 'rgba(255,152,0,0.3)', 'rgba(33,150,243,0.3)'],
};

// ─── Particle System ────────────────────────────────────────────────────────

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  color: string;
  size: number;
  rotation: number;
  rotationSpeed: number;
  type: 'confetti' | 'spark' | 'fire';
  gravity: number;
  friction: number;
}

const particles: Particle[] = [];

function spawnConfetti(cx: number, cy: number, count: number, color: string) {
  const confettiColors = [color, COLORS.gold, '#ffffff', COLORS.orange, color];
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const speed = 3 + Math.random() * 6;
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      life: 1, maxLife: 60 + Math.random() * 40,
      color: confettiColors[Math.floor(Math.random() * confettiColors.length)]!,
      size: 3 + Math.random() * 5,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.3,
      type: 'confetti',
      gravity: 0.12,
      friction: 0.98,
    });
  }
}

function spawnSparks(cx: number, cy: number, count: number, color: string) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 4;
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1, maxLife: 20 + Math.random() * 20,
      color,
      size: 1 + Math.random() * 2,
      rotation: 0, rotationSpeed: 0,
      type: 'spark',
      gravity: 0.05,
      friction: 0.96,
    });
  }
}

function spawnFireParticles(cx: number, cy: number, count: number) {
  const fireColors = ['#ff4500', '#ff6a33', '#f0c040', '#ff8c00', '#ffaa00'];
  for (let i = 0; i < count; i++) {
    particles.push({
      x: cx + (Math.random() - 0.5) * 20,
      y: cy,
      vx: (Math.random() - 0.5) * 1.5,
      vy: -1 - Math.random() * 3,
      life: 1, maxLife: 15 + Math.random() * 15,
      color: fireColors[Math.floor(Math.random() * fireColors.length)]!,
      size: 2 + Math.random() * 4,
      rotation: 0, rotationSpeed: 0,
      type: 'fire',
      gravity: -0.02,
      friction: 0.97,
    });
  }
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]!;
    p.vx *= p.friction;
    p.vy *= p.friction;
    p.vy += p.gravity;
    p.x += p.vx;
    p.y += p.vy;
    p.rotation += p.rotationSpeed;
    p.life -= 1 / p.maxLife;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function drawParticles(ctx: CanvasRenderingContext2D) {
  for (const p of particles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.translate(p.x, p.y);

    if (p.type === 'confetti') {
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    } else if (p.type === 'spark') {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(0, 0, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.type === 'fire') {
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size);
      gradient.addColorStop(0, p.color);
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

// ─── Animation State ────────────────────────────────────────────────────────

interface RevealAnimation {
  phase: 'intro' | 'stamp' | 'bars' | 'score' | 'streak' | 'done';
  frameCount: number;
  stampScale: number;
  stampRotation: number;
  stampY: number;
  stampTargetY: number;
  stampOpacity: number;
  barWidths: number[];
  barTargets: number[];
  scoreValue: number;
  scoreTarget: number;
  streakScale: number;
  titleOpacity: number;
  doneOpacity: number;
  shakeX: number;
  shakeY: number;
}

let anim: RevealAnimation;
let revealData: RevealResponse | null = null;
let fallbackShown = false;
let canvasCtx: CanvasRenderingContext2D | null = null;
let W = 0;
let H = 0;
let dpr = 1;

// ─── Canvas Reveal Renderer ─────────────────────────────────────────────────

function initCanvasReveal() {
  const canvas = document.getElementById('reveal-canvas') as HTMLCanvasElement;
  if (!canvas || !revealData) return;

  const container = canvas.parentElement!;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = Math.min(container.clientWidth, 480);
  H = container.clientHeight || window.innerHeight;

  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';

  canvasCtx = canvas.getContext('2d');
  if (!canvasCtx) return;
  canvasCtx.scale(dpr, dpr);

  const pcts = revealData.percentages;
  const maxPct = Math.max(...pcts, 1);

  anim = {
    phase: 'intro',
    frameCount: 0,
    stampScale: 3,
    stampRotation: -20 * (Math.PI / 180),
    stampY: -100,
    stampTargetY: 120,
    stampOpacity: 0,
    barWidths: [0, 0, 0, 0],
    barTargets: pcts.map(p => (p / maxPct) * (W - 80)),
    scoreValue: 0,
    scoreTarget: revealData.score.total,
    streakScale: 0,
    titleOpacity: 0,
    doneOpacity: 0,
    shakeX: 0,
    shakeY: 0,
  };

  requestAnimationFrame(tick);
}

function tick() {
  if (!canvasCtx || !revealData) return;
  const ctx = canvasCtx;

  anim.frameCount++;

  // Clear
  ctx.clearRect(0, 0, W, H);

  // Background gradient
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, COLORS.bgGrad);
  bgGrad.addColorStop(1, COLORS.bg);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Shake offset
  ctx.save();
  ctx.translate(anim.shakeX, anim.shakeY);
  anim.shakeX *= 0.9;
  anim.shakeY *= 0.9;

  // Phase transitions
  if (anim.phase === 'intro' && anim.frameCount > 30) {
    anim.phase = 'stamp';
  }

  // ─── Draw Title ───
  anim.titleOpacity = Math.min(1, anim.frameCount / 30);
  ctx.globalAlpha = anim.titleOpacity;
  ctx.fillStyle = COLORS.text;
  ctx.font = `800 24px -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('The Verdict Is In', W / 2, 50);
  ctx.globalAlpha = 1;

  // ─── Draw Stamp ───
  if (anim.phase === 'stamp' || anim.frameCount > 30) {
    const stampFrame = anim.frameCount - 30;
    const majorColor = COLORS.verdicts[revealData.majorityIndex] ?? COLORS.verdicts[0]!;
    const cx = W / 2;

    // Animate stamp drop with bounce
    if (stampFrame < 20) {
      const t = stampFrame / 20;
      const eased = 1 - Math.pow(1 - t, 3);
      anim.stampScale = 3 - 2 * eased; // 3 → 1
      anim.stampRotation = (-20 + 20 * eased) * (Math.PI / 180);
      anim.stampOpacity = eased;
      anim.stampY = -100 + (anim.stampTargetY + 100) * eased;
    } else if (stampFrame < 30) {
      const t = (stampFrame - 20) / 10;
      anim.stampScale = 1 + 0.08 * Math.sin(t * Math.PI);
      anim.stampRotation = 0;
      anim.stampY = anim.stampTargetY;
      anim.stampOpacity = 1;

      // Shake on "impact"
      if (stampFrame === 20) {
        anim.shakeX = (Math.random() - 0.5) * 8;
        anim.shakeY = (Math.random() - 0.5) * 8;
        spawnConfetti(cx, anim.stampTargetY, 60, majorColor);
        spawnSparks(cx, anim.stampTargetY, 30, majorColor);
      }
    } else {
      anim.stampScale = 1;
      anim.stampRotation = 0;
      anim.stampOpacity = 1;
    }

    // Draw stamp circle
    ctx.save();
    ctx.globalAlpha = anim.stampOpacity;
    ctx.translate(cx, anim.stampY);
    ctx.rotate(anim.stampRotation);
    ctx.scale(anim.stampScale, anim.stampScale);

    // Outer ring
    ctx.beginPath();
    ctx.arc(0, 0, 70, 0, Math.PI * 2);
    ctx.strokeStyle = majorColor;
    ctx.lineWidth = 4;
    ctx.stroke();

    // Inner ring
    ctx.beginPath();
    ctx.arc(0, 0, 60, 0, Math.PI * 2);
    ctx.strokeStyle = majorColor;
    ctx.lineWidth = 2;
    ctx.globalAlpha = anim.stampOpacity * 0.4;
    ctx.stroke();
    ctx.globalAlpha = anim.stampOpacity;

    // Glow
    ctx.shadowColor = majorColor;
    ctx.shadowBlur = 20;

    // Label text
    ctx.fillStyle = majorColor;
    ctx.font = `900 16px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = revealData.majorityLabel.toUpperCase();
    // Wrap long labels
    if (label.length > 12) {
      const mid = Math.ceil(label.length / 2);
      const spaceIdx = label.indexOf(' ', mid - 4);
      const line1 = spaceIdx > 0 ? label.slice(0, spaceIdx) : label.slice(0, mid);
      const line2 = spaceIdx > 0 ? label.slice(spaceIdx + 1) : label.slice(mid);
      ctx.fillText(line1, 0, -10);
      ctx.fillText(line2, 0, 12);
    } else {
      ctx.fillText(label, 0, 0);
    }

    ctx.shadowBlur = 0;
    ctx.restore();

    // Voters text
    if (stampFrame > 15) {
      ctx.globalAlpha = Math.min(1, (stampFrame - 15) / 15);
      ctx.fillStyle = COLORS.textDim;
      ctx.font = `500 14px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`${revealData.aggregate.voters} voters`, cx, anim.stampTargetY + 90);
      ctx.globalAlpha = 1;
    }

    // Transition to bars
    if (stampFrame > 40 && anim.phase === 'stamp') {
      anim.phase = 'bars';
    }
  }

  // ─── Draw Bars ───
  const barsStartY = anim.stampTargetY + 115;
  if (anim.phase === 'bars' || anim.phase === 'score' || anim.phase === 'streak' || anim.phase === 'done') {
    const barH = 28;
    const barGap = 50;
    const barX = 40;
    const maxW = W - 80;

    for (let i = 0; i < 4; i++) {
      const rowY = barsStartY + i * barGap;
      const target = anim.barTargets[i]!;

      // Animate bar width
      anim.barWidths[i] = anim.barWidths[i]! + (target - anim.barWidths[i]!) * 0.08;

      const pct = revealData.percentages[i]!;
      const barColor = COLORS.verdicts[i]!;

      // Label
      ctx.fillStyle = i === revealData.majorityIndex ? COLORS.text : '#9ca3af';
      ctx.font = `600 13px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(revealData.case.labels[i]!, barX, rowY - 6);

      // Percentage
      ctx.fillStyle = COLORS.text;
      ctx.font = `800 14px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.textAlign = 'right';
      ctx.fillText(`${pct}%`, W - barX, rowY - 6);

      // Bar track
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      roundRect(ctx, barX, rowY, maxW, barH, 8);
      ctx.fill();

      // Bar fill
      const fillW = Math.max(anim.barWidths[i]!, 0);
      if (fillW > 1) {
        const grad = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
        grad.addColorStop(0, COLORS.verdictsDim[i]!);
        grad.addColorStop(1, barColor);
        ctx.fillStyle = grad;
        roundRect(ctx, barX, rowY, fillW, barH, 8);
        ctx.fill();

        // Count inside bar
        if (fillW > 30) {
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.font = `700 11px -apple-system, BlinkMacSystemFont, sans-serif`;
          ctx.textAlign = 'right';
          ctx.fillText(String(revealData.aggregate.counts[i]), barX + fillW - 8, rowY + barH / 2 + 4);
        }
      }
    }

    // Transition
    const barsReady = anim.barWidths.every((w, i) => Math.abs(w - anim.barTargets[i]!) < 2);
    if (barsReady && anim.phase === 'bars') {
      anim.phase = 'score';
    }
  }

  // ─── Draw Score ───
  const scoreY = barsStartY + 4 * 50 + 30;
  if (anim.phase === 'score' || anim.phase === 'streak' || anim.phase === 'done') {
    anim.scoreValue += (anim.scoreTarget - anim.scoreValue) * 0.06;
    const displayScore = Math.round(anim.scoreValue);

    // Score label
    ctx.fillStyle = COLORS.textDim;
    ctx.font = `700 11px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.textAlign = 'center';
    ctx.letterSpacing = '1.5px';
    ctx.fillText('YOUR SCORE', W / 2, scoreY);
    ctx.letterSpacing = '0px';

    // Score number with glow
    ctx.save();
    ctx.shadowColor = COLORS.gold;
    ctx.shadowBlur = 30;
    ctx.fillStyle = COLORS.gold;
    ctx.font = `900 52px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(String(displayScore), W / 2, scoreY + 50);
    ctx.shadowBlur = 0;
    ctx.restore();

    // Score breakdown
    const breakdown = [
      { label: 'Prediction', val: revealData.score.predictionMatch, max: 60 },
      { label: 'Verdict', val: revealData.score.verdictMatch, max: 30 },
      { label: 'Timing', val: revealData.score.timingBonus, max: 20 },
      { label: 'Influence', val: revealData.score.influenceBonus, max: 15 },
      { label: 'Streak', val: revealData.score.streakBonus, max: 10 },
      { label: 'Mini-Game', val: revealData.score.miniGameBonus ?? 0, max: 10 },
    ];

    let bdY = scoreY + 70;
    ctx.font = `600 12px -apple-system, BlinkMacSystemFont, sans-serif`;
    for (const b of breakdown) {
      ctx.fillStyle = COLORS.textDim;
      ctx.textAlign = 'left';
      ctx.fillText(b.label, 50, bdY);
      ctx.fillStyle = b.val > 0 ? '#4caf50' : '#4b5563';
      ctx.textAlign = 'right';
      ctx.fillText(`${b.val > 0 ? '+' : ''}${b.val}/${b.max}`, W - 50, bdY);
      bdY += 22;
    }

    // Transition
    if (Math.abs(anim.scoreValue - anim.scoreTarget) < 1 && anim.phase === 'score') {
      anim.phase = 'streak';
      spawnSparks(W / 2, scoreY + 40, 20, COLORS.gold);
    }
  }

  // ─── Draw Streak ───
  const streakY = barsStartY + 4 * 50 + 210;
  if (anim.phase === 'streak' || anim.phase === 'done') {
    anim.streakScale = Math.min(1, anim.streakScale + 0.06);

    ctx.save();
    ctx.translate(W / 2, streakY);
    ctx.scale(anim.streakScale, anim.streakScale);

    // Streak background
    ctx.fillStyle = 'rgba(255,152,0,0.08)';
    roundRect(ctx, -120, -18, 240, 42, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,152,0,0.15)';
    ctx.lineWidth = 1;
    roundRect(ctx, -120, -18, 240, 42, 12);
    ctx.stroke();

    // Fire emoji + text
    ctx.font = `24px -apple-system`;
    ctx.textAlign = 'center';
    ctx.fillText('🔥', -90, 10);

    ctx.fillStyle = '#ff9800';
    ctx.font = `900 22px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(String(revealData.streak.current), -65, 10);

    ctx.fillStyle = '#b0b5c0';
    ctx.font = `500 14px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.fillText('round streak', -35, 10);

    ctx.fillStyle = COLORS.textDim;
    ctx.font = `600 11px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText(`Best: ${revealData.streak.best}`, 110, 10);

    ctx.restore();

    // Fire particles
    if (anim.frameCount % 3 === 0) {
      spawnFireParticles(W / 2 - 90, streakY - 10, 2);
    }

    if (anim.streakScale >= 1 && anim.phase === 'streak') {
      anim.phase = 'done';
    }
  }

  // ─── Done Button ───
  if (anim.phase === 'done') {
    anim.doneOpacity = Math.min(1, anim.doneOpacity + 0.03);

    const btnY = streakY + 60;
    ctx.globalAlpha = anim.doneOpacity;

    // Button
    const btnW = 200;
    const btnH = 48;
    const btnX = (W - btnW) / 2;
    const grad = ctx.createLinearGradient(btnX, btnY, btnX + btnW, btnY);
    grad.addColorStop(0, '#d93900');
    grad.addColorStop(1, '#ff4500');
    ctx.fillStyle = grad;
    roundRect(ctx, btnX, btnY, btnW, btnH, 14);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = `700 16px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('Back to Game', W / 2, btnY + btnH / 2 + 5);

    ctx.globalAlpha = 1;
  }

  ctx.restore(); // shake offset

  // ─── Particles on top ───
  updateParticles();
  drawParticles(ctx);

  requestAnimationFrame(tick);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ─── Click Handler for Canvas ───────────────────────────────────────────────

function setupCanvasClick() {
  const canvas = document.getElementById('reveal-canvas') as HTMLCanvasElement;
  if (!canvas) return;

  canvas.addEventListener('click', (e) => {
    if (anim?.phase !== 'done') return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const streakY = anim.stampTargetY + 115 + 4 * 50 + 210;
    const btnY = streakY + 60;
    const btnW = 200;
    const btnH = 48;
    const btnX = (W - btnW) / 2;

    if (x >= btnX && x <= btnX + btnW && y >= btnY && y <= btnY + btnH) {
      // Navigate back - close the expanded view
      const fallbackEl = document.getElementById('fallback-reveal');
      const canvasContainer = document.getElementById('canvas-reveal-container');
      if (canvasContainer) canvasContainer.classList.add('hidden');
      if (fallbackEl) fallbackEl.classList.add('hidden');
    }
  });
}

// ─── DOM Elements ────────────────────────────────────────────────────────────

const statusEl = document.getElementById('status') as HTMLElement;
const progressEl = document.getElementById('progress') as HTMLProgressElement;
const spinnerEl = document.getElementById('spinner') as HTMLElement;
const gmCanvasEl = document.getElementById('canvas') as HTMLCanvasElement;
const loadingEl = document.getElementById('loading') as HTMLElement;

// ─── Initialize ──────────────────────────────────────────────────────────────

async function init() {
  try {
    const response = await fetch('/api/today');
    if (!response.ok) throw new Error('Failed to fetch today data');
    const todayData = await response.json();
    const caseId = todayData.case?.caseId;

    if (caseId) {
      const revealRes = await fetch(`/api/reveal?caseId=${caseId}`);
      if (revealRes.ok) {
        revealData = await revealRes.json() as RevealResponse;
      }
    }

    if (!revealData) {
      showCanvasReveal();
      return;
    }

    // Prepare GameMaker payload
    const payload: RevealPayload = {
      majorityLabel: revealData.majorityLabel,
      majorityIndex: revealData.majorityIndex,
      labels: revealData.case.labels,
      counts: revealData.aggregate.counts,
      percentages: revealData.percentages,
      voters: revealData.aggregate.voters,
      userScore: revealData.score,
      streak: revealData.streak,
    };

    window.DV_REVEAL_PAYLOAD = payload;
    window.DV_onGameMakerEvent = (event: GameMakerEvent) => {
      if (event.type === 'reveal_complete' || event.type === 'stamp_pressed') {
        // Handled
      }
    };

    // Try GameMaker first
    const gmAvailable = await checkGameMakerAvailable();
    if (gmAvailable) {
      loadGameMaker();
    } else {
      showCanvasReveal();
    }
  } catch (error) {
    showCanvasReveal();
  }
}

function showCanvasReveal() {
  if (fallbackShown) return;
  fallbackShown = true;

  loadingEl.style.display = 'none';
  if (gmCanvasEl) gmCanvasEl.style.display = 'none';

  const container = document.getElementById('canvas-reveal-container');
  if (container) {
    container.classList.remove('hidden');
    initCanvasReveal();
    setupCanvasClick();
  }
}

// ─── GameMaker Loading (preserved) ──────────────────────────────────────────

async function checkGameMakerAvailable(): Promise<boolean> {
  try {
    const res = await fetch('/runner.json', { method: 'HEAD', cache: 'no-cache' });
    return res.ok;
  } catch {
    return false;
  }
}

type RunnerManifest = {
  manifestFiles: string[];
  manifestFilesMD5: string[];
  mainJS?: string;
  unx?: string;
  index?: string;
  runner?: { version?: string; yyc?: boolean };
};

async function loadGameMaker() {
  try {
    const res = await fetch('/runner.json', { credentials: 'include', cache: 'no-cache' });
    if (!res.ok) throw new Error('runner.json not found');
    const manifest = (await res.json()) as RunnerManifest;

    window.manifestFiles = () => manifest.manifestFiles.join(';');
    window.manifestFilesMD5 = () => manifest.manifestFilesMD5.slice();

    setupGameMakerModule();
    setupGameMakerGlobals();

    const script = document.createElement('script');
    script.src = '/runner.js';
    script.async = true;
    script.type = 'text/javascript';
    script.onload = () => {};
    script.onerror = () => { showCanvasReveal(); };
    document.head.appendChild(script);

    setTimeout(() => {
      if (gmCanvasEl.style.display === 'none' || !gmCanvasEl.classList.contains('active')) {
        showCanvasReveal();
      }
    }, 10000);
  } catch {
    showCanvasReveal();
  }
}

function setupGameMakerModule() {
  window.Module = {
    preRun: [],
    postRun: [],
    print: (text: string) => {
      if (text === 'Entering main loop.') {
        gmCanvasEl.style.height = '100%';
        gmCanvasEl.style.width = '100%';
        gmCanvasEl.classList.add('active');
        loadingEl.style.display = 'none';
      }
    },
    printErr: () => {},
    canvas: gmCanvasEl,
    setStatus: (text: string) => {
      if (!window.Module.setStatus.last) {
        window.Module.setStatus.last = { time: Date.now(), text: '' };
      }
      if (text === window.Module.setStatus.last.text) return;
      const m = text.match(/([^(]+)\((\d+(?:\.\d+)?)\/(\d+)\)/);
      const now = Date.now();
      if (m && now - window.Module.setStatus.last.time < 30) return;
      window.Module.setStatus.last.time = now;
      window.Module.setStatus.last.text = text;
      if (m) {
        progressEl.value = parseInt(m[2]!) * 100;
        progressEl.max = parseInt(m[3]!) * 100;
        progressEl.hidden = false;
        spinnerEl.hidden = false;
      } else {
        progressEl.value = 0;
        progressEl.max = 100;
        progressEl.hidden = true;
        if (!text) {
          spinnerEl.style.display = 'none';
          gmCanvasEl.style.display = 'block';
          loadingEl.style.display = 'none';
        }
      }
      statusEl.innerHTML = text;
    },
    totalDependencies: 0,
    monitorRunDependencies: (left: number) => {
      window.Module.totalDependencies = Math.max(window.Module.totalDependencies, left);
      window.Module.setStatus(
        left
          ? `Preparing... (${window.Module.totalDependencies - left}/${window.Module.totalDependencies})`
          : 'All downloads complete.'
      );
    },
  };
  window.Module.setStatus('Downloading...');
  window.onerror = () => {
    window.Module.setStatus('Exception thrown');
    spinnerEl.style.display = 'none';
    window.Module.setStatus = () => {};
  };
}

function setupGameMakerGlobals() {
  window.g_pAddAsyncMethod = -1;
  window.setAddAsyncMethod = (m: any) => { window.g_pAddAsyncMethod = m; };
  window.g_pJSExceptionHandler = undefined;
  window.setJSExceptionHandler = (h: any) => { if (typeof h === 'function') window.g_pJSExceptionHandler = h; };
  window.hasJSExceptionHandler = () => typeof window.g_pJSExceptionHandler === 'function';
  window.doJSExceptionHandler = (j: string) => { if (typeof window.g_pJSExceptionHandler === 'function') window.g_pJSExceptionHandler(JSON.parse(j)); };
  window.g_pWadLoadCallback = undefined;
  window.setWadLoadCallback = (cb: any) => { window.g_pWadLoadCallback = cb; };
  window.onFirstFrameRendered = () => {};
  window.onGameSetWindowSize = () => {};
  window.triggerAd = () => {};
  window.triggerPayment = () => {};
  window.toggleElement = (id: string) => { const el = document.getElementById(id); if (el) el.style.display = el.style.display === 'block' ? 'none' : 'block'; };
  window.set_acceptable_rollback = () => {};
  window.report_stats = () => {};
  window.log_next_game_state = () => {};
  window.wallpaper_update_config = () => {};
  window.wallpaper_reset_config = () => {};
}

// ─── Start ───────────────────────────────────────────────────────────────────

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { init().catch(() => {}); });
} else {
  init().catch(() => {});
}
