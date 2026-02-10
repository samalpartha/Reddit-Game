import type { Case, Vote, Aggregate, Snapshot, ScoreBreakdown, Streak } from '../../shared/types';
import { INFLUENCE_THRESHOLD_PCT } from '../../shared/types';
import {
  getVote,
  getAggregate,
  getSnapshotAfterTs,
  saveScore,
  getStreak,
  updateStreak,
  addToWeeklyLeaderboard,
  getWeekKey,
  dateKeyToDate,
  getCachedUsername,
  getCaseLeaderboard,
  getUserRank,
  getCaseLeaderboardSize,
  getMinigameScore,
} from './redis';
import type { LeaderboardEntry, LeaderboardResponse } from '../../shared/types';

// ─── Majority Calculation ────────────────────────────────────────────────────

export function computeMajority(agg: Aggregate): {
  majorityIndex: number;
  percentages: [number, number, number, number];
} {
  const total = agg.voters || 1;
  const percentages = agg.counts.map((c) => Math.round((c / total) * 100)) as [
    number,
    number,
    number,
    number,
  ];

  let maxCount = 0;
  let majorityIndex = 0;
  for (let i = 0; i < 4; i++) {
    if (agg.counts[i]! > maxCount) {
      maxCount = agg.counts[i]!;
      majorityIndex = i;
    }
  }

  return { majorityIndex, percentages };
}

// ─── Score Computation ───────────────────────────────────────────────────────

export async function computeUserScore(
  caseData: Case,
  userId: string
): Promise<ScoreBreakdown | null> {
  const vote = await getVote(caseData.caseId, userId);
  if (!vote) return null;

  const agg = await getAggregate(caseData.caseId);
  if (!agg) return null;

  const { majorityIndex } = computeMajority(agg);

  // 1. Prediction match: +60 if predicted the majority
  const predictionMatch = vote.predictionIndex === majorityIndex ? 60 : 0;

  // 2. Verdict match: +30 if voted with the majority
  const verdictMatch = vote.verdictIndex === majorityIndex ? 30 : 0;

  // 3. Timing bonus: 0..20 based on early correct prediction
  let timingBonus = 0;
  if (predictionMatch > 0) {
    const openDuration = caseData.closeTs - caseData.openTs;
    const voteOffset = vote.voteTs - caseData.openTs;
    const earlyRatio = 1 - Math.min(voteOffset / openDuration, 1);
    timingBonus = Math.round(earlyRatio * 20);
  }

  // 4. Influence bonus: +15 if your verdict share rises >= 3pp after your comment
  let influenceBonus = 0;
  if (vote.firstCommentTs) {
    const snapAfterComment = await getSnapshotAfterTs(caseData.caseId, vote.firstCommentTs);
    if (snapAfterComment && agg) {
      const snapTotal = snapAfterComment.voters || 1;
      const finalTotal = agg.voters || 1;
      const snapShare = (snapAfterComment.counts[vote.verdictIndex]! / snapTotal) * 100;
      const finalShare = (agg.counts[vote.verdictIndex]! / finalTotal) * 100;

      if (finalShare - snapShare >= INFLUENCE_THRESHOLD_PCT) {
        influenceBonus = 15;
      }
    }
  }

  // 5. Streak bonus: 0..10
  const streak = await getStreak(caseData.subId, userId);
  const streakBonus = Math.min(streak.current, 10);

  // 6. Mini-game bonus: 0..10 (every 50 minigame points = +1)
  const minigameScore = await getMinigameScore(caseData.caseId, userId);
  const miniGameBonus = Math.min(Math.floor(minigameScore / 50), 10);

  const total = predictionMatch + verdictMatch + timingBonus + influenceBonus + streakBonus + miniGameBonus;

  const score: ScoreBreakdown = {
    caseId: caseData.caseId,
    userId,
    predictionMatch,
    verdictMatch,
    timingBonus,
    influenceBonus,
    streakBonus,
    miniGameBonus,
    total,
  };

  return score;
}

// ─── Build Leaderboard Response ──────────────────────────────────────────────

export async function buildLeaderboardResponse(
  caseId: string,
  userId: string,
  limit: number = 10
): Promise<LeaderboardResponse> {
  const entries = await getCaseLeaderboard(caseId, limit);

  const top: LeaderboardEntry[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const username = await getCachedUsername(entry.member);
    top.push({
      rank: i + 1,
      username,
      score: Number(entry.score),
      userId: entry.member,
    });
  }

  // Get current user's position
  const userRank = await getUserRank(caseId, userId);
  let me: LeaderboardEntry | null = null;

  if (userRank !== null) {
    const username = await getCachedUsername(userId);
    const userScore = entries.find((e) => e.member === userId);
    me = {
      rank: userRank + 1,
      username,
      score: userScore ? Number(userScore.score) : 0,
      userId,
    };
  }

  const totalPlayers = await getCaseLeaderboardSize(caseId);

  return {
    top,
    me,
    totalPlayers,
  };
}
