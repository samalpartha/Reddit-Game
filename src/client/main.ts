import type { RevealResponse, RevealPayload, GameMakerEvent } from '../shared/types';

// ═══════════════════════════════════════════════════════════════════════════════
// Daily Verdict – GameMaker Reveal Page
//
// This page attempts to load the GameMaker reveal experience.
// If GameMaker assets are not present or fail to load, it falls back
// to a pure CSS/HTML animated reveal.
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
    // Daily Verdict bridge
    DV_REVEAL_PAYLOAD?: RevealPayload;
    DV_onGameMakerEvent?: (event: GameMakerEvent) => void;
  }
}

// ─── DOM Elements ────────────────────────────────────────────────────────────

const statusEl = document.getElementById('status') as HTMLElement;
const progressEl = document.getElementById('progress') as HTMLProgressElement;
const spinnerEl = document.getElementById('spinner') as HTMLElement;
const canvasEl = document.getElementById('canvas') as HTMLCanvasElement;
const loadingEl = document.getElementById('loading') as HTMLElement;
const fallbackEl = document.getElementById('fallback-reveal') as HTMLElement;

// ─── Reveal Data ─────────────────────────────────────────────────────────────

let revealData: RevealResponse | null = null;
let fallbackShown = false;

// ─── Initialize ──────────────────────────────────────────────────────────────

async function init() {
  try {
    // Fetch reveal data
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
      showFallbackReveal();
      return;
    }

    // Prepare payload for GameMaker
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

    // Set up GameMaker event handler
    window.DV_onGameMakerEvent = (event: GameMakerEvent) => {
      if (event.type === 'reveal_complete') {
        console.log('GameMaker reveal complete');
      } else if (event.type === 'stamp_pressed') {
        console.log('Stamp pressed in GameMaker');
      }
    };

    // Try to load GameMaker
    const gmAvailable = await checkGameMakerAvailable();
    if (gmAvailable) {
      loadGameMaker();
    } else {
      showFallbackReveal();
    }
  } catch (error) {
    console.error('Reveal init error:', error);
    showFallbackReveal();
  }
}

// ─── GameMaker Loading ───────────────────────────────────────────────────────

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
    // Load manifest
    const res = await fetch('/runner.json', { credentials: 'include', cache: 'no-cache' });
    if (!res.ok) throw new Error('runner.json not found');
    const manifest = (await res.json()) as RunnerManifest;

    window.manifestFiles = () => manifest.manifestFiles.join(';');
    window.manifestFilesMD5 = () => manifest.manifestFilesMD5.slice();

    // Setup Module
    setupGameMakerModule();
    setupGameMakerGlobals();

    // Load runner script
    const script = document.createElement('script');
    script.src = '/runner.js';
    script.async = true;
    script.type = 'text/javascript';

    script.onload = () => {
      console.log('GameMaker runner loaded');
    };

    script.onerror = () => {
      console.error('GameMaker runner failed to load');
      showFallbackReveal();
    };

    document.head.appendChild(script);

    // Set a timeout – if GM doesn't render within 10s, fallback
    setTimeout(() => {
      if (canvasEl.style.display === 'none' || !canvasEl.classList.contains('active')) {
        console.warn('GameMaker timed out, showing fallback');
        showFallbackReveal();
      }
    }, 10000);
  } catch {
    showFallbackReveal();
  }
}

function setupGameMakerModule() {
  window.Module = {
    preRun: [],
    postRun: [],
    print: (text: string) => {
      console.log(text);
      if (text === 'Entering main loop.') {
        canvasEl.style.height = '100%';
        canvasEl.style.width = '100%';
        canvasEl.classList.add('active');
        loadingEl.style.display = 'none';
      }
    },
    printErr: (text: string) => console.error(text),
    canvas: canvasEl,
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
          canvasEl.style.display = 'block';
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
    window.Module.setStatus('Exception thrown, see JavaScript console');
    spinnerEl.style.display = 'none';
    window.Module.setStatus = (text: string) => {
      if (text) window.Module.printErr(`[post-exception status] ${text}`);
    };
  };
}

