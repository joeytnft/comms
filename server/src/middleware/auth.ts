import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthenticationError } from '../utils/errors';

interface JwtPayload {
  userId: string;
  organizationId: string;
  iat: number;
  exp: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
    organizationId: string;
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    const token = request.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      throw new AuthenticationError('No token provided');
    }

    const decoded = request.server.jwt.verify<JwtPayload>(token);
    request.userId = decoded.userId;
    request.organizationId = decoded.organizationId;
  } catch {
    throw new AuthenticationError('Invalid or expired token');
  }
}
