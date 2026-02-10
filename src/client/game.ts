import { context, requestExpandedMode } from '@devvit/web/client';
import type {
  TodayResponse,
  VoteResponse,
  RevealResponse,
  ArchiveEntry,
  CaseSubmission,
  ScoreBreakdown,
} from '../shared/types';

// ═══════════════════════════════════════════════════════════════════════════════
// Daily Verdict – Game Client
// State machine: loading → open → voted → revealed
//                                  ↕ archive, archive-detail, submit, mod-queue
// ═══════════════════════════════════════════════════════════════════════════════

type GameView = 'loading' | 'open' | 'voted' | 'closed' | 'revealed' | 'archive' | 'archive-detail' | 'submit' | 'mod' | 'minigame' | 'error';

// ─── State ───────────────────────────────────────────────────────────────────

let currentView: GameView = 'loading';
let todayData: TodayResponse | null = null;
let revealData: RevealResponse | null = null;
let selectedVerdict: number = -1;
let selectedPrediction: number = -1;
let countdownTimer: ReturnType<typeof setInterval> | null = null;
let previousView: GameView = 'loading';
let submitListenersAttached = false;
let hasSeenOnboarding = false;

// ─── View Management ─────────────────────────────────────────────────────────

const views: GameView[] = ['loading', 'open', 'voted', 'closed', 'revealed', 'archive', 'archive-detail', 'submit', 'mod', 'minigame', 'error'];

function showView(view: GameView) {
  previousView = currentView;
  currentView = view;
  for (const v of views) {
    const el = document.getElementById(`view-${v}`);
    if (el) {
      el.classList.toggle('hidden', v !== view);
    }
  }
}

// ─── Toast ───────────────────────────────────────────────────────────────────

function showToast(message: string, type: 'success' | 'error' | '' = '') {
  let toast = document.querySelector('.toast') as HTMLDivElement;
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.className = `toast ${type}`;

  requestAnimationFrame(() => {
    toast.classList.add('visible');
  });

  setTimeout(() => {
    toast.classList.remove('visible');
  }, 3000);
}

// ─── Custom Modal (replaces browser prompt) ──────────────────────────────────

function showModal(options: {
  title: string;
  message: string;
  inputPlaceholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.getElementById('modal-overlay')!;
    const titleEl = document.getElementById('modal-title')!;
    const messageEl = document.getElementById('modal-message')!;
    const inputEl = document.getElementById('modal-input') as HTMLInputElement;
    const confirmBtn = document.getElementById('modal-confirm')!;
    const cancelBtn = document.getElementById('modal-cancel')!;

    titleEl.textContent = options.title;
    messageEl.textContent = options.message;
    confirmBtn.textContent = options.confirmLabel ?? 'Confirm';
    cancelBtn.textContent = options.cancelLabel ?? 'Cancel';

    if (options.inputPlaceholder) {
      inputEl.classList.remove('hidden');
      inputEl.placeholder = options.inputPlaceholder;
      inputEl.value = '';
    } else {
      inputEl.classList.add('hidden');
    }

    overlay.classList.remove('hidden');
    requestAnimationFrame(() => overlay.classList.add('visible'));

    if (options.inputPlaceholder) {
      setTimeout(() => inputEl.focus(), 100);
    }

    function cleanup() {
      overlay.classList.remove('visible');
      setTimeout(() => overlay.classList.add('hidden'), 300);
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
      overlay.removeEventListener('click', onOverlayClick);
    }

    function onConfirm() {
      cleanup();
      resolve(options.inputPlaceholder ? inputEl.value : 'confirmed');
    }

    function onCancel() {
      cleanup();
      resolve(null);
    }

    function onOverlayClick(e: Event) {
      if (e.target === overlay) {
        cleanup();
        resolve(null);
      }
    }

    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', onCancel);
    overlay.addEventListener('click', onOverlayClick);
  });
}

// ─── API Helpers ─────────────────────────────────────────────────────────────

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── Date Formatting ─────────────────────────────────────────────────────────

function formatDate(dateKey: string): string {
  const y = parseInt(dateKey.slice(0, 4), 10);
  const m = parseInt(dateKey.slice(4, 6), 10) - 1;
  const d = parseInt(dateKey.slice(6, 8), 10);
  const h = dateKey.length >= 10 ? parseInt(dateKey.slice(8, 10), 10) : -1;
  const date = new Date(y, m, d);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let str = `${days[date.getDay()]} ${months[date.getMonth()]} ${date.getDate()}`;
  if (h >= 0) {
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    str += ` ${h12}${ampm}`;
  }
  return str;
}

