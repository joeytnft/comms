import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthenticationError } from '../utils/errors';

interface JwtPayload {
  userId: string;
  organizationId: string;
  campusId: string | null;
  iat: number;
  exp: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
    organizationId: string;
    campusId: string | null;
  }
}

export async function authenticate(request: FastifyRequest, _reply: FastifyReply) {
  try {
    const token = request.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      throw new AuthenticationError('No token provided');
    }

    const decoded = request.server.jwt.verify<JwtPayload>(token);
    request.userId = decoded.userId;
    request.organizationId = decoded.organizationId;
    request.campusId = decoded.campusId ?? null;
  } catch {
    throw new AuthenticationError('Invalid or expired token');
  }
}
