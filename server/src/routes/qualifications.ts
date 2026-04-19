import { FastifyInstance } from 'fastify';
import {
  listQualificationTypes,
  createQualificationType,
  updateQualificationType,
  deleteQualificationType,
  getMemberQualifications,
  awardQualification,
  revokeQualification,
  getQualificationsSummary,
} from '../controllers/qualificationController';

export async function qualificationRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (request) => {
    await request.jwtVerify();
    const payload = request.user as { userId: string; organizationId: string };
    request.userId = payload.userId;
    request.organizationId = payload.organizationId;
  });

  // Qualification types (admin-managed)
  app.get('/types', listQualificationTypes);
  app.post('/types', createQualificationType);
  app.put('/types/:id', updateQualificationType);
  app.delete('/types/:id', deleteQualificationType);

  // Org-wide summary
  app.get('/summary', getQualificationsSummary);

  // Per-member qualifications
  app.get('/members/:userId', getMemberQualifications);
  app.post('/members/:userId', awardQualification);
  app.delete('/members/:userId/:qualificationTypeId', revokeQualification);
}
