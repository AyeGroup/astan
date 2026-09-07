import type { ErrorCode, Intent, StepId, WorkflowId } from '@astan/contracts';

/**
 * Analytics (سند §32، §33). In-process counters with a narrow interface so a
 * real sink (ClickHouse, Elastic) can replace the implementation without
 * touching call sites. Records are aggregate-only — no session content.
 */
export interface AnalyticsSink {
  workflowStarted(workflow: WorkflowId): void;
  workflowCompleted(workflow: WorkflowId, durationMs: number): void;
  stepEntered(workflow: WorkflowId, step: StepId): void;
  stepFailed(workflow: WorkflowId, step: StepId, error: ErrorCode): void;
  messageHandled(intent: Intent, grounded: boolean, source: string): void;
  unanswered(intent: Intent): void;
  actionEmitted(type: string): void;
  actionRejected(reason: string): void;
  redaction(rule: string): void;
  handoffOffered(): void;
  clarificationRequested(): void;
  feedback(helpful: boolean): void;
  snapshot(): AnalyticsSnapshot;
}

export interface AnalyticsSnapshot {
  workflow: {
    started: Record<string, number>;
    completed: Record<string, number>;
    step_entries: Record<string, number>;
    step_failures: Record<string, number>;
    avg_completion_ms: Record<string, number>;
    /** 1 − completed/started, the KPI in سند §33. */
    drop_off_rate: Record<string, number>;
  };
  assistant: {
    messages: number;
    intents: Record<string, number>;
    unanswered: Record<string, number>;
    grounded_ratio: number;
    sources: Record<string, number>;
  };
  ux: {
    actions: Record<string, number>;
    rejected_actions: Record<string, number>;
    redactions: Record<string, number>;
    clarifications: number;
    handoffs_offered: number;
    feedback_positive: number;
    feedback_negative: number;
  };
}

const bump = (rec: Record<string, number>, key: string, by = 1): void => {
  rec[key] = (rec[key] ?? 0) + by;
};

export class InMemoryAnalytics implements AnalyticsSink {
  private started: Record<string, number> = {};
  private completed: Record<string, number> = {};
  private stepEntries: Record<string, number> = {};
  private stepFailures: Record<string, number> = {};
  private durations: Record<string, number[]> = {};
  private messages = 0;
  private grounded = 0;
  private intents: Record<string, number> = {};
  private unansweredIntents: Record<string, number> = {};
  private sources: Record<string, number> = {};
  private actions: Record<string, number> = {};
  private rejected: Record<string, number> = {};
  private redactions: Record<string, number> = {};
  private clarifications = 0;
  private handoffs = 0;
  private positive = 0;
  private negative = 0;

  workflowStarted(workflow: WorkflowId): void { bump(this.started, workflow); }

  workflowCompleted(workflow: WorkflowId, durationMs: number): void {
    bump(this.completed, workflow);
    (this.durations[workflow] ??= []).push(durationMs);
  }

  stepEntered(workflow: WorkflowId, step: StepId): void { bump(this.stepEntries, `${workflow}:${step}`); }
  stepFailed(workflow: WorkflowId, step: StepId, error: ErrorCode): void { bump(this.stepFailures, `${workflow}:${step}:${error}`); }

  messageHandled(intent: Intent, grounded: boolean, source: string): void {
    this.messages++;
    if (grounded) this.grounded++;
    bump(this.intents, intent);
    bump(this.sources, source);
  }

  unanswered(intent: Intent): void { bump(this.unansweredIntents, intent); }
  actionEmitted(type: string): void { bump(this.actions, type); }
  actionRejected(reason: string): void { bump(this.rejected, reason); }
  redaction(rule: string): void { bump(this.redactions, rule); }
  handoffOffered(): void { this.handoffs++; }
  clarificationRequested(): void { this.clarifications++; }
  feedback(helpful: boolean): void { helpful ? this.positive++ : this.negative++; }

  snapshot(): AnalyticsSnapshot {
    const avg: Record<string, number> = {};
    const dropOff: Record<string, number> = {};
    for (const [wf, list] of Object.entries(this.durations)) {
      avg[wf] = Math.round(list.reduce((a, b) => a + b, 0) / list.length);
    }
    for (const [wf, startCount] of Object.entries(this.started)) {
      const done = this.completed[wf] ?? 0;
      dropOff[wf] = startCount === 0 ? 0 : Number((1 - done / startCount).toFixed(3));
    }
    return {
      workflow: {
        started: { ...this.started },
        completed: { ...this.completed },
        step_entries: { ...this.stepEntries },
        step_failures: { ...this.stepFailures },
        avg_completion_ms: avg,
        drop_off_rate: dropOff,
      },
      assistant: {
        messages: this.messages,
        intents: { ...this.intents },
        unanswered: { ...this.unansweredIntents },
        grounded_ratio: this.messages === 0 ? 1 : Number((this.grounded / this.messages).toFixed(3)),
        sources: { ...this.sources },
      },
      ux: {
        actions: { ...this.actions },
        rejected_actions: { ...this.rejected },
        redactions: { ...this.redactions },
        clarifications: this.clarifications,
        handoffs_offered: this.handoffs,
        feedback_positive: this.positive,
        feedback_negative: this.negative,
      },
    };
  }
}
