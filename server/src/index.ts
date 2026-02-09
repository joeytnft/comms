import { buildApp } from './app';
import { env } from './config/env';
import { logger } from './utils/logger';

async function start() {
  const app = await buildApp();

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    logger.info(`Guardian Comm server running on ${env.HOST}:${env.PORT}`);
    logger.info(`Environment: ${env.NODE_ENV}`);
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
}

start();
