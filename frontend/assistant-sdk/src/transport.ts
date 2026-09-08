import type { AssistantResponse, ContextResponse, EventResponse, PageContext, SystemEvent } from './types.js';

/** Thin fetch wrapper. One retry on network failure; never on a 4xx. */
export class Transport {
  private sessionId: string | null = null;

  constructor(
    private readonly apiBase: string,
    private readonly debug = false,
    private readonly handler?: (path: string, body: unknown) => Promise<unknown>,
  ) {}

  get session(): string | null {
    return this.sessionId;
  }

  setSession(id: string): void {
    this.sessionId = id;
    try {
      sessionStorage.setItem('astan_assistant_session', id);
    } catch {
      /* storage may be blocked; the session simply won't survive a reload */
    }
  }

  restoreSession(): void {
    try {
      const stored = sessionStorage.getItem('astan_assistant_session');
      if (stored) this.sessionId = stored;
    } catch {
      /* ignore */
    }
  }

  async ensureSession(): Promise<string> {
    if (this.sessionId) return this.sessionId;
    const data = await this.post<{ session_id: string }>('/assistant/session', {});
    this.setSession(data.session_id);
    return data.session_id;
  }

  async sendContext(context: PageContext): Promise<ContextResponse> {
    const session_id = await this.ensureSession();
    const data = await this.post<ContextResponse>('/assistant/context', { session_id, context });
    this.setSession(data.session_id);
    return data;
  }

  async sendMessage(message: string, context: PageContext): Promise<AssistantResponse> {
    const session_id = await this.ensureSession();
    const data = await this.post<AssistantResponse>('/assistant/message', { session_id, message, context });
    this.setSession(data.session_id);
    return data;
  }

  async sendEvent(event: SystemEvent, context: PageContext, errorCode?: string | null): Promise<EventResponse> {
    const session_id = await this.ensureSession();
    const data = await this.post<EventResponse>('/assistant/event', {
      session_id, event, context, error_code: errorCode ?? null,
    });
    this.setSession(data.session_id);
    return data;
  }

  async reportOperation(operation: string, allowed: boolean, reason?: string): Promise<void> {
    const session_id = await this.ensureSession();
    await this.post('/assistant/operation', { session_id, operation, allowed, reason });
  }

  async sendFeedback(helpful: boolean): Promise<void> {
    const session_id = await this.ensureSession();
    await this.post('/assistant/feedback', { session_id, helpful });
  }

  private async post<T>(path: string, body: unknown, attempt = 0): Promise<T> {
    if (this.handler) return (await this.handler(path, body)) as T;

    const response = await fetch(`${this.apiBase}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch((error: unknown) => {
      if (attempt === 0) return null;
      throw error;
    });

    if (response === null) return this.post<T>(path, body, attempt + 1);

    if (!response.ok) {
      // A stale session is the one recoverable 4xx: mint a new one and retry.
      if (response.status === 400 && attempt === 0) {
        this.sessionId = null;
        const fresh = await this.ensureSession();
        return this.post<T>(path, { ...(body as object), session_id: fresh }, attempt + 1);
      }
      if (this.debug) console.warn('[AssistantSDK] request failed', path, response.status);
      throw new Error(`assistant_request_failed:${response.status}`);
    }
    return (await response.json()) as T;
  }
}
