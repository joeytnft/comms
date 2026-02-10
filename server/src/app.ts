import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import { Server } from 'socket.io';
import { env } from './config/env';
import { logger } from './utils/logger';
import { AppError } from './utils/errors';
import { authRoutes } from './routes/auth';
import { userRoutes } from './routes/users';
import { groupRoutes } from './routes/groups';
import { subscriptionRoutes } from './routes/subscriptions';
import { messageRoutes } from './routes/messages';
import { setupSocketHandlers } from './sockets/socketHandler';

// Route imports — uncomment as implemented
// import { alertRoutes } from './routes/alerts';
// import { incidentRoutes } from './routes/incidents';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  });

  // Global error handler
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      reply.status(error.statusCode).send({
        error: error.code || error.name,
        message: error.message,
      });
      return;
    }

    // Fastify validation errors
    if (error.validation) {
      reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: error.message,
      });
      return;
    }

    request.log.error(error);
    reply.status(500).send({
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  });

  // Plugins
  await app.register(cors, {
    origin: true, // TODO: Restrict in production
    credentials: true,
  });

  await app.register(helmet);

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_ACCESS_EXPIRY },
  });

  // Health check
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // API routes
  app.register(authRoutes, { prefix: '/auth' });
  app.register(userRoutes, { prefix: '/users' });
  app.register(groupRoutes, { prefix: '/groups' });
  app.register(subscriptionRoutes, { prefix: '/subscription' });
  app.register(messageRoutes, { prefix: '/groups' });

  // Uncomment as implemented:
  // app.register(alertRoutes, { prefix: '/alerts' });
  // app.register(incidentRoutes, { prefix: '/incidents' });

  // Socket.IO setup
  app.addHook('onReady', async () => {
    const httpServer = app.server;
    const io = new Server(httpServer, {
      cors: {
        origin: '*', // TODO: Restrict in production
        methods: ['GET', 'POST'],
      },
      transports: ['websocket'],
    });

    setupSocketHandlers(io);

    logger.info('[Socket.IO] Attached to HTTP server');
  });

  return app;
}
