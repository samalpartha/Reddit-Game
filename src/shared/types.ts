// ─── Case ────────────────────────────────────────────────────────────────────

export type CaseStatus = 'open' | 'closed' | 'revealed';
export type CaseSource = 'seed' | 'user';

export interface Case {
  caseId: string;
  subId: string;
  dateKey: string; // yyyymmdd
  title: string;
  text: string;
  labels: [string, string, string, string];
  openTs: number;
  closeTs: number;
  revealTs: number;
  status: CaseStatus;
  source: CaseSource;
  createdBy: string; // userId or 'app'
  postId?: string;
}

// ─── Vote ────────────────────────────────────────────────────────────────────

export interface Vote {
  caseId: string;
  userId: string;
  verdictIndex: number; // 0..3
  predictionIndex: number; // 0..3
  voteTs: number;
  firstCommentTs?: number;
}

// ─── Aggregate ───────────────────────────────────────────────────────────────

export interface Aggregate {
  caseId: string;
  counts: [number, number, number, number];
  voters: number;
  lastUpdatedTs: number;
}

// ─── Snapshot ────────────────────────────────────────────────────────────────

export interface Snapshot {
  ts: number;
  counts: [number, number, number, number];
  voters: number;
}

// ─── Score ───────────────────────────────────────────────────────────────────

export interface ScoreBreakdown {
  caseId: string;
  userId: string;
  predictionMatch: number; // 0 or 60
  verdictMatch: number; // 0 or 30
  timingBonus: number; // 0..20
  influenceBonus: number; // 0 or 15
  streakBonus: number; // 0..10
  miniGameBonus: number; // 0..10
  total: number;
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  rank: number;
  username: string;
  score: number;
  userId: string;
}

export interface LeaderboardResponse {
  top: LeaderboardEntry[];
  me: LeaderboardEntry | null;
  totalPlayers: number;
}

// ─── Streak ──────────────────────────────────────────────────────────────────

export interface Streak {
  current: number;
  best: number;
  lastPlayedDate: string; // yyyymmdd
}

// ─── Submission ──────────────────────────────────────────────────────────────

export type SubmissionStatus = 'pending' | 'approved' | 'rejected';

export interface CaseSubmission {
  submissionId: string;
  subId: string;
  userId: string;
  username: string;
  text: string;
  title?: string;
  labelsOverride?: [string, string, string, string];
  status: SubmissionStatus;
  submittedAt: number;
  reviewedAt?: number;
  reviewedBy?: string;
  rejectReason?: string;
  assignedDate?: string; // yyyymmdd
}

// ─── API Request / Response Types ────────────────────────────────────────────

export interface InitResponse {
  type: 'init';
  postId: string;
  username: string;
  userId: string;
  isMod: boolean;
}

export interface TodayResponse {
  case: Case;
  userVote: Vote | null;
  aggregate: Aggregate | null;
  score: ScoreBreakdown | null;
  streak: Streak | null;
  leaderboard: LeaderboardResponse | null;
  username: string;
  userId: string;
}

export interface VoteRequest {
  caseId: string;
  verdictIndex: number;
  predictionIndex: number;
}

export interface VoteResponse {
  success: boolean;
  vote: Vote;
  aggregate: Aggregate;
}

export interface RevealResponse {
  case: Case;
  aggregate: Aggregate;
  majorityIndex: number;
  majorityLabel: string;
  percentages: [number, number, number, number];
  score: ScoreBreakdown;
  streak: Streak;
  leaderboard: LeaderboardResponse;
}

export interface ArchiveEntry {
  case: Case;
  aggregate: Aggregate;
  majorityIndex: number;
  majorityLabel: string;
  userScore?: ScoreBreakdown;
}

export interface SubmitCaseRequest {
  text: string;
  title?: string;
  labelsOverride?: [string, string, string, string];
}

export interface ModApproveRequest {
  submissionId: string;
  dateKey: string;
}

export interface ModRejectRequest {
  submissionId: string;
  reason: string;
}

export interface CommentMarkRequest {
  caseId: string;
}

// ─── GameMaker Bridge ────────────────────────────────────────────────────────

export interface RevealPayload {
  majorityLabel: string;
  majorityIndex: number;
  labels: [string, string, string, string];
  counts: [number, number, number, number];
  percentages: [number, number, number, number];
  voters: number;
  userScore: ScoreBreakdown;
  streak: Streak;
}

export interface GameMakerEvent {
  type: 'reveal_complete' | 'stamp_pressed' | 'ready';
  data?: Record<string, unknown>;
}

// ─── Config ──────────────────────────────────────────────────────────────────

export const DEFAULT_LABELS: [string, string, string, string] = [
  'Right Call',
  'Wrong Call',
  'It Depends',
  "Everyone's Wrong",
];

// Voting cycle timing (in minutes for rapid gameplay)
export const CASE_OPEN_MINUTES = 4; // 4 minutes open for voting
export const REVEAL_DELAY_MINUTES = 1; // 1 minute after close for reveal
export const CYCLE_MINUTES = 5; // Total cycle length: 5 minutes

// Legacy hour-based constants for backward compatibility
export const CASE_OPEN_HOURS = CASE_OPEN_MINUTES / 60; // ~0.025 hours
export const REVEAL_DELAY_HOURS = REVEAL_DELAY_MINUTES / 60; // ~0.0083 hours
export const CYCLE_HOURS = CYCLE_MINUTES / 60; // ~0.033 hours
export const MAX_SUBMISSION_LENGTH = 600;
export const MAX_SUBMISSIONS_PER_DAY = 3;
export const INFLUENCE_THRESHOLD_PCT = 3; // 3 percentage point increase
export const SNAPSHOT_INTERVAL_MINUTES = 10;
export const REVEAL_SCAN_DAYS = 3; // How many days back the reveal scheduler scans
