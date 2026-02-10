import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSnapshotAfterTs } from '../redis';
import { redis } from '@devvit/web/server';

// Mock dependencies
vi.mock('@devvit/web/server', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    zRange: vi.fn(),
    zAdd: vi.fn(),
  },
  context: {
    subredditName: 'test-sub',
  },
  reddit: {
    submitCustomPost: vi.fn(),
  },
}));

describe('getSnapshotAfterTs', () => {
  const caseId = 'test-case-123';
  const snapshots = [
    { ts: 1000, value: 'snap1' },
    { ts: 2000, value: 'snap2' },
    { ts: 3000, value: 'snap3' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the first snapshot equal to timestamp', async () => {
    // Mock zRange return
    (redis.zRange as any).mockResolvedValue(
      snapshots.map(s => ({ member: String(s.ts), score: s.ts }))
    );
    // Mock get return
    (redis.get as any).mockImplementation(async (key: string) => {
      if (key.includes('1000')) return JSON.stringify({ ts: 1000, counts: [1,0,0,0], voters: 1 });
      return null;
    });

    const result = await getSnapshotAfterTs(caseId, 1000);
    expect(result).not.toBeNull();
    expect(result!.ts).toBe(1000);
  });

  it('returns the first snapshot after timestamp', async () => {
    (redis.zRange as any).mockResolvedValue(
      snapshots.map(s => ({ member: String(s.ts), score: s.ts }))
    );
    (redis.get as any).mockImplementation(async (key: string) => {
      if (key.includes('2000')) return JSON.stringify({ ts: 2000, counts: [2,0,0,0], voters: 2 });
      return null;
    });

    // Request 1500, expect 2000
    const result = await getSnapshotAfterTs(caseId, 1500);
    expect(result).not.toBeNull();
    expect(result!.ts).toBe(2000);
  });

  it('returns null if no snapshot after timestamp', async () => {
    (redis.zRange as any).mockResolvedValue(
      snapshots.map(s => ({ member: String(s.ts), score: s.ts }))
    );

    // Request 4000 (after 3000)
    const result = await getSnapshotAfterTs(caseId, 4000);
    expect(result).toBeNull();
  });

  it('returns null if zRange returns empty', async () => {
    (redis.zRange as any).mockResolvedValue([]);
    const result = await getSnapshotAfterTs(caseId, 1000);
    expect(result).toBeNull();
  });
  
  it('returns null if snapshot key is missing', async () => {
     (redis.zRange as any).mockResolvedValue(
      [{ member: '1000', score: 1000 }]
    );
    (redis.get as any).mockResolvedValue(null);
    
    const result = await getSnapshotAfterTs(caseId, 500);
    expect(result).toBeNull();
  });
});
