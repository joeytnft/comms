import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth';
import { createClient } from '@supabase/supabase-js';
import { nanoid } from 'nanoid';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? 'uploads';

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

interface UploadBody {
  data: string;
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
        return reply.status(400).send({ error: 'Unsupported file type' });
      }

      const buffer = Buffer.from(data, 'base64');
      if (buffer.byteLength > MAX_BYTES) {
        return reply.status(413).send({ error: 'File too large (max 8MB)' });
      }

      const filename = `${nanoid()}.${ext}`;

      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(filename, buffer, { contentType: mimeType, upsert: false });

      if (error) {
        request.log.error(error, 'Supabase storage upload failed');
        return reply.status(500).send({ error: 'Upload failed' });
      }

      const { data: publicUrl } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(filename);

      return reply.status(201).send({ url: publicUrl.publicUrl });
    },
  );
}