function setupGameMakerGlobals() {
  window.g_pAddAsyncMethod = -1;
  window.setAddAsyncMethod = (asyncMethod: any) => { window.g_pAddAsyncMethod = asyncMethod; };
  window.g_pJSExceptionHandler = undefined;
  window.setJSExceptionHandler = (handler: any) => {
    if (typeof handler === 'function') window.g_pJSExceptionHandler = handler;
  };
  window.hasJSExceptionHandler = () => typeof window.g_pJSExceptionHandler === 'function';
  window.doJSExceptionHandler = (json: string) => {
    if (typeof window.g_pJSExceptionHandler === 'function') {
      window.g_pJSExceptionHandler(JSON.parse(json));
    }
  };
  window.g_pWadLoadCallback = undefined;
  window.setWadLoadCallback = (cb: any) => { window.g_pWadLoadCallback = cb; };
  window.onFirstFrameRendered = () => { console.log('First frame rendered!'); };
  window.onGameSetWindowSize = (w: number, h: number) => { console.log(`GM size: ${w}x${h}`); };
  window.triggerAd = () => {};
  window.triggerPayment = () => {};
  window.toggleElement = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.style.display = el.style.display === 'block' ? 'none' : 'block';
  };
  window.set_acceptable_rollback = () => {};
  window.report_stats = () => {};
  window.log_next_game_state = () => {};
  window.wallpaper_update_config = () => {};
  window.wallpaper_reset_config = () => {};
}

// ─── Fallback Reveal (Pure CSS/HTML) ─────────────────────────────────────────

function showFallbackReveal() {
  if (fallbackShown) return; // Prevent duplicate calls
  fallbackShown = true;

  loadingEl.style.display = 'none';
  canvasEl.style.display = 'none';
  fallbackEl.classList.remove('hidden');

  if (!revealData) {
    const stampText = document.getElementById('fb-stamp-text');
    if (stampText) stampText.textContent = 'NO DATA';
    return;
  }

  const { majorityIndex, majorityLabel, percentages, aggregate, score, streak } = revealData;
  const labels = revealData.case.labels;

  // Stamp
  const stamp = document.getElementById('fb-stamp');
  const stampText = document.getElementById('fb-stamp-text');
  if (stamp) stamp.dataset['majority'] = String(majorityIndex);
  if (stampText) stampText.textContent = majorityLabel.toUpperCase();

  // Chart
  const chart = document.getElementById('fb-chart');
  if (chart) {
    chart.innerHTML = '';
    labels.forEach((label, i) => {
      const row = document.createElement('div');
      row.className = 'fb-bar-row';
      row.innerHTML = `
        <div class="fb-bar-header">
          <span class="fb-bar-label">${label}</span>
          <span class="fb-bar-pct">${percentages[i]}%</span>
        </div>
        <div class="fb-bar-track">
          <div class="fb-bar-fill" data-index="${i}" style="width: ${Math.max(percentages[i]!, 2)}%; animation-delay: ${0.8 + i * 0.2}s"></div>
        </div>
      `;
      chart.appendChild(row);
    });
  }

  // Score
  const scoreValue = document.getElementById('fb-score-value');
  const scoreDetail = document.getElementById('fb-score-detail');
  if (scoreValue) {
    scoreValue.textContent = String(score.total);
  }
  if (scoreDetail) {
    const parts: string[] = [];
    if (score.predictionMatch > 0) parts.push(`Prediction +${score.predictionMatch}`);
    if (score.verdictMatch > 0) parts.push(`Verdict +${score.verdictMatch}`);
    if (score.timingBonus > 0) parts.push(`Timing +${score.timingBonus}`);
    if (score.influenceBonus > 0) parts.push(`Influence +${score.influenceBonus}`);
    if (score.streakBonus > 0) parts.push(`Streak +${score.streakBonus}`);
    scoreDetail.textContent = parts.join(' · ') || 'No points earned';
  }

  // Streak
  const streakText = document.getElementById('fb-streak-text');
  if (streakText) {
    streakText.textContent = `${streak.current} day streak (best: ${streak.best})`;
  }

  // Done button
  const doneBtn = document.getElementById('fb-done-btn');
  doneBtn?.addEventListener('click', () => {
    window.history.back();
  });
}

// ─── Start ───────────────────────────────────────────────────────────────────

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { init().catch(console.error); });
} else {
  init().catch(console.error);
}
