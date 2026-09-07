import { randomUUID } from 'node:crypto';
import { emptyState } from '../workflow-engine/index.js';
import type { Intent, PageContext, WorkflowState } from '@astan/contracts';

/**
 * Assistant session (سند §23). Deliberately anonymous: it holds where the user
 * is in a process, never who they are. No national ID, no phone, no token —
 * so a leak of this store discloses nothing about a citizen.
 */
export interface Turn {
  role: 'user' | 'assistant';
  text: string;
  intent?: Intent;
  at: string;
}

export interface AssistantSession {
  id: string;
  created_at: string;
  last_seen_at: string;
  workflow: WorkflowState;
  context: PageContext | null;
  /** Bounded transcript — enough for "بعدش چی؟" and "متوجه نشدم". */
  history: Turn[];
  /** The last instruction we gave, for REPEAT_INSTRUCTION / SIMPLE_EXPLANATION. */
  last_instruction: { title: string; body: string; simple: string } | null;
  pending_operation: { operation: string; requested_at: string } | null;
  handoff_offered: boolean;
  /** The element we last highlighted, so guidance is re-issued when the
   *  target changes but not repeated on every duplicate event. */
  last_pointed_target: string | null;
}

const HISTORY_LIMIT = 12;

export class SessionStore {
  private readonly sessions = new Map<string, AssistantSession>();

  constructor(private readonly ttlMs: number) {}

  create(): AssistantSession {
    const now = new Date().toISOString();
    const session: AssistantSession = {
      id: randomUUID(),
      created_at: now,
      last_seen_at: now,
      workflow: emptyState(),
      context: null,
      history: [],
      last_instruction: null,
      pending_operation: null,
      handoff_offered: false,
      last_pointed_target: null,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  /** Fetch a live session, or mint a fresh one if it expired or never existed. */
  getOrCreate(id: string | undefined): AssistantSession {
    if (id) {
      const existing = this.sessions.get(id);
      if (existing && !this.isExpired(existing)) {
        existing.last_seen_at = new Date().toISOString();
        return existing;
      }
      if (existing) this.sessions.delete(id);
    }
    return this.create();
  }

  get(id: string): AssistantSession | null {
    const s = this.sessions.get(id);
    if (!s || this.isExpired(s)) return null;
    return s;
  }

  appendTurn(session: AssistantSession, turn: Turn): void {
    session.history.push(turn);
    if (session.history.length > HISTORY_LIMIT) {
      session.history.splice(0, session.history.length - HISTORY_LIMIT);
    }
  }

  private isExpired(s: AssistantSession): boolean {
    return Date.now() - new Date(s.last_seen_at).getTime() > this.ttlMs;
  }

  /** Drop expired sessions; called on an interval by the server. */
  sweep(): number {
    let removed = 0;
    for (const [id, s] of this.sessions) {
      if (this.isExpired(s)) {
        this.sessions.delete(id);
        removed++;
      }
    }
    return removed;
  }

  get size(): number {
    return this.sessions.size;
  }
}
