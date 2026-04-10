import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import staticFiles from '@fastify/static';
import { Server } from 'socket.io';
import path from 'path';
import { env } from './config/env';
import { logger } from './utils/logger';
import { AppError } from './utils/errors';
import { authRoutes } from './routes/auth';
import { userRoutes } from './routes/users';
import { groupRoutes } from './routes/groups';
import { subscriptionRoutes } from './routes/subscriptions';
import { messageRoutes } from './routes/messages';
import { pttRoutes } from './routes/ptt';
import { alertRoutes } from './routes/alerts';
import { locationRoutes } from './routes/location';
import { incidentRoutes } from './routes/incidents';
import { uploadRoutes } from './routes/uploads';
import { pttLogRoutes } from './routes/pttLogs';
import { geofenceRoutes } from './routes/geofence';
import { scheduleRoutes } from './routes/schedule';
import { campusRoutes } from './routes/campuses';
import { setupSocketHandlers } from './sockets/socketHandler';

export async function buildApp() {
  const app = Fastify({
    bodyLimit: 10 * 1024 * 1024, // 10MB (for image uploads)
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
    origin: env.NODE_ENV === 'production'
      ? (env.CORS_ORIGINS?.split(',') ?? [])
      : true,
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

  await app.register(multipart, {
    limits: { fileSize: 8 * 1024 * 1024 }, // 8MB per file
  });

  await app.register(staticFiles, {
    root: path.join(process.cwd(), 'uploads'),
    prefix: '/files/',
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
  app.register(pttRoutes, { prefix: '/ptt' });
  app.register(alertRoutes, { prefix: '/alerts' });
  app.register(locationRoutes, { prefix: '/location' });
  app.register(incidentRoutes, { prefix: '/incidents' });
  app.register(uploadRoutes, { prefix: '/upload' });
  app.register(pttLogRoutes, { prefix: '/ptt-logs' });
  app.register(geofenceRoutes, { prefix: '/geofence' });
  app.register(scheduleRoutes, { prefix: '/schedule' });
  app.register(campusRoutes, { prefix: '/campuses' });

  // Socket.IO setup
  app.addHook('onReady', async () => {
    const httpServer = app.server;
    const io = new Server(httpServer, {
      cors: {
        origin: env.NODE_ENV === 'production'
          ? (env.CORS_ORIGINS?.split(',') ?? [])
          : '*',
        methods: ['GET', 'POST'],
      },
      transports: ['websocket'],
    });

    setupSocketHandlers(io);

    logger.info('[Socket.IO] Attached to HTTP server');
  });

  return app;
}
