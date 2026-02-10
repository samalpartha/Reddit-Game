import { MAX_SUBMISSION_LENGTH, MAX_SUBMISSIONS_PER_DAY } from '../../shared/types';

// ─── Vote Validation ─────────────────────────────────────────────────────────

export function validateVoteInput(body: {
  caseId?: string;
  verdictIndex?: number;
  predictionIndex?: number;
}): string | null {
  if (!body.caseId || typeof body.caseId !== 'string') {
    return 'caseId is required';
  }
  if (typeof body.verdictIndex !== 'number' || body.verdictIndex < 0 || body.verdictIndex > 3) {
    return 'verdictIndex must be 0-3';
  }
  if (
    typeof body.predictionIndex !== 'number' ||
    body.predictionIndex < 0 ||
    body.predictionIndex > 3
  ) {
    return 'predictionIndex must be 0-3';
  }
  return null;
}

// ─── Submission Validation ───────────────────────────────────────────────────

const FORBIDDEN_PATTERNS = [
  // Personal information
  /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/, // Phone numbers
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Emails
  /\b\d{3}[-]?\d{2}[-]?\d{4}\b/, // SSN pattern

  // Harmful content indicators
  /\b(kill|murder|suicide|self[- ]?harm)\b/i,
  /\b(doxx|dox|swat)\b/i,
];

const PROHIBITED_TOPICS = [
  /\bmedical\s+(advice|diagnosis|treatment)\b/i,
  /\blegal\s+(advice|counsel)\b/i,
  /\b(prescription|medication)\s+(advice|recommendation)\b/i,
];

export function validateSubmission(text: string): string | null {
  if (!text || typeof text !== 'string') {
    return 'Text is required';
  }

  const trimmed = text.trim();

  if (trimmed.length === 0) {
    return 'Text cannot be empty';
  }

  if (trimmed.length > MAX_SUBMISSION_LENGTH) {
    return `Text must be ${MAX_SUBMISSION_LENGTH} characters or less (currently ${trimmed.length})`;
  }

  if (trimmed.length < 30) {
    return 'Text must be at least 30 characters';
  }

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(trimmed)) {
      return 'Submission contains prohibited content (personal info, harmful content)';
    }
  }

  for (const pattern of PROHIBITED_TOPICS) {
    if (pattern.test(trimmed)) {
      return 'Submissions cannot request medical or legal advice';
    }
  }

  return null;
}

export function validateLabelsOverride(
  labels?: [string, string, string, string]
): string | null {
  if (!labels) return null;
  if (!Array.isArray(labels) || labels.length !== 4) {
    return 'Labels must be an array of exactly 4 strings';
  }
  for (const label of labels) {
    if (typeof label !== 'string' || label.trim().length === 0) {
      return 'Each label must be a non-empty string';
    }
    if (label.length > 30) {
      return 'Each label must be 30 characters or less';
    }
  }
  return null;
}

export function checkSubmissionRateLimit(currentCount: number): string | null {
  if (currentCount >= MAX_SUBMISSIONS_PER_DAY) {
    return `You can only submit ${MAX_SUBMISSIONS_PER_DAY} cases per day`;
  }
  return null;
}
