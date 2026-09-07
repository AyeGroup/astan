import {
  PAGE_TITLES_FA,
  type AssistantAction,
  type AssistantResponse,
  type ErrorCode,
  type PageContext,
  type SystemEvent,
} from '@astan/contracts';
import { ACTION_TYPES } from '@astan/contracts';
import type { AnalyticsSink } from '../analytics/index.js';
import { toPromptBlock } from '../knowledge-base/index.js';
import { allowedTargets, enforce, sanitizeUserText, shouldOfferHumanHandoff } from '../policy-engine/index.js';
import type { AssistantSession, SessionStore } from '../session/store.js';
import {
  applyEvent,
  getStep,
  getWorkflow,
  reconcileWithPage,
  startWorkflow,
  stepGuidance,
  toView,
} from '../workflow-engine/index.js';
import { detectIntent } from './intent.js';
import { LlmClient, toActionCandidates } from './llm.js';
import { answer, quickActions, type RuleAnswer } from './rules.js';
import { logger } from '../logger.js';

/**
 * Agent Orchestrator (سند §12).
 *
 * Pipeline per turn:
 *   sanitize → detect intent → reconcile workflow with page → rule answer
 *   → (optional) LLM rephrasing → policy enforcement → response contract.
 *
 * The rule answer is computed *before* the LLM call, not as a fallback after
 * it. That ordering is what lets us hand the model a grounded baseline and
 * validate its output against something, instead of trusting it.
 */
export class AgentOrchestrator {
  constructor(
    private readonly sessions: SessionStore,
    private readonly llm: LlmClient,
    private readonly analytics: AnalyticsSink,
  ) {}

  /** Sync page context; returns proactive guidance when guided mode is on. */
  handleContext(session: AssistantSession, context: PageContext): {
    actions: AssistantAction[];
    message: string | null;
  } {
    const before = session.workflow.current_step;
    session.workflow = reconcileWithPage(session.workflow, context);
    session.context = context;

    if (session.workflow.workflow_id && session.workflow.current_step && session.workflow.current_step !== before) {
      this.analytics.stepEntered(session.workflow.workflow_id, session.workflow.current_step);
    }

    if (!session.workflow.guided_mode) return { actions: [], message: null };
    return this.guide(session, context, before !== session.workflow.current_step);
  }

  /** Apply a site event and return the guidance for the step it landed on. */
  handleEvent(
    session: AssistantSession,
    event: SystemEvent,
    context: PageContext,
    errorCode: ErrorCode | null,
  ): { actions: AssistantAction[]; message: string | null } {
    const previous = session.workflow.current_step;
    session.workflow = applyEvent(session.workflow, event.type);
    session.context = context;

    const wf = session.workflow.workflow_id;
    if (wf && session.workflow.current_step) {
      if (session.workflow.current_step !== previous) {
        this.analytics.stepEntered(wf, session.workflow.current_step);
      }
      if (errorCode) this.analytics.stepFailed(wf, session.workflow.current_step, errorCode);
    }

    if (session.workflow.completed && wf && session.workflow.started_at) {
      this.analytics.workflowCompleted(wf, Date.now() - new Date(session.workflow.started_at).getTime());
      return {
        actions: [{ type: 'clear_highlights' }],
        message: 'ابلاغیه شما دریافت شد. اگر کار دیگری داشتید، همین‌جا در خدمتم.',
      };
    }

    // An error the site reported is more urgent than the next-step nudge.
    if (errorCode) {
      const rule = answer('UNKNOWN', '', session, { ...context, error_code: errorCode });
      const decision = enforce({ actions: rule.actions, state: session.workflow, context });
      this.recordActions(decision);
      if (rule.instruction) session.last_instruction = rule.instruction;
      return { actions: decision.allowed, message: rule.message };
    }

    if (!session.workflow.guided_mode) return { actions: [], message: null };
    return this.guide(session, context, session.workflow.current_step !== previous);
  }

  /**
   * Emit step guidance, but only when it would tell the user something new.
   *
   * "New" is not the same as "the step changed": a page often renders its
   * target after the navigation event fires (an async list, a modal), so the
   * first attempt has nothing to point at. Keying on the target we last
   * pointed at re-issues guidance exactly once when the element finally
   * appears, while still swallowing duplicate events on a settled page.
   */
  private guide(
    session: AssistantSession,
    context: PageContext,
    stepChanged: boolean,
  ): { actions: AssistantAction[]; message: string | null } {
    const guidance = stepGuidance(session.workflow, context);
    if (!guidance) return { actions: [], message: null };

    const decision = enforce({ actions: guidance.suggested_actions, state: session.workflow, context });
    const pointed = decision.allowed.find((a) => a.type === 'highlight_element');
    const target = pointed && 'target' in pointed ? pointed.target : null;

    if (!stepChanged && target === session.last_pointed_target) {
      return { actions: [], message: null };
    }

    session.last_pointed_target = target;
    session.last_instruction = {
      title: guidance.step.title,
      body: guidance.step.description,
      simple: guidance.step.simple_description,
    };
    this.recordActions(decision);
    return { actions: decision.allowed, message: guidance.step.description };
  }

