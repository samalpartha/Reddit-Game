/**
 * GameMaker Bridge
 *
 * Handles bidirectional communication between the Devvit Web client
 * and the GameMaker WASM reveal scene.
 *
 * Flow:
 * 1. Client loads reveal data from /api/reveal
 * 2. Client sets window.DV_REVEAL_PAYLOAD with the data
 * 3. GameMaker reads this payload on startup
 * 4. GameMaker sends events back via window.DV_onGameMakerEvent
 * 5. Client handles those events (e.g., reveal_complete)
 */

import type { RevealPayload, GameMakerEvent, RevealResponse } from '../../shared/types';

type EventCallback = (event: GameMakerEvent) => void;

class GameMakerBridge {
  private listeners: Map<string, EventCallback[]> = new Map();
  private payload: RevealPayload | null = null;
  private _ready = false;

  constructor() {
    // Set up the global event handler
    window.DV_onGameMakerEvent = (event: GameMakerEvent) => {
      this.handleEvent(event);
    };
  }

  /**
   * Check if GameMaker assets are available on the server.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch('/runner.json', { method: 'HEAD', cache: 'no-cache' });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Set the reveal payload that GameMaker will read.
   */
  setPayload(data: RevealResponse): void {
    this.payload = {
      majorityLabel: data.majorityLabel,
      majorityIndex: data.majorityIndex,
      labels: data.case.labels,
      counts: data.aggregate.counts,
      percentages: data.percentages,
      voters: data.aggregate.voters,
      userScore: data.score,
      streak: data.streak,
    };
    window.DV_REVEAL_PAYLOAD = this.payload;
  }

  /**
   * Get the current payload.
   */
  getPayload(): RevealPayload | null {
    return this.payload;
  }

  /**
   * Register a listener for a specific GameMaker event type.
   */
  on(eventType: string, callback: EventCallback): void {
    const existing = this.listeners.get(eventType) ?? [];
    existing.push(callback);
    this.listeners.set(eventType, existing);
  }

  /**
   * Remove a listener.
   */
  off(eventType: string, callback: EventCallback): void {
    const existing = this.listeners.get(eventType) ?? [];
    this.listeners.set(
      eventType,
      existing.filter((cb) => cb !== callback)
    );
  }

  /**
   * Handle an incoming event from GameMaker.
   */
  private handleEvent(event: GameMakerEvent): void {

    if (event.type === 'ready') {
      this._ready = true;
    }

    const callbacks = this.listeners.get(event.type) ?? [];
    for (const cb of callbacks) {
      try {
        cb(event);
      } catch {
        // Callback error - silently continue
      }
    }

    // Also fire to wildcard listeners
    const wildcardCallbacks = this.listeners.get('*') ?? [];
    for (const cb of wildcardCallbacks) {
      try {
        cb(event);
      } catch {
        // Wildcard callback error - silently continue
      }
    }
  }

  /**
   * Send a command to GameMaker via a global function call.
   * GameMaker must have set up a corresponding js_call listener.
   */
  sendToGameMaker(command: string, data?: Record<string, unknown>): void {
    const fn = (window as unknown as Record<string, unknown>)[`DV_GM_${command}`];
    if (typeof fn === 'function') {
      (fn as (data: string) => void)(JSON.stringify(data ?? {}));
    }
    // If function not found, silently skip (GameMaker not loaded)
  }

  /**
   * Whether GameMaker has signaled it's ready.
   */
  get ready(): boolean {
    return this._ready;
  }

  /**
   * Destroy the bridge and clean up global references.
   */
  destroy(): void {
    this.listeners.clear();
    this.payload = null;
    window.DV_REVEAL_PAYLOAD = undefined;
    window.DV_onGameMakerEvent = undefined;
  }
}

/**
 * Create a new bridge instance.
 * Note: main.ts has its own inline implementation for the reveal page.
 * This class is available for use if the GameMaker integration is
 * expanded to other views.
 */
export function createGameMakerBridge(): GameMakerBridge {
  return new GameMakerBridge();
}

// Extend Window for TypeScript
declare global {
  interface Window {
    DV_REVEAL_PAYLOAD?: RevealPayload;
    DV_onGameMakerEvent?: (event: GameMakerEvent) => void;
  }
}
