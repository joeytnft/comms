import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { env } from '../config/env';

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const BUCKET = env.SUPABASE_STORAGE_BUCKET;

const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'jpg',
  'image/heif': 'jpg',
  'audio/m4a': 'm4a',
  'audio/mp4': 'm4a',
  'audio/aac': 'm4a',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
};
const MAX_BYTES = 8 * 1024 * 1024; // 8MB

export async function uploadRoutes(app: FastifyInstance) {
  app.post(
    '/',
    { preHandler: [authenticate] },
    async (request, reply) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const part = await (request as any).file();
      if (!part) {
        return reply.status(400).send({ error: 'No file provided' });
      }

      const mimeType = (part.mimetype ?? '').toString().toLowerCase().trim();
      const ext = ALLOWED_MIME[mimeType];
      if (!ext) {
        return reply.status(400).send({ error: 'Unsupported file type' });
      }

      const chunks: Buffer[] = [];
      for await (const chunk of part.file) {
        chunks.push(chunk as Buffer);
      }
      const buffer = Buffer.concat(chunks);

      if (buffer.byteLength === 0) {
        return reply.status(400).send({ error: 'File is empty' });
      }
      if (buffer.byteLength > MAX_BYTES) {
        return reply.status(413).send({ error: 'File too large (max 8MB)' });
      }

      const filename = `${request.organizationId}/${randomUUID()}.${ext}`;

      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(filename, buffer, { contentType: mimeType, upsert: false });

      if (error) {
        request.log.error(error, 'Supabase storage upload failed');
        return reply.status(500).send({ error: 'Upload failed' });
      }

      const { data: signed, error: signErr } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(filename, 60 * 60 * 24); // 24h
      if (signErr || !signed?.signedUrl) {
        request.log.error({ err: signErr }, 'Supabase signed URL failed');
        return reply.status(500).send({ error: 'Could not generate signed URL' });
      }

      return reply.status(201).send({ url: signed.signedUrl });
    },
  );
}
