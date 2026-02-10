import { describe, it, expect } from 'vitest';
import {
  validateVoteInput,
  validateSubmission,
  validateLabelsOverride,
  checkSubmissionRateLimit,
} from '../validation';

describe('validateVoteInput', () => {
  it('returns null for valid input', () => {
    expect(validateVoteInput({ caseId: 'test-123', verdictIndex: 0, predictionIndex: 3 })).toBeNull();
  });

  it('rejects missing caseId', () => {
    expect(validateVoteInput({ verdictIndex: 0, predictionIndex: 0 })).toBe('caseId is required');
  });

  it('rejects empty caseId', () => {
    expect(validateVoteInput({ caseId: '', verdictIndex: 0, predictionIndex: 0 })).toBe('caseId is required');
  });

  it('rejects verdictIndex out of range', () => {
    expect(validateVoteInput({ caseId: 'x', verdictIndex: 4, predictionIndex: 0 })).toBe('verdictIndex must be 0-3');
    expect(validateVoteInput({ caseId: 'x', verdictIndex: -1, predictionIndex: 0 })).toBe('verdictIndex must be 0-3');
  });

  it('rejects predictionIndex out of range', () => {
    expect(validateVoteInput({ caseId: 'x', verdictIndex: 0, predictionIndex: 5 })).toBe('predictionIndex must be 0-3');
    expect(validateVoteInput({ caseId: 'x', verdictIndex: 0, predictionIndex: -2 })).toBe('predictionIndex must be 0-3');
  });

  it('rejects non-number verdictIndex', () => {
    expect(validateVoteInput({ caseId: 'x', verdictIndex: 'a' as unknown as number, predictionIndex: 0 })).toBe('verdictIndex must be 0-3');
  });

  it('accepts boundary values 0 and 3', () => {
    expect(validateVoteInput({ caseId: 'x', verdictIndex: 0, predictionIndex: 0 })).toBeNull();
    expect(validateVoteInput({ caseId: 'x', verdictIndex: 3, predictionIndex: 3 })).toBeNull();
  });
});

describe('validateSubmission', () => {
  it('returns null for valid text', () => {
    const text = 'Your neighbor borrowed your lawnmower and returned it broken. They deny it was their fault.';
    expect(validateSubmission(text)).toBeNull();
  });

  it('rejects empty text', () => {
    expect(validateSubmission('')).toBe('Text is required');
    expect(validateSubmission('   ')).toBe('Text cannot be empty');
  });

  it('rejects text too short', () => {
    expect(validateSubmission('Too short')).toBe('Text must be at least 30 characters');
  });

  it('rejects text too long', () => {
    const longText = 'A'.repeat(601);
    expect(validateSubmission(longText)).toContain('600 characters or less');
  });

  it('accepts text at boundary lengths', () => {
    const min = 'A'.repeat(30);
    const max = 'A'.repeat(600);
    expect(validateSubmission(min)).toBeNull();
    expect(validateSubmission(max)).toBeNull();
  });

  it('rejects text with phone numbers', () => {
    const text = 'Call my neighbor at 555-123-4567 to settle this dispute about the broken fence.';
    expect(validateSubmission(text)).toContain('prohibited content');
  });

  it('rejects text with email addresses', () => {
    const text = 'Send an email to john@example.com about the dispute over the parking spot.';
    expect(validateSubmission(text)).toContain('prohibited content');
  });

  it('rejects text with harmful content keywords', () => {
    const text = 'My neighbor threatened to doxx me online because I complained about their dog.';
    expect(validateSubmission(text)).toContain('prohibited content');
  });

  it('rejects medical advice requests', () => {
    const text = 'I need medical advice on what medication to take for this condition I have.';
    expect(validateSubmission(text)).toContain('medical or legal advice');
  });

  it('rejects legal advice requests', () => {
    const text = 'I need legal advice on how to sue my landlord for not fixing the plumbing.';
    expect(validateSubmission(text)).toContain('medical or legal advice');
  });

  it('allows normal social dilemma content', () => {
    const text = 'Your friend asks to borrow money and promises to pay you back next week. They still owe you from last time.';
    expect(validateSubmission(text)).toBeNull();
  });
});

describe('validateLabelsOverride', () => {
  it('returns null for undefined', () => {
    expect(validateLabelsOverride(undefined)).toBeNull();
  });

  it('returns null for valid labels', () => {
    expect(validateLabelsOverride(['A', 'B', 'C', 'D'])).toBeNull();
  });

  it('rejects wrong array length', () => {
    expect(validateLabelsOverride(['A', 'B', 'C'] as unknown as [string, string, string, string])).toContain('exactly 4');
  });

  it('rejects empty labels', () => {
    expect(validateLabelsOverride(['A', '', 'C', 'D'])).toContain('non-empty string');
  });

  it('rejects labels too long', () => {
    const longLabel = 'A'.repeat(31);
    expect(validateLabelsOverride([longLabel, 'B', 'C', 'D'])).toContain('30 characters or less');
  });
});

describe('checkSubmissionRateLimit', () => {
  it('returns null when under limit', () => {
    expect(checkSubmissionRateLimit(0)).toBeNull();
    expect(checkSubmissionRateLimit(1)).toBeNull();
    expect(checkSubmissionRateLimit(2)).toBeNull();
  });

  it('returns error when at or over limit', () => {
    expect(checkSubmissionRateLimit(3)).toContain('3 cases per day');
    expect(checkSubmissionRateLimit(10)).toContain('3 cases per day');
  });
});