function formatCountdown(targetTs: number): string {
  const diff = targetTs - Date.now();
  if (diff <= 0) return 'Now!';

  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

// ─── Countdown Urgency Colors ────────────────────────────────────────────────

function getCountdownUrgency(targetTs: number): string {
  const diff = targetTs - Date.now();
  const minutes = diff / 60000;
  if (minutes > 30) return 'urgency-calm'; // green
  if (minutes > 10) return 'urgency-warning'; // yellow
  return 'urgency-critical'; // red
}

// ─── Initialize ──────────────────────────────────────────────────────────────

async function init() {
  try {
    const initData = await apiGet<{ type: string; postId: string; username: string; userId: string; isMod: boolean }>('/api/init');

    if (initData.isMod) {
      document.querySelectorAll('.mod-only').forEach((el) => el.classList.remove('hidden'));
    }

    todayData = await apiGet<TodayResponse>('/api/today');
    determineInitialView();
  } catch (err) {
    console.error('Init failed:', err);
    const errorMsg = document.getElementById('error-message');
    if (errorMsg) errorMsg.textContent = err instanceof Error ? err.message : 'Failed to load';
    showView('error');
  }
}

function determineInitialView() {
  if (!todayData) {
    showView('error');
    return;
  }

  const { case: caseData, userVote } = todayData;

  if (caseData.status === 'revealed') {
    loadRevealData(caseData.caseId).catch(console.error);
  } else if (userVote) {
    renderVotedView();
    showView('voted');
  } else if (caseData.status === 'open') {
    renderOpenView();
    showView('open');
    if (!hasSeenOnboarding) {
      showOnboarding();
    }
  } else {
    renderClosedView();
    showView('closed');
  }
}

// ─── Onboarding ──────────────────────────────────────────────────────────────

function showOnboarding() {
  hasSeenOnboarding = true;
  const overlay = document.createElement('div');
  overlay.className = 'onboarding-overlay';
  overlay.innerHTML = `
    <div class="onboarding-card">
      <div class="onboarding-icon">⚖️</div>
      <h2 class="onboarding-title">Welcome to Daily Verdict!</h2>
      <div class="onboarding-steps">
        <div class="onboarding-step">
          <span class="onboarding-num">1</span>
          <span>Pick your <strong>verdict</strong> — what's the right call?</span>
        </div>
        <div class="onboarding-step">
          <span class="onboarding-num">2</span>
          <span>Pick your <strong>prediction</strong> — what will the majority say?</span>
        </div>
        <div class="onboarding-step">
          <span class="onboarding-num">3</span>
          <span>Come back for the <strong>reveal</strong> to see your score!</span>
        </div>
      </div>
      <p class="onboarding-tip">Tip: Comment to make your case — you can earn an Influence Bonus!</p>
      <button class="onboarding-btn" id="onboarding-dismiss">Got It</button>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('visible'));

  const dismiss = document.getElementById('onboarding-dismiss');
  dismiss?.addEventListener('click', () => {
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 300);
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.classList.remove('visible');
      setTimeout(() => overlay.remove(), 300);
    }
  });
}

// ─── Closed View (missed voting window) ──────────────────────────────────────

function renderClosedView() {
  if (!todayData) return;
  const { case: caseData } = todayData;

  const el = document.getElementById('closed-title');
  const textEl = document.getElementById('closed-text');

  if (el) el.textContent = caseData.title;
  if (textEl) textEl.textContent = caseData.text;

  startCountdown(caseData.revealTs, 'closed-countdown');
}

// ─── Open View (Vote) ───────────────────────────────────────────────────────

function renderOpenView() {
  if (!todayData) return;
  const { case: caseData } = todayData;

  const dateEl = document.getElementById('open-date');
  const countdownEl = document.getElementById('open-countdown');
  if (dateEl) dateEl.textContent = formatDate(caseData.dateKey);
  if (countdownEl) countdownEl.textContent = formatCountdown(caseData.closeTs);

  const titleEl = document.getElementById('open-title');
  const textEl = document.getElementById('open-text');
  const sourceEl = document.getElementById('open-source');
  if (titleEl) titleEl.textContent = caseData.title;
  if (textEl) textEl.textContent = caseData.text;
  if (sourceEl) {
    if (caseData.source === 'user') {
      sourceEl.textContent = 'Community submitted';
      sourceEl.style.display = 'inline-block';
    } else {
      sourceEl.style.display = 'none';
    }
  }

  // Zero-voter empty state
  const voterEl = document.getElementById('open-voters');
  const voterCount = todayData.aggregate?.voters ?? 0;
  if (voterEl) {
    if (voterCount === 0) {
      voterEl.textContent = 'Be the first to vote!';
      voterEl.classList.add('first-voter');
    } else {
      voterEl.textContent = `${voterCount} vote${voterCount !== 1 ? 's' : ''} so far`;
      voterEl.classList.remove('first-voter');
    }
  }

  // Verdict buttons
  const verdictGrid = document.getElementById('verdict-grid');
  if (verdictGrid) {
    verdictGrid.innerHTML = '';
    caseData.labels.forEach((label, i) => {
      const btn = document.createElement('button');
      btn.className = 'verdict-btn';
      btn.dataset['index'] = String(i);
      btn.textContent = label;
      btn.addEventListener('click', () => selectVerdict(i));
      verdictGrid.appendChild(btn);
    });
  }

  // Prediction buttons
  const predGrid = document.getElementById('prediction-grid');
  if (predGrid) {
    predGrid.innerHTML = '';
    caseData.labels.forEach((label, i) => {
      const btn = document.createElement('button');
      btn.className = 'prediction-btn';
      btn.dataset['index'] = String(i);
      btn.textContent = label;
      btn.addEventListener('click', () => selectPrediction(i));
      predGrid.appendChild(btn);
    });
  }

  startCountdown(caseData.closeTs, 'open-countdown');

  selectedVerdict = -1;
  selectedPrediction = -1;
  updateSubmitButton();
}

function selectVerdict(index: number) {
  selectedVerdict = index;
  document.querySelectorAll('.verdict-btn').forEach((btn) => {
    const isSelected = btn.getAttribute('data-index') === String(index);
    btn.classList.toggle('selected', isSelected);
    if (isSelected) {
      btn.classList.add('just-selected');
      setTimeout(() => btn.classList.remove('just-selected'), 400);
    }
  });
  updateSubmitButton();
}

function selectPrediction(index: number) {
  selectedPrediction = index;
  document.querySelectorAll('.prediction-btn').forEach((btn) => {
    const isSelected = btn.getAttribute('data-index') === String(index);
    btn.classList.toggle('selected', isSelected);
    if (isSelected) {
      btn.classList.add('just-selected');
      setTimeout(() => btn.classList.remove('just-selected'), 400);
    }
  });
  updateSubmitButton();
}

function updateSubmitButton() {
  const btn = document.getElementById('submit-vote-btn') as HTMLButtonElement;
  const text = document.getElementById('submit-vote-text');
  if (!btn || !text) return;

  const ready = selectedVerdict >= 0 && selectedPrediction >= 0;
  btn.disabled = !ready;
  btn.className = ready ? 'submit-btn ready' : 'submit-btn';
  text.textContent = ready ? 'Submit Your Verdict' : 'Pick your verdict and prediction';
}

async function submitVote() {
  if (!todayData || selectedVerdict < 0 || selectedPrediction < 0) return;

  const btn = document.getElementById('submit-vote-btn') as HTMLButtonElement;
  const text = document.getElementById('submit-vote-text');
  if (btn) {
    btn.disabled = true;
    btn.className = 'submit-btn submitting';
  }
  if (text) text.textContent = 'Submitting...';

  try {
    const response = await apiPost<VoteResponse>('/api/vote', {
      caseId: todayData.case.caseId,
      verdictIndex: selectedVerdict,
      predictionIndex: selectedPrediction,
    });

    todayData.userVote = response.vote;

    // Vote confirmation animation
    showVoteConfirmation();

    renderVotedView();
    showView('voted');
    showToast('Vote submitted!', 'success');
  } catch (err) {
    console.error('Vote failed:', err);
    showToast(err instanceof Error ? err.message : 'Failed to submit vote', 'error');
    if (btn) {
      btn.disabled = false;
      btn.className = 'submit-btn ready';
    }
    if (text) text.textContent = 'Submit Your Verdict';
  }
}

// ─── Vote Confirmation Micro-Animation ───────────────────────────────────────

function showVoteConfirmation() {
  const overlay = document.createElement('div');
  overlay.className = 'vote-confirm-overlay';
  overlay.innerHTML = `
    <div class="vote-confirm-circle">
      <svg class="vote-confirm-check" viewBox="0 0 52 52" fill="none">
        <circle cx="26" cy="26" r="24" stroke="#4caf50" stroke-width="3"/>
        <path class="vote-confirm-path" d="M14 27l8 8 16-16" stroke="#4caf50" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('visible'));

  setTimeout(() => {
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 300);
  }, 800);
}

// ─── Voted View (Waiting) ───────────────────────────────────────────────────

function renderVotedView() {
  if (!todayData?.userVote || !todayData.case) return;
  const { case: caseData, userVote } = todayData;

  const verdictEl = document.getElementById('voted-verdict');
  const predEl = document.getElementById('voted-prediction');
  if (verdictEl) verdictEl.textContent = caseData.labels[userVote.verdictIndex] ?? '';
  if (predEl) predEl.textContent = caseData.labels[userVote.predictionIndex] ?? '';

  startCountdown(caseData.revealTs, 'voted-countdown');

  const commentBtn = document.getElementById('btn-commented') as HTMLButtonElement;
  if (commentBtn) {
    if (userVote.firstCommentTs) {
      commentBtn.className = 'comment-btn done';
      commentBtn.textContent = 'Comment Recorded ✓';
      commentBtn.disabled = true;
    }
  }
}

// ─── Reveal View ────────────────────────────────────────────────────────────

