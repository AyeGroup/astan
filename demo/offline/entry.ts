/**
 * Offline demo runtime.
 *
 * Runs the real assistant — the same workflow engine, policy engine,
 * knowledge base and orchestrator the server runs — inside the browser, so
 * the whole system can be evaluated from a single HTML file with no server,
 * no API key and no network.
 *
 * The only thing swapped out is the LLM: an engine that reports itself
 * disabled, which is exactly the production degraded path. So what this file
 * demonstrates is not a mock — it is the deterministic tier of the real
 * product.
 */
import { InMemoryAnalytics } from '../../backend/src/analytics/index.js';
import { AgentOrchestrator } from '../../backend/src/agent-orchestrator/index.js';
import type { LlmEngine } from '../../backend/src/agent-orchestrator/llm.js';
import { quickActions } from '../../backend/src/agent-orchestrator/rules.js';
import { allowedTargets } from '../../backend/src/policy-engine/index.js';
import { SessionStore } from '../../backend/src/session/store.js';
import { toView } from '../../backend/src/workflow-engine/index.js';
import {
  ContextRequestSchema,
  EventRequestSchema,
  FeedbackRequestSchema,
  MessageRequestSchema,
  OperationResultRequestSchema,
} from '@astan/contracts';
import sdk from '../../frontend/assistant-sdk/src/index.js';

const sessions = new SessionStore(60 * 60_000);
const analytics = new InMemoryAnalytics();
const offlineLlm: LlmEngine = { enabled: false, respond: async () => null };
const orchestrator = new AgentOrchestrator(sessions, offlineLlm, analytics);

/** Same routes, same schemas, same validation as the HTTP API. */
async function handle(path: string, body: unknown): Promise<unknown> {
  switch (path) {
    case '/assistant/session': {
      const session = sessions.create();
      return { session_id: session.id, created_at: session.created_at };
    }

    case '/assistant/context': {
      const req = ContextRequestSchema.parse(body);
      const session = sessions.getOrCreate(req.session_id);
      const { actions, message } = orchestrator.handleContext(session, req.context);
      return {
        session_id: session.id,
        workflow: toView(session.workflow),
        allowed_targets: allowedTargets(session.workflow, req.context),
        quick_actions: quickActions(session.workflow, req.context),
        actions,
        message,
      };
    }

    case '/assistant/message': {
      const req = MessageRequestSchema.parse(body);
      const session = sessions.getOrCreate(req.session_id);
      return orchestrator.handleMessage(session, req.message, req.context);
    }

    case '/assistant/event': {
      const req = EventRequestSchema.parse(body);
      const session = sessions.getOrCreate(req.session_id);
      const { actions, message } = orchestrator.handleEvent(
        session,
        req.event,
        req.context,
        req.error_code ?? req.context.error_code ?? null,
      );
      return {
        session_id: session.id,
        workflow: toView(session.workflow),
        actions,
        message,
        quick_actions: quickActions(session.workflow, req.context),
      };
    }

    case '/assistant/operation': {
      const req = OperationResultRequestSchema.parse(body);
      const session = sessions.getOrCreate(req.session_id);
      session.pending_operation = null;
      return {
        session_id: session.id,
        workflow: toView(session.workflow),
        message: req.allowed
          ? 'درخواست شما به سامانه ارسال شد. چند لحظه صبر کنید.'
          : `سامانه اجازه این کار را نداد${req.reason ? `: ${req.reason}` : '.'}`,
      };
    }

    case '/assistant/feedback': {
      const req = FeedbackRequestSchema.parse(body);
      analytics.feedback(req.helpful);
      return { ok: true };
    }

    default:
      throw new Error(`unknown_path:${path}`);
  }
}

declare global {
  interface Window {
    __ASSISTANT_LOCAL_HANDLER__?: (path: string, body: unknown) => Promise<unknown>;
    AssistantSDK: typeof sdk;
    assistantAnalytics: () => unknown;
  }
}

window.__ASSISTANT_LOCAL_HANDLER__ = handle;
window.AssistantSDK = sdk;
/** Exposed so the §32 metrics can be inspected from the console. */
window.assistantAnalytics = () => analytics.snapshot();
