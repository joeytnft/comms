/**
 * Usage: npx ts-node scripts/reset-user-password.ts <email> <newPassword>
 * Example: npx ts-node scripts/reset-user-password.ts joe7432@aol.com MyNewPass123
 */
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const [, , email, newPassword] = process.argv;

  if (!email || !newPassword) {
    console.error('Usage: npx ts-node scripts/reset-user-password.ts <email> <newPassword>');
    process.exit(1);
  }

  if (newPassword.length < 8) {
    console.error('Password must be at least 8 characters');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No user found with email: ${email}`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash, accountStatus: 'ACTIVE' } }),
    prisma.refreshToken.deleteMany({ where: { userId: user.id } }),
  ]);

  console.log(`\nPassword updated for ${user.displayName} (${email})`);
  console.log('All existing sessions have been invalidated.');
  console.log(`\nYou can now log in with: ${email} / ${newPassword}\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
