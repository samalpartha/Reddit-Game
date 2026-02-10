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
//                                  ↕ archive, submit, mod-queue
// ═══════════════════════════════════════════════════════════════════════════════

type GameView = 'loading' | 'open' | 'voted' | 'closed' | 'revealed' | 'archive' | 'submit' | 'mod' | 'error';

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

const views: GameView[] = ['loading', 'open', 'voted', 'closed', 'revealed', 'archive', 'submit', 'mod', 'error'];

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
  const date = new Date(y, m, d);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${days[date.getDay()]} ${months[date.getMonth()]} ${date.getDate()}`;
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

// ─── Initialize ──────────────────────────────────────────────────────────────

async function init() {
  try {
    // Fetch init data to check mod status
    const initData = await apiGet<{ type: string; postId: string; username: string; userId: string; isMod: boolean }>('/api/init');

    // Show mod queue button if user is a mod
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
    // Show onboarding tooltip for first-time users
    if (!hasSeenOnboarding) {
      showOnboarding();
    }
  } else {
    // Closed but user hasn't voted - show a "closed" message
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

  // Animate in
  requestAnimationFrame(() => overlay.classList.add('visible'));

  const dismiss = document.getElementById('onboarding-dismiss');
  dismiss?.addEventListener('click', () => {
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 300);
  });

  // Auto-dismiss on tap outside
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
  const countdownEl = document.getElementById('closed-countdown');

  if (el) el.textContent = caseData.title;
  if (textEl) textEl.textContent = caseData.text;

  startCountdown(caseData.revealTs, 'closed-countdown');
}

// ─── Open View (Vote) ───────────────────────────────────────────────────────

function renderOpenView() {
  if (!todayData) return;
  const { case: caseData } = todayData;

  // Date and countdown
  const dateEl = document.getElementById('open-date');
  const countdownEl = document.getElementById('open-countdown');
  if (dateEl) dateEl.textContent = formatDate(caseData.dateKey);
  if (countdownEl) countdownEl.textContent = formatCountdown(caseData.closeTs);

  // Case content
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

  // Voter count
  const voterEl = document.getElementById('open-voters');
  if (voterEl) voterEl.textContent = `${todayData.aggregate?.voters ?? 0} votes so far`;

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

  // Start countdown timer
  startCountdown(caseData.closeTs, 'open-countdown');

  // Reset selections
  selectedVerdict = -1;
  selectedPrediction = -1;
  updateSubmitButton();
}

function selectVerdict(index: number) {
  selectedVerdict = index;
  document.querySelectorAll('.verdict-btn').forEach((btn) => {
    btn.classList.toggle('selected', btn.getAttribute('data-index') === String(index));
  });
  updateSubmitButton();
}

function selectPrediction(index: number) {
  selectedPrediction = index;
  document.querySelectorAll('.prediction-btn').forEach((btn) => {
    btn.classList.toggle('selected', btn.getAttribute('data-index') === String(index));
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
    renderVotedView();
    showView('voted');
    showToast('Vote submitted!', 'success');
  } catch (err) {
    console.error('Vote failed:', err);
    showToast(err instanceof Error ? err.message : 'Failed to submit vote', 'error');
    // Reset button to its proper state based on selections
    if (btn) {
      btn.disabled = false;
      btn.className = 'submit-btn ready';
    }
    if (text) text.textContent = 'Submit Your Verdict';
  }
}

// ─── Voted View (Waiting) ───────────────────────────────────────────────────

function renderVotedView() {
  if (!todayData?.userVote || !todayData.case) return;
  const { case: caseData, userVote } = todayData;

  // Show picks
  const verdictEl = document.getElementById('voted-verdict');
  const predEl = document.getElementById('voted-prediction');
  if (verdictEl) verdictEl.textContent = caseData.labels[userVote.verdictIndex] ?? '';
  if (predEl) predEl.textContent = caseData.labels[userVote.predictionIndex] ?? '';

  // Countdown to reveal
  startCountdown(caseData.revealTs, 'voted-countdown');

  // Comment button state
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
    // If user hasn't voted, show a limited reveal
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

      // Animate bars
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
    // Animate count up
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

// ─── Archive View ───────────────────────────────────────────────────────────

async function loadArchive() {
  showView('archive');
  const listEl = document.getElementById('archive-list');
  if (!listEl) return;
  listEl.innerHTML = '<p class="loading-text" style="padding:24px;text-align:center">Loading past cases...</p>';

  try {
    const data = await apiGet<{ entries: ArchiveEntry[] }>('/api/archive?days=7');

    if (data.entries.length === 0) {
      listEl.innerHTML = '<div class="archive-empty"><p>No past cases yet. Check back tomorrow!</p></div>';
      return;
    }

    listEl.innerHTML = '';
    for (const entry of data.entries) {
      const item = document.createElement('div');
      item.className = 'archive-item';
      item.innerHTML = `
        <div class="archive-item-date">${formatDate(entry.case.dateKey)}</div>
        <div class="archive-item-title">${escapeHtml(entry.case.title)}</div>
        <div class="archive-item-result">
          <span class="archive-item-verdict" data-index="${entry.majorityIndex}">${escapeHtml(entry.majorityLabel)}</span>
          ${entry.userScore ? `<span class="archive-item-score">Your score: <strong>${entry.userScore.total}</strong></span>` : '<span class="archive-item-score">Not voted</span>'}
        </div>
      `;
      listEl.appendChild(item);
    }
  } catch (err) {
    listEl.innerHTML = '<div class="archive-empty"><p>Failed to load archive.</p></div>';
  }
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

  // Only attach listeners once to prevent stacking
  if (!submitListenersAttached) {
    textArea.addEventListener('input', updateSubmitState);
    agreeCheckbox.addEventListener('change', updateSubmitState);
    submitListenersAttached = true;
  }

  // Reset form
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

    // Go back to previous view
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
      listEl.innerHTML = '<div class="archive-empty"><p>No pending submissions.</p></div>';
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

    // Attach event listeners
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
          await loadModQueue(); // Refresh
        } catch (err) {
          showToast('Failed to approve', 'error');
        }
      });
    });

    listEl.querySelectorAll('.mod-reject-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const subId = (btn as HTMLButtonElement).dataset['subId']!;
        const reason = prompt('Rejection reason:');
        if (!reason) return;
        try {
          await apiPost('/api/mod/reject', { submissionId: subId, reason });
          showToast('Submission rejected', '');
          await loadModQueue(); // Refresh
        } catch (err) {
          showToast('Failed to reject', 'error');
        }
      });
    });
  } catch (err) {
    listEl.innerHTML = '<div class="archive-empty"><p>Failed to load mod queue.</p></div>';
  }
}

// ─── Navigation ──────────────────────────────────────────────────────────────

function goBack() {
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
      if (countdownTimer) clearInterval(countdownTimer);
      // Auto-refresh after countdown ends
      setTimeout(() => {
        init().catch(console.error);
      }, 2000);
      return;
    }

    el.textContent = formatCountdown(targetTs);
  }

  update();
  countdownTimer = setInterval(update, 1000);
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function animateCountUp(el: HTMLElement, target: number, duration: number) {
  const start = performance.now();

  function frame(now: number) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
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
      weeklyList.innerHTML = '<p style="padding:12px;text-align:center;font-size:13px;color:#6b7280">No weekly scores yet.</p>';
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
    weeklyList.innerHTML = '<p style="padding:12px;text-align:center;font-size:13px;color:#6b7280">Failed to load weekly leaderboard.</p>';
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

// ─── Event Listeners ─────────────────────────────────────────────────────────

function setupEventListeners() {
  // Submit vote
  const submitVoteBtn = document.getElementById('submit-vote-btn');
  submitVoteBtn?.addEventListener('click', () => {
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
  document.getElementById('btn-back-submit')?.addEventListener('click', goBack);
  document.getElementById('btn-back-mod')?.addEventListener('click', goBack);

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
    } catch (err) {
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
}

// ─── Start ───────────────────────────────────────────────────────────────────

setupEventListeners();
init().catch(console.error);