async function loadRevealData(caseId: string) {
  showView('loading');

  try {
    revealData = await apiGet<RevealResponse>(`/api/reveal?caseId=${caseId}`);
    renderRevealView();
    showView('revealed');
  } catch (err) {
    console.error('Reveal load failed:', err);
    if (todayData) {
      showToast('You didn\'t vote on this case', '');
      renderOpenView();
      showView('open');
    } else {
      showView('error');
    }
  }
}

function renderRevealView() {
  if (!revealData) return;

  const { case: caseData, aggregate, majorityIndex, majorityLabel, percentages, score, streak, leaderboard } = revealData;

  // Zero voters edge case
  if (aggregate.voters === 0) {
    const stampEl = document.getElementById('verdict-stamp');
    if (stampEl) {
      stampEl.innerHTML = `
        <div class="empty-reveal">
          <div class="empty-reveal-icon">🗳️</div>
          <h3 class="empty-reveal-title">No Votes Yet</h3>
          <p class="empty-reveal-text">Nobody voted on this case. Check back for the next one!</p>
        </div>
      `;
    }
    return;
  }

  // Verdict Stamp
  const stampEl = document.getElementById('verdict-stamp');
  const stampLabel = document.getElementById('stamp-label');
  const stampVoters = document.getElementById('stamp-voters');
  if (stampEl) stampEl.dataset['majority'] = String(majorityIndex);
  if (stampLabel) stampLabel.textContent = majorityLabel.toUpperCase();
  if (stampVoters) stampVoters.textContent = `${aggregate.voters} voter${aggregate.voters !== 1 ? 's' : ''}`;

  // Results Chart
  const chartEl = document.getElementById('results-chart');
  if (chartEl) {
    chartEl.innerHTML = '';

    caseData.labels.forEach((label, i) => {
      const row = document.createElement('div');
      row.className = 'result-bar-row';
      if (i === majorityIndex) row.classList.add('majority');
      if (todayData?.userVote?.verdictIndex === i) row.classList.add('user-pick');

      row.innerHTML = `
        <div class="result-bar-header">
          <span class="result-bar-label">${label}</span>
          <span class="result-bar-pct">${percentages[i]}%</span>
        </div>
        <div class="result-bar-track">
          <div class="result-bar-fill" data-index="${i}" style="width: 0%">
            <span class="result-bar-count">${aggregate.counts[i]}</span>
          </div>
        </div>
      `;

      chartEl.appendChild(row);

      requestAnimationFrame(() => {
        setTimeout(() => {
          const fill = row.querySelector('.result-bar-fill') as HTMLDivElement;
          if (fill) fill.style.width = `${Math.max(percentages[i]!, 3)}%`;
        }, i * 150);
      });
    });
  }

  // Score Breakdown
  renderScoreBreakdown(score);

  // Streak
  const streakCount = document.getElementById('streak-count');
  const streakBest = document.getElementById('streak-best');
  if (streakCount) streakCount.textContent = String(streak.current);
  if (streakBest) streakBest.textContent = String(streak.best);

  // Leaderboard
  renderLeaderboard(leaderboard);
}

function renderScoreBreakdown(score: ScoreBreakdown) {
  const totalEl = document.getElementById('score-total');
  const breakdownEl = document.getElementById('score-breakdown');

  if (totalEl) {
    animateCountUp(totalEl, score.total, 1000);
  }

  if (breakdownEl) {
    breakdownEl.innerHTML = '';

    const rows = [
      { label: 'Prediction Match', value: score.predictionMatch, max: 60 },
      { label: 'Verdict Match', value: score.verdictMatch, max: 30 },
      { label: 'Timing Bonus', value: score.timingBonus, max: 20 },
      { label: 'Influence Bonus', value: score.influenceBonus, max: 15 },
      { label: 'Streak Bonus', value: score.streakBonus, max: 10 },
      { label: 'Mini-Game Bonus', value: score.miniGameBonus ?? 0, max: 10 },
    ];

    for (const row of rows) {
      const div = document.createElement('div');
      div.className = 'score-row';
      div.innerHTML = `
        <span class="score-row-label">${row.label}</span>
        <span class="score-row-value ${row.value > 0 ? 'positive' : 'zero'}">
          ${row.value > 0 ? '+' : ''}${row.value}/${row.max}
        </span>
      `;
      breakdownEl.appendChild(div);
    }
  }
}

function renderLeaderboard(lb: { top: Array<{ rank: number; username: string; score: number; userId: string }>; me: { rank: number; username: string; score: number; userId: string } | null; totalPlayers: number }) {
  const listEl = document.getElementById('lb-list');
  const meEl = document.getElementById('lb-me');

  if (listEl) {
    listEl.innerHTML = '';

    if (lb.top.length === 0) {
      listEl.innerHTML = '<p class="lb-empty">No leaderboard data yet.</p>';
      return;
    }

    for (const entry of lb.top) {
      const row = document.createElement('div');
      row.className = `lb-row ${entry.rank <= 3 ? 'top-3' : ''} ${entry.userId === todayData?.userId ? 'is-me' : ''}`;
      row.innerHTML = `
        <span class="lb-rank">${entry.rank}</span>
        <span class="lb-name">${escapeHtml(entry.username)}</span>
        <span class="lb-score">${entry.score}</span>
      `;
      listEl.appendChild(row);
    }
  }

  if (meEl && lb.me && lb.me.rank > lb.top.length) {
    meEl.innerHTML = `
      <div class="lb-row is-me">
        <span class="lb-rank">${lb.me.rank}</span>
        <span class="lb-name">${escapeHtml(lb.me.username)}</span>
        <span class="lb-score">${lb.me.score}</span>
      </div>
    `;
  } else if (meEl) {
    meEl.innerHTML = '';
  }
}

// ─── Share Your Score ────────────────────────────────────────────────────────

