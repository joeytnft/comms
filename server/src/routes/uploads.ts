import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth';
import path from 'path';
import fs from 'fs/promises';
import { nanoid } from 'nanoid';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const MAX_BYTES = 8 * 1024 * 1024; // 8MB

interface UploadBody {
  data: string;      // base64-encoded image
  mimeType: string;
}

export async function uploadRoutes(app: FastifyInstance) {
  app.post<{ Body: UploadBody }>(
    '/',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { data, mimeType } = request.body ?? {};

      if (!data || !mimeType) {
        return reply.status(400).send({ error: 'Missing data or mimeType' });
      }

      const ext = ALLOWED_MIME[mimeType];
      if (!ext) {
        return reply.status(400).send({ error: 'Unsupported image type' });
      }

      const buffer = Buffer.from(data, 'base64');
      if (buffer.byteLength > MAX_BYTES) {
        return reply.status(413).send({ error: 'Image too large (max 8MB)' });
      }

      const filename = `${nanoid()}.${ext}`;
      await fs.writeFile(path.join(UPLOADS_DIR, filename), buffer);

      return reply.status(201).send({ url: `/files/${filename}` });
    },
  );
}
