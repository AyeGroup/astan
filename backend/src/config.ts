export interface Config {
  port: number;
  apiKey: string | undefined;
  model: string;
  effort: 'low' | 'medium' | 'high';
  llmTimeoutMs: number;
  allowedOrigins: string[];
  sessionTtlMs: number;
  demoDir: string;
  sdkDir: string;
}

export function loadConfig(): Config {
  const origins = (process.env.ALLOWED_ORIGINS ?? '*').split(',').map((o) => o.trim()).filter(Boolean);
  return {
    port: Number(process.env.PORT ?? 8787),
    apiKey: process.env.ANTHROPIC_API_KEY || undefined,
    model: process.env.ASSISTANT_MODEL ?? 'claude-opus-5',
    effort: (process.env.ASSISTANT_EFFORT as Config['effort']) ?? 'low',
    llmTimeoutMs: Number(process.env.ASSISTANT_TIMEOUT_MS ?? 20000),
    allowedOrigins: origins,
    sessionTtlMs: Number(process.env.SESSION_TTL_MINUTES ?? 60) * 60_000,
    demoDir: process.env.DEMO_DIR ?? 'demo',
    sdkDir: process.env.SDK_DIR ?? 'frontend/assistant-sdk/dist',
  };
}