function generateShareCard(): HTMLCanvasElement | null {
  if (!revealData) return null;

  const canvas = document.getElementById('share-canvas') as HTMLCanvasElement;
  if (!canvas) return null;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const W = 600;
  const H = 400;
  canvas.width = W;
  canvas.height = H;

  // Background
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0a0a18');
  bg.addColorStop(1, '#141428');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Top accent line
  const accent = ctx.createLinearGradient(0, 0, W, 0);
  accent.addColorStop(0, 'transparent');
  accent.addColorStop(0.3, '#ff4500');
  accent.addColorStop(0.7, '#f0c040');
  accent.addColorStop(1, 'transparent');
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, W, 3);

  // Title
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 28px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Daily Verdict', W / 2, 45);

  // Stamp
  const stampColor = ['#4caf50', '#f44336', '#ff9800', '#2196f3'][revealData.majorityIndex] ?? '#f44336';
  ctx.strokeStyle = stampColor;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(W / 2, 115, 45, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = stampColor;
  ctx.font = '900 14px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(revealData.majorityLabel.toUpperCase(), W / 2, 115);

  // Score
  ctx.fillStyle = '#f0c040';
  ctx.font = '900 64px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(String(revealData.score.total), W / 2, 230);

  ctx.fillStyle = '#6b7280';
  ctx.font = '700 12px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('POINTS', W / 2, 248);

  // Breakdown
  const parts: string[] = [];
  if (revealData.score.predictionMatch > 0) parts.push(`Prediction +${revealData.score.predictionMatch}`);
  if (revealData.score.verdictMatch > 0) parts.push(`Verdict +${revealData.score.verdictMatch}`);
  if (revealData.score.timingBonus > 0) parts.push(`Timing +${revealData.score.timingBonus}`);
  if (revealData.score.influenceBonus > 0) parts.push(`Influence +${revealData.score.influenceBonus}`);
  if (revealData.score.streakBonus > 0) parts.push(`Streak +${revealData.score.streakBonus}`);
  if ((revealData.score as ScoreBreakdown & { miniGameBonus?: number }).miniGameBonus) parts.push(`Mini-Game +${(revealData.score as ScoreBreakdown & { miniGameBonus?: number }).miniGameBonus}`);

  ctx.fillStyle = '#8a8f98';
  ctx.font = '500 13px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(parts.join(' · ') || 'No points earned', W / 2, 275);

  // Streak
  if (revealData.streak.current > 0) {
    ctx.fillStyle = '#ff9800';
    ctx.font = '700 18px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(`🔥 ${revealData.streak.current} round streak`, W / 2, 310);
  }

  // Distribution bars (compact)
  const barY = 330;
  const barH = 18;
  const barW = 400;
  const barX = (W - barW) / 2;
  const maxPct = Math.max(...revealData.percentages, 1);
  const barColors = ['#4caf50', '#f44336', '#ff9800', '#2196f3'];

  revealData.case.labels.forEach((label, i) => {
    const y = barY + i * (barH + 2);
    const fillW = (revealData!.percentages[i]! / maxPct) * barW * 0.7;

    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(barX, y, barW, barH);

    ctx.fillStyle = barColors[i]!;
    ctx.fillRect(barX, y, Math.max(fillW, 2), barH);

    ctx.fillStyle = '#ffffff';
    ctx.font = '600 10px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${label} ${revealData!.percentages[i]}%`, barX + fillW + 6, y + barH / 2 + 4);
  });

  ctx.textAlign = 'center';

  return canvas;
}

async function shareScore() {
  if (!revealData) return;

  const canvas = generateShareCard();

  // Build text score
  const lines = [
    `⚖️ Daily Verdict Score: ${revealData.score.total} points`,
    `Verdict: ${revealData.majorityLabel}`,
  ];

  const parts: string[] = [];
  if (revealData.score.predictionMatch > 0) parts.push(`Prediction +${revealData.score.predictionMatch}`);
  if (revealData.score.verdictMatch > 0) parts.push(`Verdict +${revealData.score.verdictMatch}`);
  if (revealData.score.timingBonus > 0) parts.push(`Timing +${revealData.score.timingBonus}`);
  if (revealData.score.influenceBonus > 0) parts.push(`Influence +${revealData.score.influenceBonus}`);
  if (revealData.score.streakBonus > 0) parts.push(`Streak +${revealData.score.streakBonus}`);
  if ((revealData.score as ScoreBreakdown & { miniGameBonus?: number }).miniGameBonus) parts.push(`Mini-Game +${(revealData.score as ScoreBreakdown & { miniGameBonus?: number }).miniGameBonus}`);

  if (parts.length > 0) lines.push(parts.join(' · '));
  if (revealData.streak.current > 0) lines.push(`🔥 ${revealData.streak.current} round streak`);

  const text = lines.join('\n');

  try {
    // Try native share first
    if (navigator.share && canvas) {
      canvas.toBlob(async (blob) => {
        if (!blob) {
          await copyToClipboard(text);
          return;
        }
        try {
          const file = new File([blob], 'daily-verdict-score.png', { type: 'image/png' });
          await navigator.share({ text, files: [file] });
          showToast('Shared!', 'success');
        } catch {
          await copyToClipboard(text);
        }
      });
    } else {
      await copyToClipboard(text);
    }
  } catch {
    await copyToClipboard(text);
  }
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('Score copied to clipboard!', 'success');
  } catch {
    showToast('Could not copy to clipboard', 'error');
  }
}

// ─── Archive View ───────────────────────────────────────────────────────────

let archiveEntries: ArchiveEntry[] = [];

