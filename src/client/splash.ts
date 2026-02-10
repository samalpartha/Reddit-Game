import { context, requestExpandedMode } from '@devvit/web/client';
import type { TodayResponse } from '../shared/types';

// ─── DOM Elements ────────────────────────────────────────────────────────────

const subtitleEl = document.getElementById('splash-subtitle') as HTMLParagraphElement;
const caseTitleEl = document.getElementById('case-title') as HTMLDivElement;
const casePreviewEl = document.getElementById('case-preview') as HTMLDivElement;
const statusDot = document.querySelector('.status-dot') as HTMLSpanElement;
const statusText = document.getElementById('status-text') as HTMLSpanElement;
const playButton = document.getElementById('play-button') as HTMLButtonElement;
const playText = document.getElementById('play-text') as HTMLSpanElement;
const voterCount = document.getElementById('voter-count') as HTMLSpanElement;
const timeLeft = document.getElementById('time-left') as HTMLSpanElement;
const timeLabel = document.getElementById('time-label') as HTMLSpanElement;
const minigameButton = document.getElementById('minigame-button') as HTMLButtonElement;

// ─── State ───────────────────────────────────────────────────────────────────

let todayData: TodayResponse | null = null;
let countdownInterval: ReturnType<typeof setInterval> | null = null;

// ─── Initialize ──────────────────────────────────────────────────────────────

async function init() {
  subtitleEl.textContent = `Hey ${context.username ?? 'there'}! Today's case is ready.`;

  try {
    const response = await fetch('/api/today');
    if (!response.ok) throw new Error('Failed to fetch today data');
    todayData = (await response.json()) as TodayResponse;
    renderSplash();
  } catch (error) {
    console.error('Failed to load today data:', error);
    subtitleEl.textContent = 'Failed to load today\'s case. Tap to try again.';
  }
}

// ─── Render ──────────────────────────────────────────────────────────────────

function renderSplash() {
  if (!todayData) return;

  const { case: caseData, userVote, aggregate } = todayData;

  // Case preview
  caseTitleEl.textContent = caseData.title;
  casePreviewEl.textContent = caseData.text;

  // Voter count
  voterCount.textContent = aggregate?.voters?.toString() ?? '0';

  // Status and button based on state
  if (caseData.status === 'revealed') {
    statusDot.className = 'status-dot revealed';
    statusText.textContent = 'Results are in!';
    playButton.className = 'splash-play-btn revealed';
    playText.textContent = 'See Results';
    timeLeft.textContent = 'Done';
    timeLabel.textContent = 'Revealed';
    minigameButton.classList.add('hidden');
  } else if (userVote) {
    statusDot.className = 'status-dot voted';
    statusText.textContent = 'You voted! Waiting for reveal...';
    playButton.className = 'splash-play-btn voted';
    playText.textContent = 'Check Status';
    startCountdown(caseData.revealTs, 'Reveal');
    minigameButton.classList.remove('hidden');
  } else if (caseData.status === 'closed') {
    statusDot.className = 'status-dot closed';
    statusText.textContent = 'Voting closed. Reveal coming soon.';
    playButton.className = 'splash-play-btn voted';
    playText.textContent = 'View Case';
    startCountdown(caseData.revealTs, 'Reveal');
    minigameButton.classList.add('hidden');
  } else {
    // Open for voting
    statusDot.className = 'status-dot';
    statusText.textContent = 'Open for voting';
    playButton.className = 'splash-play-btn';
    playText.textContent = 'Vote Now';
    startCountdown(caseData.closeTs, 'Remaining');
    minigameButton.classList.remove('hidden');
  }
}

// ─── Countdown ───────────────────────────────────────────────────────────────

function startCountdown(targetTs: number, label: string) {
  timeLabel.textContent = label;

  function update() {
    const diff = targetTs - Date.now();
    if (diff <= 0) {
      timeLeft.textContent = 'Now!';
      if (countdownInterval) clearInterval(countdownInterval);
      return;
    }

    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);

    if (hours > 0) {
      timeLeft.textContent = `${hours}h ${minutes}m`;
    } else {
      const seconds = Math.floor((diff % 60000) / 1000);
      timeLeft.textContent = `${minutes}m ${seconds}s`;
    }
  }

  update();
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(update, 1000);
}

// ─── Play Button Handler ─────────────────────────────────────────────────────

playButton.addEventListener('click', (e) => {
  requestExpandedMode(e, 'game');
});

minigameButton.addEventListener('click', (e) => {
  requestExpandedMode(e, 'game');
});

// ─── Start ───────────────────────────────────────────────────────────────────

init().catch(console.error);
