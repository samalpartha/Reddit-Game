import { describe, it, expect } from 'vitest';
import type { Aggregate } from '../../../shared/types';

// ─── Test computeMajority logic (pure function, no Redis needed) ─────────────

function computeMajority(agg: Aggregate): {
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

// ─── Score computation logic (extracted for testing) ─────────────────────────

function computeScoreValues(params: {
  predictionIndex: number;
  verdictIndex: number;
  majorityIndex: number;
  voteTs: number;
  openTs: number;
  closeTs: number;
  streakCurrent: number;
  hasInfluence: boolean;
}): {
  predictionMatch: number;
  verdictMatch: number;
  timingBonus: number;
  influenceBonus: number;
  streakBonus: number;
  total: number;
} {
  const predictionMatch = params.predictionIndex === params.majorityIndex ? 60 : 0;
  const verdictMatch = params.verdictIndex === params.majorityIndex ? 30 : 0;

  let timingBonus = 0;
  if (predictionMatch > 0) {
    const openDuration = params.closeTs - params.openTs;
    const voteOffset = params.voteTs - params.openTs;
    const earlyRatio = 1 - Math.min(voteOffset / openDuration, 1);
    timingBonus = Math.round(earlyRatio * 20);
  }

  const influenceBonus = params.hasInfluence ? 15 : 0;
  const streakBonus = Math.min(params.streakCurrent, 10);
  const total = predictionMatch + verdictMatch + timingBonus + influenceBonus + streakBonus;

  return { predictionMatch, verdictMatch, timingBonus, influenceBonus, streakBonus, total };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('computeMajority', () => {
  it('returns index 0 when first option has most votes', () => {
    const agg: Aggregate = {
      caseId: 'test',
      counts: [100, 50, 30, 20],
      voters: 200,
      lastUpdatedTs: Date.now(),
    };
    const result = computeMajority(agg);
    expect(result.majorityIndex).toBe(0);
    expect(result.percentages).toEqual([50, 25, 15, 10]);
  });

  it('returns index 2 when third option wins', () => {
    const agg: Aggregate = {
      caseId: 'test',
      counts: [10, 20, 60, 10],
      voters: 100,
      lastUpdatedTs: Date.now(),
    };
    const result = computeMajority(agg);
    expect(result.majorityIndex).toBe(2);
    expect(result.percentages).toEqual([10, 20, 60, 10]);
  });

  it('handles tie by returning first highest', () => {
    const agg: Aggregate = {
      caseId: 'test',
      counts: [25, 25, 25, 25],
      voters: 100,
      lastUpdatedTs: Date.now(),
    };
    const result = computeMajority(agg);
    // All equal, so first one (index 0) wins since > comparison is strict
    expect(result.majorityIndex).toBe(0);
  });

  it('handles zero voters gracefully', () => {
    const agg: Aggregate = {
      caseId: 'test',
      counts: [0, 0, 0, 0],
      voters: 0,
      lastUpdatedTs: Date.now(),
    };
    const result = computeMajority(agg);
    expect(result.majorityIndex).toBe(0);
    expect(result.percentages).toEqual([0, 0, 0, 0]);
  });

  it('rounds percentages correctly', () => {
    const agg: Aggregate = {
      caseId: 'test',
      counts: [33, 33, 33, 1],
      voters: 100,
      lastUpdatedTs: Date.now(),
    };
    const result = computeMajority(agg);
    expect(result.percentages).toEqual([33, 33, 33, 1]);
  });
});

describe('computeScoreValues', () => {
  const baseParams = {
    predictionIndex: 0,
    verdictIndex: 0,
    majorityIndex: 0,
    voteTs: 1000,
    openTs: 0,
    closeTs: 10000,
    streakCurrent: 0,
    hasInfluence: false,
  };

  it('gives max score when everything matches and voted early', () => {
    const result = computeScoreValues({
      ...baseParams,
      voteTs: 0, // Voted at the very start
      streakCurrent: 15,
      hasInfluence: true,
    });
    expect(result.predictionMatch).toBe(60);
    expect(result.verdictMatch).toBe(30);
    expect(result.timingBonus).toBe(20);
    expect(result.influenceBonus).toBe(15);
    expect(result.streakBonus).toBe(10); // Capped at 10
    expect(result.total).toBe(135);
  });

  it('gives zero when nothing matches', () => {
    const result = computeScoreValues({
      ...baseParams,
      predictionIndex: 1,
      verdictIndex: 2,
      majorityIndex: 3,
    });
    expect(result.predictionMatch).toBe(0);
    expect(result.verdictMatch).toBe(0);
    expect(result.timingBonus).toBe(0);
    expect(result.influenceBonus).toBe(0);
    expect(result.streakBonus).toBe(0);
    expect(result.total).toBe(0);
  });

  it('gives prediction match but no verdict match', () => {
    const result = computeScoreValues({
      ...baseParams,
      predictionIndex: 0,
      verdictIndex: 1,
      majorityIndex: 0,
    });
    expect(result.predictionMatch).toBe(60);
    expect(result.verdictMatch).toBe(0);
    expect(result.total).toBeGreaterThanOrEqual(60);
  });

  it('timing bonus is 0 when voted at the very end', () => {
    const result = computeScoreValues({
      ...baseParams,
      voteTs: 10000, // Voted at close time
    });
    expect(result.timingBonus).toBe(0);
  });

  it('timing bonus is ~10 when voted halfway through', () => {
    const result = computeScoreValues({
      ...baseParams,
      voteTs: 5000, // Voted halfway
    });
    expect(result.timingBonus).toBe(10);
  });

  it('timing bonus is only awarded when prediction is correct', () => {
    const result = computeScoreValues({
      ...baseParams,
      predictionIndex: 1, // Wrong prediction
      majorityIndex: 0,
      voteTs: 0, // Early vote
    });
    expect(result.timingBonus).toBe(0);
  });

  it('streak bonus caps at 10', () => {
    const result = computeScoreValues({
      ...baseParams,
      streakCurrent: 100,
    });
    expect(result.streakBonus).toBe(10);
  });

  it('streak bonus matches current streak up to 10', () => {
    for (let s = 0; s <= 12; s++) {
      const result = computeScoreValues({ ...baseParams, streakCurrent: s });
      expect(result.streakBonus).toBe(Math.min(s, 10));
    }
  });

  it('influence bonus is 15 when has influence', () => {
    const result = computeScoreValues({
      ...baseParams,
      hasInfluence: true,
    });
    expect(result.influenceBonus).toBe(15);
  });
});
