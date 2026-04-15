import { buildApp } from './app';
import { env } from './config/env';
import { logger } from './utils/logger';
import { prisma } from './config/database';

async function start() {
const app = await buildApp();

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);
    try {
      await app.close();
      await prisma.$disconnect();
      logger.info('Server shut down successfully');
      process.exit(0);
    } catch (err) {
      logger.error(err, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    logger.info(`GatherSafe server running on ${env.HOST}:${env.PORT}`);
    logger.info(`Environment: ${env.NODE_ENV}`);
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
}

start();
