import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth';
import path from 'path';
import fs from 'fs/promises';
import { nanoid } from 'nanoid';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8MB

export async function uploadRoutes(app: FastifyInstance) {
  app.post(
    '/',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const data = await request.file();
      if (!data) {
        return reply.status(400).send({ error: 'No file provided' });
      }

      if (!ALLOWED_MIME.has(data.mimetype)) {
        return reply.status(400).send({ error: 'Only JPEG, PNG, WebP, and GIF images are allowed' });
      }

      // Read into buffer to check size
      const chunks: Buffer[] = [];
      let totalSize = 0;
      for await (const chunk of data.file) {
        totalSize += chunk.length;
        if (totalSize > MAX_FILE_SIZE) {
          return reply.status(413).send({ error: 'File too large. Maximum size is 8MB.' });
        }
        chunks.push(chunk);
      }

      const ext = data.mimetype.split('/')[1].replace('jpeg', 'jpg');
      const filename = `${nanoid()}.${ext}`;
      const filepath = path.join(UPLOADS_DIR, filename);

      await fs.writeFile(filepath, Buffer.concat(chunks));

      const url = `/files/${filename}`;
      return reply.status(201).send({ url });
    },
  );
}