async function loadArchive() {
  showView('archive');
  const listEl = document.getElementById('archive-list');
  if (!listEl) return;
  listEl.innerHTML = '<p class="loading-text" style="padding:24px;text-align:center">Loading past cases...</p>';

  try {
    const data = await apiGet<{ entries: ArchiveEntry[] }>('/api/archive?days=7');
    archiveEntries = data.entries;

    if (data.entries.length === 0) {
      listEl.innerHTML = `
        <div class="archive-empty">
          <div class="empty-state-icon">📋</div>
          <p class="empty-state-title">No past cases yet</p>
          <p class="empty-state-text">Check back after the next round!</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = '';
    for (let idx = 0; idx < data.entries.length; idx++) {
      const entry = data.entries[idx]!;
      const item = document.createElement('div');
      item.className = 'archive-item';
      item.dataset['archiveIdx'] = String(idx);
      item.innerHTML = `
        <div class="archive-item-date">${formatDate(entry.case.dateKey)}</div>
        <div class="archive-item-title">${escapeHtml(entry.case.title)}</div>
        <div class="archive-item-result">
          <span class="archive-item-verdict" data-index="${entry.majorityIndex}">${escapeHtml(entry.majorityLabel)}</span>
          ${entry.userScore ? `<span class="archive-item-score">Your score: <strong>${entry.userScore.total}</strong></span>` : '<span class="archive-item-score">Not voted</span>'}
        </div>
        <div class="archive-item-arrow">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M7 4l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
      `;
      item.addEventListener('click', () => showArchiveDetail(idx));
      listEl.appendChild(item);
    }
  } catch {
    listEl.innerHTML = `
      <div class="archive-empty">
        <div class="empty-state-icon">⚠️</div>
        <p class="empty-state-title">Failed to load</p>
        <p class="empty-state-text">Could not load the archive.</p>
      </div>
    `;
  }
}

// ─── Archive Detail View ─────────────────────────────────────────────────────

function showArchiveDetail(idx: number) {
  const entry = archiveEntries[idx];
  if (!entry) return;

  showView('archive-detail');

  const contentEl = document.getElementById('archive-detail-content');
  if (!contentEl) return;

  const { case: caseData, majorityIndex, majorityLabel, aggregate, userScore } = entry;
  const labels = caseData.labels;
  const total = aggregate.voters || 1;
  const percentages = aggregate.counts.map((c) => Math.round((c / total) * 100)) as [number, number, number, number];

  let html = `
    <div class="case-card" style="margin:16px">
      <div class="case-header">
        <span class="case-date">${formatDate(caseData.dateKey)}</span>
        <span class="case-status-badge">Revealed</span>
      </div>
      <h2 class="case-title">${escapeHtml(caseData.title)}</h2>
      <p class="case-text">${escapeHtml(caseData.text)}</p>
    </div>

    <div class="verdict-stamp" data-majority="${majorityIndex}" style="padding-top:20px">
      <div class="stamp-ring">
        <div class="stamp-label">${escapeHtml(majorityLabel.toUpperCase())}</div>
      </div>
      <p class="stamp-voters">${aggregate.voters} voter${aggregate.voters !== 1 ? 's' : ''}</p>
    </div>

    <div class="results-chart" style="padding:16px">
  `;

  labels.forEach((label, i) => {
    const isMaj = i === majorityIndex;
    html += `
      <div class="result-bar-row ${isMaj ? 'majority' : ''}">
        <div class="result-bar-header">
          <span class="result-bar-label">${escapeHtml(label)}</span>
          <span class="result-bar-pct">${percentages[i]}%</span>
        </div>
        <div class="result-bar-track">
          <div class="result-bar-fill" data-index="${i}" style="width: ${Math.max(percentages[i]!, 3)}%">
            <span class="result-bar-count">${aggregate.counts[i]}</span>
          </div>
        </div>
      </div>
    `;
  });

  html += `</div>`;

  if (userScore) {
    html += `
      <div class="score-card" style="margin:16px;animation:none">
        <h3 class="score-title">Your Score</h3>
        <div class="score-total">${userScore.total}</div>
        <div class="score-breakdown">
          <div class="score-row"><span class="score-row-label">Prediction</span><span class="score-row-value ${userScore.predictionMatch > 0 ? 'positive' : 'zero'}">+${userScore.predictionMatch}/60</span></div>
          <div class="score-row"><span class="score-row-label">Verdict</span><span class="score-row-value ${userScore.verdictMatch > 0 ? 'positive' : 'zero'}">+${userScore.verdictMatch}/30</span></div>
          <div class="score-row"><span class="score-row-label">Timing</span><span class="score-row-value ${userScore.timingBonus > 0 ? 'positive' : 'zero'}">+${userScore.timingBonus}/20</span></div>
          <div class="score-row"><span class="score-row-label">Influence</span><span class="score-row-value ${userScore.influenceBonus > 0 ? 'positive' : 'zero'}">+${userScore.influenceBonus}/15</span></div>
          <div class="score-row"><span class="score-row-label">Streak</span><span class="score-row-value ${userScore.streakBonus > 0 ? 'positive' : 'zero'}">+${userScore.streakBonus}/10</span></div>
          <div class="score-row"><span class="score-row-label">Mini-Game</span><span class="score-row-value ${(userScore as ScoreBreakdown & { miniGameBonus?: number }).miniGameBonus ? 'positive' : 'zero'}">+${(userScore as ScoreBreakdown & { miniGameBonus?: number }).miniGameBonus ?? 0}/10</span></div>
        </div>
      </div>
    `;
  } else {
    html += `
      <div class="archive-empty" style="padding:24px">
        <p>You didn't vote on this case.</p>
      </div>
    `;
  }

  contentEl.innerHTML = html;
}

// ─── Submit Case View ───────────────────────────────────────────────────────

function initSubmitView() {
  showView('submit');

  const textArea = document.getElementById('submit-text') as HTMLTextAreaElement;
  const charCount = document.getElementById('char-count') as HTMLSpanElement;
  const agreeCheckbox = document.getElementById('submit-agree') as HTMLInputElement;
  const submitBtn = document.getElementById('submit-case-btn') as HTMLButtonElement;

  function updateSubmitState() {
    const text = textArea.value.trim();
    charCount.textContent = String(text.length);
    const ready = text.length >= 30 && text.length <= 600 && agreeCheckbox.checked;
    submitBtn.disabled = !ready;
    submitBtn.className = ready ? 'submit-case-btn ready' : 'submit-case-btn';
  }

  if (!submitListenersAttached) {
    textArea.addEventListener('input', updateSubmitState);
    agreeCheckbox.addEventListener('change', updateSubmitState);
    submitListenersAttached = true;
  }

  textArea.value = '';
  if (charCount) charCount.textContent = '0';
  agreeCheckbox.checked = false;

  updateSubmitState();
}

async function submitCase() {
  const titleInput = document.getElementById('submit-title') as HTMLInputElement;
  const textArea = document.getElementById('submit-text') as HTMLTextAreaElement;
  const submitBtn = document.getElementById('submit-case-btn') as HTMLButtonElement;

  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting...';

  try {
    await apiPost('/api/submit-case', {
      text: textArea.value.trim(),
      title: titleInput.value.trim() || undefined,
    });

    showToast('Case submitted for review!', 'success');
    titleInput.value = '';
    textArea.value = '';

    goBack();
  } catch (err) {
    showToast(err instanceof Error ? err.message : 'Failed to submit', 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit for Review';
    submitBtn.className = 'submit-case-btn ready';
  }
}

// ─── Mod Queue View ─────────────────────────────────────────────────────────

async function loadModQueue() {
  showView('mod');
  const listEl = document.getElementById('mod-list');
  if (!listEl) return;
  listEl.innerHTML = '<p class="loading-text" style="padding:24px;text-align:center">Loading submissions...</p>';

  try {
    const data = await apiGet<{ submissions: CaseSubmission[] }>('/api/mod/pending');

    if (data.submissions.length === 0) {
      listEl.innerHTML = `
        <div class="archive-empty">
          <div class="empty-state-icon">✅</div>
          <p class="empty-state-title">Queue clear!</p>
          <p class="empty-state-text">No pending submissions.</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = '';
    for (const sub of data.submissions) {
      const item = document.createElement('div');
      item.className = 'mod-item';
      item.innerHTML = `
        <div class="mod-item-header">
          <span class="mod-item-user">by u/${escapeHtml(sub.username)}</span>
          <span class="mod-item-date">${new Date(sub.submittedAt).toLocaleDateString()}</span>
        </div>
        ${sub.title ? `<div style="font-weight:700;margin-bottom:6px;color:#f0c040">${escapeHtml(sub.title)}</div>` : ''}
        <div class="mod-item-text">${escapeHtml(sub.text)}</div>
        <input type="date" class="mod-date-input" data-sub-id="${sub.submissionId}" placeholder="Assign date" />
        <div class="mod-actions" style="margin-top:8px">
          <button class="mod-approve-btn" data-sub-id="${sub.submissionId}">Approve</button>
          <button class="mod-reject-btn" data-sub-id="${sub.submissionId}">Reject</button>
        </div>
      `;
      listEl.appendChild(item);
    }

    // Approve buttons
    listEl.querySelectorAll('.mod-approve-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const subId = (btn as HTMLButtonElement).dataset['subId']!;
        const dateInput = listEl.querySelector(`input[data-sub-id="${subId}"]`) as HTMLInputElement;
        const dateVal = dateInput?.value;
        if (!dateVal) {
          showToast('Please select a date', 'error');
          return;
        }
        const dateKey = dateVal.replace(/-/g, '');
        try {
          await apiPost('/api/mod/approve', { submissionId: subId, dateKey });
          showToast('Submission approved!', 'success');
          await loadModQueue();
        } catch {
          showToast('Failed to approve', 'error');
        }
      });
    });

    // Reject buttons - using custom modal instead of prompt()
    listEl.querySelectorAll('.mod-reject-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const subId = (btn as HTMLButtonElement).dataset['subId']!;

        const reason = await showModal({
          title: 'Reject Submission',
          message: 'Please provide a reason for rejecting this submission.',
          inputPlaceholder: 'Rejection reason...',
          confirmLabel: 'Reject',
          cancelLabel: 'Cancel',
        });

        if (!reason) return;

        try {
          await apiPost('/api/mod/reject', { submissionId: subId, reason });
          showToast('Submission rejected', '');
          await loadModQueue();
        } catch {
          showToast('Failed to reject', 'error');
        }
      });
    });
  } catch {
    listEl.innerHTML = `
      <div class="archive-empty">
        <div class="empty-state-icon">⚠️</div>
        <p class="empty-state-title">Failed to load</p>
        <p class="empty-state-text">Could not load the mod queue.</p>
      </div>
    `;
  }
}

