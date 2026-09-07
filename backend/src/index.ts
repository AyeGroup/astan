import { createApp } from './app.js';
import { logger } from './logger.js';

const { app, sessions, config } = createApp();

const server = app.listen(config.port, () => {
  logger.info('server_started', {
    port: config.port,
    llm: config.apiKey ? config.model : 'rules_only',
    effort: config.effort,
  });
});

const sweeper = setInterval(() => {
  const removed = sessions.sweep();
  if (removed > 0) logger.debug('sessions_swept', { removed, remaining: sessions.size });
}, 60_000);
sweeper.unref();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    logger.info('server_stopping', { signal });
    server.close(() => process.exit(0));
  });
}