  /** Full conversational turn. */
  async handleMessage(session: AssistantSession, rawMessage: string, context: PageContext): Promise<AssistantResponse> {
    const { text: safeMessage, redactions } = sanitizeUserText(rawMessage);
    for (const rule of redactions) this.analytics.redaction(rule);

    session.workflow = reconcileWithPage(session.workflow, context);
    session.context = context;

    const { intent, confidence } = detectIntent(safeMessage, context);
    this.sessions.appendTurn(session, { role: 'user', text: safeMessage, intent, at: new Date().toISOString() });

    // Rule engine first — this is the grounded baseline, and the fallback.
    const baseline = answer(intent, safeMessage, session, context);

    if (baseline.startWorkflow && session.workflow.workflow_id !== baseline.startWorkflow) {
      session.workflow = startWorkflow(baseline.startWorkflow, baseline.guided ?? true);
      this.analytics.workflowStarted(baseline.startWorkflow);
      session.workflow = reconcileWithPage(session.workflow, context);
      const guidance = stepGuidance(session.workflow, context);
      if (guidance) {
        baseline.actions = [...baseline.actions, ...guidance.suggested_actions];
        baseline.instruction = {
          title: guidance.step.title,
          body: guidance.step.description,
          simple: guidance.step.simple_description,
        };
        baseline.message = `${baseline.message}\n\n${guidance.step.description}`;
      }
    } else if (baseline.guided) {
      session.workflow = { ...session.workflow, guided_mode: true };
    }

    const redactionNotice = redactions.length
      ? 'کاربر اطلاعات حساس نوشته بود که حذف شد. به او یادآوری کن که نیازی به ارسال رمز یا کد ملی نیست.'
      : null;

    let message = baseline.message;
    let tone = baseline.tone;
    let grounded = baseline.grounded;
    let candidateActions: unknown[] = baseline.actions;
    let source: AssistantResponse['source'] = 'rules';
    let needsHuman = false;

    if (this.llm.enabled && intent !== 'OUT_OF_SCOPE') {
      const step = getStep(session.workflow);
      const view = toView(session.workflow);
      const llmResult = await this.llm.respond(
        {
          pageTitle: PAGE_TITLES_FA[context.page_id],
          pageId: context.page_id,
          workflowTitle: session.workflow.workflow_id ? getWorkflow(session.workflow.workflow_id).title : null,
          stepId: step?.step_id ?? null,
          stepTitle: step?.title ?? null,
          stepDescription: step?.description ?? null,
          stepSimple: step?.simple_description ?? null,
          nextStep: view.next_step,
          position: view.position,
          total: view.total,
          errorCode: context.error_code,
          failureCount: session.workflow.failure_count,
          allowedTargets: allowedTargets(session.workflow, context),
          allowedActionTypes: [...ACTION_TYPES],
          knowledge: toPromptBlock(baseline.sources),
          baselineAnswer: baseline.message,
          recentEvents: context.system_events.slice(-5).map((e) => e.type),
          detectedIntent: `${intent} (اطمینان ${confidence})`,
          redactionNotice,
        },
        session.history.slice(-6).map((t) => ({ role: t.role, content: t.text })),
        safeMessage,
      );

      if (llmResult) {
        message = llmResult.message;
        tone = llmResult.tone;
        grounded = llmResult.grounded;
        needsHuman = llmResult.needs_human;
        // Union of both proposals: the model may add a tooltip the rules did
        // not think of, and the policy engine drops anything illegitimate.
        candidateActions = [...toActionCandidates(llmResult.actions), ...baseline.actions];
        source = 'llm';
      } else {
        source = 'llm_fallback_rules';
      }
    }

    if (redactions.length) {
      message = `برای امنیت خودتان لازم نیست رمز، کد یکبارمصرف یا کد ملی را با من در میان بگذارید؛ من هم آن را ذخیره نکردم.\n\n${message}`;
    }

    const decision = enforce({ actions: candidateActions, state: session.workflow, context });
    this.recordActions(decision);

    let actions = dedupeActions(decision.allowed);
    const offerHandoff = needsHuman || shouldOfferHumanHandoff(session.workflow, context) || intent === 'HUMAN_SUPPORT';
    if (offerHandoff && !session.handoff_offered && intent !== 'HUMAN_SUPPORT') {
      message += '\n\nاگر مایل باشید، شما را به بخش پشتیبانی راهنمایی کنم.';
      const handoffAction: AssistantAction = { type: 'offer_human_support', reason: 'repeated_failure' };
      actions = [...actions, handoffAction].slice(0, 4);
      session.handoff_offered = true;
      this.analytics.handoffOffered();
    } else if (intent === 'HUMAN_SUPPORT') {
      session.handoff_offered = true;
      this.analytics.handoffOffered();
    }

    if (baseline.instruction) session.last_instruction = baseline.instruction;
    if (intent === 'SIMPLE_EXPLANATION') this.analytics.clarificationRequested();
    if (intent === 'UNKNOWN') this.analytics.unanswered(intent);
    this.analytics.messageHandled(intent, grounded, source);
    this.sessions.appendTurn(session, { role: 'assistant', text: message, at: new Date().toISOString() });

    logger.info('message_handled', {
      intent, source, grounded, page: context.page_id,
      step: session.workflow.current_step, actions: actions.length,
      rejected: decision.rejected.length, redactions: redactions.length,
    });

    return {
      session_id: session.id,
      response: { message, tone, grounded },
      workflow: toView(session.workflow),
      actions,
      quick_actions: quickActions(session.workflow, context),
      intent,
      rejected_actions: decision.rejected,
      human_handoff_offered: offerHandoff,
      source,
    };
  }

  private recordActions(decision: { allowed: AssistantAction[]; rejected: { reason: string }[] }): void {
    for (const a of decision.allowed) this.analytics.actionEmitted(a.type);
    for (const r of decision.rejected) this.analytics.actionRejected(r.reason);
  }
}

/** Collapse duplicates so the page never gets two highlights on one element. */
function dedupeActions(actions: AssistantAction[]): AssistantAction[] {
  const seen = new Set<string>();
  const out: AssistantAction[] = [];
  for (const action of actions) {
    const key = `${action.type}:${'target' in action ? action.target : ''}${'route' in action ? action.route : ''}${'operation' in action ? action.operation : ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(action);
  }
  return out;
}

export { quickActions };
