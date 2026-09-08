import { Router, type Request, type Response } from 'express';
import {
  ContextRequestSchema,
  EventRequestSchema,
  FeedbackRequestSchema,
  MessageRequestSchema,
  OperationResultRequestSchema,
  type ContextResponse,
} from '@astan/contracts';
import type { AnalyticsSink } from '../analytics/index.js';
import type { AgentOrchestrator } from '../agent-orchestrator/index.js';
import { quickActions } from '../agent-orchestrator/rules.js';
import { allowedTargets } from '../policy-engine/index.js';
import type { SessionStore } from '../session/store.js';
import { toView } from '../workflow-engine/index.js';
import { logger } from '../logger.js';

/** Assistant API (سند §24). */
export function assistantRouter(
  sessions: SessionStore,
  orchestrator: AgentOrchestrator,
  analytics: AnalyticsSink,
): Router {
  const router = Router();

  const badRequest = (res: Response, issues: unknown): void => {
    res.status(400).json({ error: 'invalid_request', issues });
  };

  router.post('/session', (_req: Request, res: Response) => {
    const session = sessions.create();
    res.json({ session_id: session.id, created_at: session.created_at });
  });

  router.post('/context', (req: Request, res: Response) => {
    const parsed = ContextRequestSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues);
    const session = sessions.getOrCreate(parsed.data.session_id);
    const { actions, message } = orchestrator.handleContext(session, parsed.data.context);
    const body: ContextResponse = {
      session_id: session.id,
      workflow: toView(session.workflow),
      allowed_targets: allowedTargets(session.workflow, parsed.data.context),
      quick_actions: quickActions(session.workflow, parsed.data.context),
      actions,
      message,
    };
    return res.json(body);
  });

  router.post('/message', async (req: Request, res: Response) => {
    const parsed = MessageRequestSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues);
    const session = sessions.getOrCreate(parsed.data.session_id);
    try {
      const response = await orchestrator.handleMessage(session, parsed.data.message, parsed.data.context);
      return res.json(response);
    } catch (error) {
      logger.error('message_failed', { message: error instanceof Error ? error.message : String(error) });
      return res.status(500).json({ error: 'assistant_unavailable' });
    }
  });

  router.post('/event', (req: Request, res: Response) => {
    const parsed = EventRequestSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues);
    const session = sessions.getOrCreate(parsed.data.session_id);
    const { actions, message } = orchestrator.handleEvent(
      session,
      parsed.data.event,
      parsed.data.context,
      parsed.data.error_code ?? parsed.data.context.error_code ?? null,
    );
    return res.json({
      session_id: session.id,
      workflow: toView(session.workflow),
      actions,
      message,
      quick_actions: quickActions(session.workflow, parsed.data.context),
    });
  });

  /**
   * The host site reports whether it honoured a `request_operation`. The
   * assistant never learns the result any other way — it has no path to the
   * OTP service (سند §14 Action 6).
   */
  router.post('/operation', (req: Request, res: Response) => {
    const parsed = OperationResultRequestSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues);
    const session = sessions.getOrCreate(parsed.data.session_id);
    session.pending_operation = null;
    const message = parsed.data.allowed
      ? 'درخواست شما به سامانه ارسال شد. چند لحظه صبر کنید.'
      : `سامانه اجازه این کار را نداد${parsed.data.reason ? `: ${parsed.data.reason}` : '.'}`;
    return res.json({ session_id: session.id, message, workflow: toView(session.workflow) });
  });

  router.post('/feedback', (req: Request, res: Response) => {
    const parsed = FeedbackRequestSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues);
    analytics.feedback(parsed.data.helpful);
    return res.json({ ok: true });
  });

  router.get('/analytics', (_req: Request, res: Response) => {
    res.json(analytics.snapshot());
  });

  return router;
}