// ─── Navigation ──────────────────────────────────────────────────────────────

function goBack() {
  if (currentView === 'archive-detail') {
    loadArchive().catch(console.error);
    return;
  }
  if (currentView === 'minigame') {
    stopMinigame();
    if (todayData) {
      determineInitialView();
    } else {
      showView('loading');
      init().catch(console.error);
    }
    return;
  }
  if (todayData) {
    determineInitialView();
  } else {
    showView('loading');
    init().catch(console.error);
  }
}

// ─── Countdown Timer ─────────────────────────────────────────────────────────

function startCountdown(targetTs: number, elementId: string) {
  if (countdownTimer) clearInterval(countdownTimer);

  function update() {
    const el = document.getElementById(elementId);
    if (!el) return;
    const diff = targetTs - Date.now();

    if (diff <= 0) {
      el.textContent = 'Now!';
      el.className = (el.className || '').replace(/urgency-\w+/g, '').trim();
      if (countdownTimer) clearInterval(countdownTimer);
      setTimeout(() => {
        init().catch(console.error);
      }, 2000);
      return;
    }

    el.textContent = formatCountdown(targetTs);

    // Apply urgency colors
    const urgency = getCountdownUrgency(targetTs);
    el.className = (el.className || '').replace(/urgency-\w+/g, '').trim() + ' ' + urgency;
  }

  update();
  countdownTimer = setInterval(update, 1000);
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function animateCountUp(el: HTMLElement, target: number, duration: number) {
  const start = performance.now();

  function frame(now: number) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = String(Math.round(target * eased));
    if (progress < 1) requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ─── Weekly Leaderboard ──────────────────────────────────────────────────────

async function loadWeeklyLeaderboard() {
  const weeklyList = document.getElementById('lb-weekly-list');
  if (!weeklyList) return;

  weeklyList.innerHTML = '<p class="loading-text" style="padding:12px;text-align:center;font-size:13px;color:#6b7280">Loading...</p>';

  try {
    const data = await apiGet<{ top: Array<{ rank: number; username: string; score: number; userId: string }>; me: { rank: number; username: string; score: number; userId: string } | null }>('/api/leaderboard/weekly');

    weeklyList.innerHTML = '';
    if (data.top.length === 0) {
      weeklyList.innerHTML = '<p class="lb-empty">No weekly scores yet.</p>';
      return;
    }

    for (const entry of data.top) {
      const row = document.createElement('div');
      row.className = `lb-row ${entry.rank <= 3 ? 'top-3' : ''} ${entry.userId === todayData?.userId ? 'is-me' : ''}`;
      row.innerHTML = `
        <span class="lb-rank">${entry.rank}</span>
        <span class="lb-name">${escapeHtml(entry.username)}</span>
        <span class="lb-score">${entry.score}</span>
      `;
      weeklyList.appendChild(row);
    }
  } catch {
    weeklyList.innerHTML = '<p class="lb-empty">Failed to load weekly leaderboard.</p>';
  }
}

function setupLeaderboardTabs() {
  const dailyTab = document.getElementById('lb-tab-daily');
  const weeklyTab = document.getElementById('lb-tab-weekly');
  const dailyList = document.getElementById('lb-list');
  const weeklyList = document.getElementById('lb-weekly-list');
  const meEl = document.getElementById('lb-me');

  dailyTab?.addEventListener('click', () => {
    dailyTab.classList.add('active');
    weeklyTab?.classList.remove('active');
    dailyList?.classList.remove('hidden');
    meEl?.classList.remove('hidden');
    weeklyList?.classList.add('hidden');
  });

  weeklyTab?.addEventListener('click', () => {
    weeklyTab.classList.add('active');
    dailyTab?.classList.remove('active');
    weeklyList?.classList.remove('hidden');
    dailyList?.classList.add('hidden');
    meEl?.classList.add('hidden');
    loadWeeklyLeaderboard().catch(console.error);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// GAVEL DROP MINI-GAME
// Paratrooper-style: catch matching verdicts, dodge wrong ones, collect golden gavels
// ═══════════════════════════════════════════════════════════════════════════════

interface MiniGameItem {
  x: number;
  y: number;
  w: number;
  h: number;
  speed: number;
  type: 'match' | 'wrong' | 'gavel' | 'hazard';
  label: string;
  color: string;
  rotation: number;
  rotSpeed: number;
}

interface MiniGameState {
  running: boolean;
  score: number;
  lives: number;
  maxLives: number;
  catcherX: number;
  catcherW: number;
  items: MiniGameItem[];
  spawnTimer: number;
  spawnInterval: number;
  elapsed: number;
  animId: number | null;
  lastTs: number;
  labels: string[];
  userVerdictIndex: number;
  caseId: string;
  bestScore: number;
  moveLeft: boolean;
  moveRight: boolean;
  touchActive: boolean;
}

let mgState: MiniGameState | null = null;

const MG_COLORS = ['#4caf50', '#f44336', '#ff9800', '#2196f3'];
const MG_CATCHER_H = 16;
const MG_CATCHER_SPEED = 320; // px/s
const MG_ITEM_W = 70;
const MG_ITEM_H = 32;

function startMinigame() {
  if (!todayData) return;

  const labels = todayData.case.labels;
  const userVerdictIndex = todayData.userVote?.verdictIndex ?? 0;
  const caseId = todayData.case.caseId;

  showView('minigame');

  const canvas = document.getElementById('mg-canvas') as HTMLCanvasElement;
  const container = document.getElementById('mg-container') as HTMLDivElement;
  if (!canvas || !container) return;

  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight - 48; // leave room for top bar

  // Show start overlay, hide gameover
  const startEl = document.getElementById('mg-start');
  const gameoverEl = document.getElementById('mg-gameover');
  if (startEl) startEl.classList.remove('hidden');
  if (gameoverEl) gameoverEl.classList.add('hidden');

  mgState = {
    running: false,
    score: 0,
    lives: 3,
    maxLives: 3,
    catcherX: canvas.width / 2 - 40,
    catcherW: 80,
    items: [],
    spawnTimer: 0,
    spawnInterval: 1.2,
    elapsed: 0,
    animId: null,
    lastTs: 0,
    labels: [...labels],
    userVerdictIndex,
    caseId,
    bestScore: 0,
    moveLeft: false,
    moveRight: false,
    touchActive: false,
  };

  updateMGHud();
}

function beginMinigameLoop() {
  if (!mgState) return;
  mgState.running = true;
  mgState.lastTs = performance.now();

  const startEl = document.getElementById('mg-start');
  if (startEl) startEl.classList.add('hidden');

  function loop(ts: number) {
    if (!mgState || !mgState.running) return;
    const dt = Math.min((ts - mgState.lastTs) / 1000, 0.05);
    mgState.lastTs = ts;
    mgState.elapsed += dt;

    updateMinigame(dt);
    drawMinigame();

    mgState.animId = requestAnimationFrame(loop);
  }

  mgState.animId = requestAnimationFrame(loop);
}

function stopMinigame() {
  if (mgState?.animId) {
    cancelAnimationFrame(mgState.animId);
    mgState.animId = null;
  }
  if (mgState) mgState.running = false;
}

function updateMinigame(dt: number) {
  if (!mgState) return;
  const canvas = document.getElementById('mg-canvas') as HTMLCanvasElement;
  if (!canvas) return;

  const W = canvas.width;

  // Move catcher
  if (mgState.moveLeft) {
    mgState.catcherX -= MG_CATCHER_SPEED * dt;
  }
  if (mgState.moveRight) {
    mgState.catcherX += MG_CATCHER_SPEED * dt;
  }
  mgState.catcherX = Math.max(0, Math.min(W - mgState.catcherW, mgState.catcherX));

  // Spawn items
  mgState.spawnTimer -= dt;
  if (mgState.spawnTimer <= 0) {
    spawnMGItem(W);
    // Speed up over time
    mgState.spawnInterval = Math.max(0.4, 1.2 - mgState.elapsed * 0.01);
    mgState.spawnTimer = mgState.spawnInterval;
  }

  // Update items
  const catcherTop = canvas.height - MG_CATCHER_H - 8;
  const catcherLeft = mgState.catcherX;
  const catcherRight = mgState.catcherX + mgState.catcherW;

  const newItems: MiniGameItem[] = [];
  for (const item of mgState.items) {
    item.y += item.speed * dt;
    item.rotation += item.rotSpeed * dt;

    // Check if caught by catcher
    const itemCenterX = item.x + item.w / 2;
    const itemBottom = item.y + item.h;

    if (itemBottom >= catcherTop && item.y <= catcherTop + MG_CATCHER_H + 4) {
      if (itemCenterX >= catcherLeft && itemCenterX <= catcherRight) {
        // Caught!
        handleMGCatch(item);
        continue; // remove item
      }
    }

    // Remove if off screen
    if (item.y > canvas.height + 20) {
      continue;
    }

    newItems.push(item);
  }

  mgState.items = newItems;

  // Check game over
  if (mgState.lives <= 0) {
    endMinigame();
  }
}

function spawnMGItem(canvasW: number) {
  if (!mgState) return;

  const rand = Math.random();
  let type: MiniGameItem['type'];
  let label: string;
  let color: string;

  if (rand < 0.15) {
    // Golden gavel
    type = 'gavel';
    label = '🔨';
    color = '#f0c040';
  } else if (rand < 0.25) {
    // Hazard
    type = 'hazard';
    label = '✕';
    color = '#f44336';
  } else if (rand < 0.55) {
    // Matching verdict
    type = 'match';
    label = mgState.labels[mgState.userVerdictIndex] ?? 'Match';
    color = MG_COLORS[mgState.userVerdictIndex] ?? '#4caf50';
  } else {
    // Wrong verdict
    const wrongIdx = (mgState.userVerdictIndex + 1 + Math.floor(Math.random() * 3)) % 4;
    type = 'wrong';
    label = mgState.labels[wrongIdx] ?? 'Wrong';
    color = MG_COLORS[wrongIdx] ?? '#f44336';
  }

  const speed = 100 + mgState.elapsed * 2 + Math.random() * 60;

  mgState.items.push({
    x: Math.random() * (canvasW - MG_ITEM_W),
    y: -MG_ITEM_H - Math.random() * 30,
    w: MG_ITEM_W,
    h: MG_ITEM_H,
    speed,
    type,
    label,
    color,
    rotation: 0,
    rotSpeed: (Math.random() - 0.5) * 2,
  });
}

function handleMGCatch(item: MiniGameItem) {
  if (!mgState) return;

  switch (item.type) {
    case 'match':
      mgState.score += 10;
      break;
    case 'gavel':
      mgState.score += 25;
      break;
    case 'wrong':
      mgState.lives--;
      break;
    case 'hazard':
      mgState.lives--;
      break;
  }

  updateMGHud();
}

function updateMGHud() {
  if (!mgState) return;
  const scoreEl = document.getElementById('mg-hud-score');
  const livesEl = document.getElementById('mg-hud-lives');
  if (scoreEl) scoreEl.textContent = String(mgState.score);
  if (livesEl) {
    livesEl.textContent = '❤️'.repeat(Math.max(0, mgState.lives)) + '🖤'.repeat(Math.max(0, mgState.maxLives - mgState.lives));
  }
}

function drawMinigame() {
  if (!mgState) return;
  const canvas = document.getElementById('mg-canvas') as HTMLCanvasElement;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = canvas.width;
  const H = canvas.height;

  // Background
  ctx.fillStyle = '#0a0a18';
  ctx.fillRect(0, 0, W, H);

  // Subtle grid
  ctx.strokeStyle = 'rgba(255,255,255,0.02)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }

  // Draw items
  for (const item of mgState.items) {
    ctx.save();
    ctx.translate(item.x + item.w / 2, item.y + item.h / 2);
    ctx.rotate(item.rotation * 0.1);

    if (item.type === 'gavel') {
      // Golden gavel — special item
      ctx.fillStyle = 'rgba(240, 192, 64, 0.15)';
      ctx.beginPath();
      ctx.roundRect(-item.w / 2, -item.h / 2, item.w, item.h, 8);
      ctx.fill();
      ctx.strokeStyle = '#f0c040';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#f0c040';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🔨', 0, 0);
    } else if (item.type === 'hazard') {
      // Red X hazard
      ctx.fillStyle = 'rgba(244, 67, 54, 0.1)';
      ctx.beginPath();
      ctx.roundRect(-item.w / 2, -item.h / 2, item.w, item.h, 8);
      ctx.fill();
      ctx.strokeStyle = 'rgba(244, 67, 54, 0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.strokeStyle = '#f44336';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-10, -10);
      ctx.lineTo(10, 10);
      ctx.moveTo(10, -10);
      ctx.lineTo(-10, 10);
      ctx.stroke();
    } else {
      // Verdict stamp
      const bgAlpha = item.type === 'match' ? 0.2 : 0.1;
      ctx.fillStyle = item.color + Math.round(bgAlpha * 255).toString(16).padStart(2, '0');
      ctx.beginPath();
      ctx.roundRect(-item.w / 2, -item.h / 2, item.w, item.h, 8);
      ctx.fill();
      ctx.strokeStyle = item.color;
      ctx.lineWidth = item.type === 'match' ? 2 : 1;
      ctx.stroke();

      ctx.fillStyle = item.color;
      ctx.font = `bold ${item.label.length > 10 ? 9 : 11}px -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.label, 0, 0);
    }

    ctx.restore();
  }

  // Draw catcher (platform)
  const catcherY = H - MG_CATCHER_H - 8;
  const grad = ctx.createLinearGradient(mgState.catcherX, catcherY, mgState.catcherX, catcherY + MG_CATCHER_H);
  grad.addColorStop(0, '#f0c040');
  grad.addColorStop(1, '#d4a017');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(mgState.catcherX, catcherY, mgState.catcherW, MG_CATCHER_H, 6);
  ctx.fill();

  // Catcher highlight
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.beginPath();
  ctx.roundRect(mgState.catcherX + 4, catcherY + 2, mgState.catcherW - 8, 4, 2);
  ctx.fill();

  // Floor line
  ctx.strokeStyle = 'rgba(240, 192, 64, 0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, H - 4);
  ctx.lineTo(W, H - 4);
  ctx.stroke();
}

async function endMinigame() {
  if (!mgState) return;
  mgState.running = false;
  if (mgState.animId) {
    cancelAnimationFrame(mgState.animId);
    mgState.animId = null;
  }

  const score = mgState.score;

  // Post score
  try {
    const result = await apiPost<{ success: boolean; bestScore: number }>('/api/minigame-score', {
      caseId: mgState.caseId,
      score,
    });
    mgState.bestScore = result.bestScore;
  } catch {
    mgState.bestScore = score;
  }

  // Show game over overlay
  const gameoverEl = document.getElementById('mg-gameover');
  const scoreEl = document.getElementById('mg-gameover-score');
  const bestEl = document.getElementById('mg-gameover-best');
  if (gameoverEl) gameoverEl.classList.remove('hidden');
  if (scoreEl) scoreEl.textContent = String(score);
  if (bestEl) bestEl.textContent = `Best: ${mgState.bestScore}`;
}

function retryMinigame() {
  const gameoverEl = document.getElementById('mg-gameover');
  if (gameoverEl) gameoverEl.classList.add('hidden');
  startMinigame();
  beginMinigameLoop();
}

function setupMinigameControls() {
  const canvas = document.getElementById('mg-canvas') as HTMLCanvasElement;
  if (!canvas) return;

  // Touch controls: left half = move left, right half = move right
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (!mgState || !mgState.running) return;
    const rect = canvas.getBoundingClientRect();
    for (let i = 0; i < e.touches.length; i++) {
      const touch = e.touches[i]!;
      const x = touch.clientX - rect.left;
      if (x < rect.width / 2) {
        mgState.moveLeft = true;
      } else {
        mgState.moveRight = true;
      }
    }
    mgState.touchActive = true;
  }, { passive: false });

  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    if (!mgState) return;
    mgState.moveLeft = false;
    mgState.moveRight = false;
    // Check remaining touches
    const rect = canvas.getBoundingClientRect();
    for (let i = 0; i < e.touches.length; i++) {
      const touch = e.touches[i]!;
      const x = touch.clientX - rect.left;
      if (x < rect.width / 2) {
        mgState.moveLeft = true;
      } else {
        mgState.moveRight = true;
      }
    }
    if (e.touches.length === 0) mgState.touchActive = false;
  }, { passive: false });

  canvas.addEventListener('touchcancel', () => {
    if (!mgState) return;
    mgState.moveLeft = false;
    mgState.moveRight = false;
    mgState.touchActive = false;
  });

  // Keyboard controls
  document.addEventListener('keydown', (e) => {
    if (!mgState || !mgState.running) return;
    if (e.key === 'ArrowLeft' || e.key === 'a') mgState.moveLeft = true;
    if (e.key === 'ArrowRight' || e.key === 'd') mgState.moveRight = true;
  });

  document.addEventListener('keyup', (e) => {
    if (!mgState) return;
    if (e.key === 'ArrowLeft' || e.key === 'a') mgState.moveLeft = false;
    if (e.key === 'ArrowRight' || e.key === 'd') mgState.moveRight = false;
  });

  // Mouse controls (for desktop)
  canvas.addEventListener('mousedown', (e) => {
    if (!mgState || !mgState.running || mgState.touchActive) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width / 2) {
      mgState.moveLeft = true;
    } else {
      mgState.moveRight = true;
    }
  });

  canvas.addEventListener('mouseup', () => {
    if (!mgState || mgState.touchActive) return;
    mgState.moveLeft = false;
    mgState.moveRight = false;
  });

  canvas.addEventListener('mouseleave', () => {
    if (!mgState || mgState.touchActive) return;
    mgState.moveLeft = false;
    mgState.moveRight = false;
  });
}

// ─── Event Listeners ─────────────────────────────────────────────────────────

function setupEventListeners() {
  // Submit vote
  document.getElementById('submit-vote-btn')?.addEventListener('click', () => {
    submitVote().catch(console.error);
  });

  // Archive buttons (all views)
  for (const id of ['btn-archive', 'btn-archive-2', 'btn-archive-3', 'btn-archive-closed']) {
    document.getElementById(id)?.addEventListener('click', () => {
      loadArchive().catch(console.error);
    });
  }

  // Submit case buttons
  document.getElementById('btn-submit-case')?.addEventListener('click', () => initSubmitView());
  document.getElementById('btn-submit-case-2')?.addEventListener('click', () => initSubmitView());

  // Submit case form submit
  document.getElementById('submit-case-btn')?.addEventListener('click', () => {
    submitCase().catch(console.error);
  });

  // Mod queue button
  document.getElementById('btn-mod-queue')?.addEventListener('click', () => {
    loadModQueue().catch(console.error);
  });

  // Back buttons
  document.getElementById('btn-back-archive')?.addEventListener('click', goBack);
  document.getElementById('btn-back-archive-detail')?.addEventListener('click', goBack);
  document.getElementById('btn-back-submit')?.addEventListener('click', goBack);
  document.getElementById('btn-back-mod')?.addEventListener('click', goBack);

  // Share score
  document.getElementById('btn-share-score')?.addEventListener('click', () => {
    shareScore().catch(console.error);
  });

  // Comment mark
  document.getElementById('btn-commented')?.addEventListener('click', async () => {
    if (!todayData?.case) return;
    try {
      await apiPost('/api/comment-mark', { caseId: todayData.case.caseId });
      const btn = document.getElementById('btn-commented') as HTMLButtonElement;
      if (btn) {
        btn.className = 'comment-btn done';
        btn.textContent = 'Comment Recorded ✓';
        btn.disabled = true;
      }
      showToast('Comment recorded! Influence tracking started.', 'success');
    } catch {
      showToast('Failed to record comment', 'error');
    }
  });

  // GameMaker reveal button
  document.getElementById('btn-gm-reveal')?.addEventListener('click', (e) => {
    requestExpandedMode(e, 'reveal');
  });

  // Retry button
  document.getElementById('retry-btn')?.addEventListener('click', () => {
    showView('loading');
    init().catch(console.error);
  });

  // Leaderboard tabs
  setupLeaderboardTabs();

  // ─── Minigame buttons ──────────────────────────────────────────────────────
  document.getElementById('btn-play-minigame-voted')?.addEventListener('click', () => {
    startMinigame();
  });

  document.getElementById('btn-play-minigame-open')?.addEventListener('click', () => {
    startMinigame();
  });

  document.getElementById('btn-back-minigame')?.addEventListener('click', goBack);

  document.getElementById('mg-start-btn')?.addEventListener('click', () => {
    beginMinigameLoop();
  });

  document.getElementById('mg-retry')?.addEventListener('click', () => {
    retryMinigame();
  });

  document.getElementById('mg-done')?.addEventListener('click', goBack);

  // Setup minigame touch/keyboard/mouse controls
  setupMinigameControls();
}

// ─── Start ───────────────────────────────────────────────────────────────────

setupEventListeners();
init().catch(console.error);
