import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import path from 'node:path';
import { InMemoryAnalytics, type AnalyticsSink } from './analytics/index.js';
import { AgentOrchestrator } from './agent-orchestrator/index.js';
import { LlmClient } from './agent-orchestrator/llm.js';
import { loadConfig, type Config } from './config.js';
import { assistantRouter } from './routes/assistant.js';
import { SessionStore } from './session/store.js';
import { logger } from './logger.js';

export interface AppBundle {
  app: Express;
  sessions: SessionStore;
  analytics: AnalyticsSink;
  orchestrator: AgentOrchestrator;
  config: Config;
}

/** Fixed-window rate limit, keyed by IP — enough to blunt a scripted flood. */
function rateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || now > entry.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    if (entry.count >= limit) {
      res.status(429).json({ error: 'too_many_requests' });
      return;
    }
    entry.count++;
    next();
  };
}

export function createApp(overrides: Partial<Config> = {}): AppBundle {
  const config = { ...loadConfig(), ...overrides };
  const app = express();
  const sessions = new SessionStore(config.sessionTtlMs);
  const analytics = new InMemoryAnalytics();
  const llm = new LlmClient({
    apiKey: config.apiKey,
    model: config.model,
    effort: config.effort,
    timeoutMs: config.llmTimeoutMs,
  });
  const orchestrator = new AgentOrchestrator(sessions, llm, analytics);

  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));

  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    const allowAll = config.allowedOrigins.includes('*');
    if (origin && (allowAll || config.allowedOrigins.includes(origin))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    } else if (allowAll) {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', llm: llm.enabled ? 'enabled' : 'rules_only', sessions: sessions.size });
  });

  app.use('/assistant', rateLimiter(120, 60_000), assistantRouter(sessions, orchestrator, analytics));

  // The demo portal and the built SDK, served from the same origin so the
  // widget can be exercised without a separate static host.
  app.use('/sdk', express.static(path.resolve(config.sdkDir), { maxAge: '5m' }));
  app.use('/', express.static(path.resolve(config.demoDir), { extensions: ['html'] }));

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('unhandled', { message: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'internal_error' });
  });

  return { app, sessions, analytics, orchestrator, config };
}
