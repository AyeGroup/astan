import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { ACTION_TARGETS, ACTION_TYPES, HELP_TOPICS, REQUESTABLE_OPERATIONS, SAFE_ROUTES } from '@astan/contracts';
import { SYSTEM_PROMPT, buildContextBlock, type PromptContextInput } from './system-prompt.js';
import { logger } from '../logger.js';

/**
 * The model's output schema (سند §25). Loose on purpose: `actions` is a plain
 * object array rather than a discriminated union, because a schema violation
 * from the model would fail the whole turn, whereas a malformed action should
 * only cost us that action. The policy engine does the strict parse.
 */
const LlmActionSchema = z.object({
  type: z.enum(ACTION_TYPES),
  target: z.enum(ACTION_TARGETS).nullable(),
  route: z.enum(SAFE_ROUTES).nullable(),
  topic: z.enum(HELP_TOPICS).nullable(),
  operation: z.enum(REQUESTABLE_OPERATIONS).nullable(),
  message: z.string().max(300).nullable(),
  title: z.string().max(120).nullable(),
  body: z.string().max(600).nullable(),
});

const LlmResponseSchema = z.object({
  message: z.string().max(900),
  tone: z.enum(['helpful', 'reassuring', 'instructional', 'apologetic']),
  grounded: z.boolean(),
  actions: z.array(LlmActionSchema).max(3),
  needs_human: z.boolean(),
});

export type LlmResponse = z.infer<typeof LlmResponseSchema>;

/** Drop the nulls the schema forces on us, so the strict parser sees clean input. */
export function toActionCandidates(actions: LlmResponse['actions']): unknown[] {
  return actions.map((a) => {
    const out: Record<string, unknown> = { type: a.type };
    if (a.target) out.target = a.target;
    if (a.route) out.route = a.route;
    if (a.topic) out.topic = a.topic;
    if (a.operation) out.operation = a.operation;
    if (a.message) out.message = a.message;
    if (a.title) out.title = a.title;
    if (a.body) out.body = a.body;
    if (a.type === 'request_operation') out.requires_confirmation = true;
    if (a.type === 'start_guided_mode') out.workflow_id = 'VIEW_NOTIFICATION';
    return out;
  });
}

export interface LlmConfig {
  apiKey: string | undefined;
  model: string;
  effort: 'low' | 'medium' | 'high';
  timeoutMs: number;
}

export interface LlmTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * What the orchestrator actually needs from a language model. Depending on
 * this rather than on the concrete client keeps the Anthropic SDK out of any
 * build that does not call it — the offline demo bundle, for one.
 */
export interface LlmEngine {
  readonly enabled: boolean;
  respond(context: PromptContextInput, history: LlmTurn[], userMessage: string): Promise<LlmResponse | null>;
}

export class LlmClient implements LlmEngine {
  private readonly client: Anthropic | null;

  constructor(private readonly config: LlmConfig) {
    this.client = config.apiKey ? new Anthropic({ apiKey: config.apiKey, timeout: config.timeoutMs }) : null;
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  /**
   * Ask the model to phrase the answer. Returns null on any failure — the
   * caller then ships the deterministic baseline, so an API outage degrades
   * the wording, never the guidance.
   */
  async respond(context: PromptContextInput, history: LlmTurn[], userMessage: string): Promise<LlmResponse | null> {
    if (!this.client) return null;
    try {
      const response = await this.client.beta.messages.parse({
        model: this.config.model,
        max_tokens: 2000,
        // The system prompt is byte-stable across every request, so it caches;
        // the volatile per-turn context sits in messages, after the breakpoint.
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        output_config: { effort: this.config.effort },
        output_format: betaZodOutputFormat(LlmResponseSchema),
        messages: [
          ...history.map((t) => ({ role: t.role, content: t.content })),
          { role: 'user' as const, content: `${buildContextBlock(context)}\n\n# USER_MESSAGE\n${userMessage}` },
        ],
      });

      if (response.stop_reason === 'refusal') {
        // A refusal means the model declined this turn — ship the deterministic
        // baseline rather than an empty bubble.
        logger.warn('llm_refusal', {});
        return null;
      }
      return response.parsed_output ?? null;
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        logger.warn('llm_api_error', { status: error.status, name: error.name });
      } else {
        logger.warn('llm_error', { message: error instanceof Error ? error.message : String(error) });
      }
      return null;
    }
  }
}
