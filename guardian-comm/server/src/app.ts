import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import { Server } from 'socket.io';
import { createServer } from 'http';
import { env } from './config/env';
import { logger } from './utils/logger';

// Route imports — uncomment as implemented
// import { authRoutes } from './routes/auth';
// import { groupRoutes } from './routes/groups';
// import { messageRoutes } from './routes/messages';
// import { alertRoutes } from './routes/alerts';
// import { incidentRoutes } from './routes/incidents';
// import { userRoutes } from './routes/users';

// Socket imports — uncomment as implemented
// import { setupSocketHandlers } from './sockets/socketHandler';

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

  // API routes — uncomment as implemented
  // app.register(authRoutes, { prefix: '/auth' });
  // app.register(groupRoutes, { prefix: '/groups' });
  // app.register(messageRoutes, { prefix: '/groups' });
  // app.register(alertRoutes, { prefix: '/alerts' });
  // app.register(incidentRoutes, { prefix: '/incidents' });
  // app.register(userRoutes, { prefix: '/users' });

  // Socket.IO setup
  // After Fastify is ready, attach Socket.IO to the underlying HTTP server
  app.addHook('onReady', async () => {
    const httpServer = app.server;
    const io = new Server(httpServer, {
      cors: {
        origin: '*', // TODO: Restrict in production
        methods: ['GET', 'POST'],
      },
      transports: ['websocket'],
    });

    // TODO: Uncomment when socket handlers are implemented
    // setupSocketHandlers(io);

    io.on('connection', (socket) => {
      logger.info(`[Socket] Client connected: ${socket.id}`);

      socket.on('disconnect', () => {
        logger.info(`[Socket] Client disconnected: ${socket.id}`);
      });
    });

    logger.info('[Socket.IO] Attached to HTTP server');
  });

  return app;
}
