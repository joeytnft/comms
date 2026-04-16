import nodemailer from 'nodemailer';
import { env } from '../config/env';

function createTransport() {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    // Dev fallback: log to console instead of sending
    return null;
  }
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
}

export async function sendPasswordResetEmail(email: string, resetToken: string): Promise<void> {
  const resetUrl = `gathersafe://reset-password?token=${resetToken}`;
  const webUrl = `${env.APP_URL}/reset-password?token=${resetToken}`;

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #1e293b; margin-bottom: 8px;">Reset your password</h2>
      <p style="color: #475569; margin-bottom: 24px;">
        We received a request to reset your GatherSafe password. This link expires in 1 hour.
      </p>
      <a href="${webUrl}"
         style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px;
                border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">
        Reset Password
      </a>
      <p style="color: #94a3b8; font-size: 13px; margin-top: 24px;">
        If you did not request a password reset, you can safely ignore this email.
      </p>
      <p style="color: #94a3b8; font-size: 12px; margin-top: 8px;">
        If the button does not work, open the GatherSafe app and paste this token:<br/>
        <code style="background:#f1f5f9; padding: 2px 6px; border-radius: 4px;">${resetToken}</code>
      </p>
    </div>
  `;

  const transport = createTransport();

  if (!transport) {
    // Dev mode: print to console
    console.log('\n========== PASSWORD RESET ==========');
    console.log(`To: ${email}`);
    console.log(`Reset URL: ${webUrl}`);
    console.log(`App deep link: ${resetUrl}`);
    console.log(`Token: ${resetToken}`);
    console.log('====================================\n');
    return;
  }

  await transport.sendMail({
    from: env.EMAIL_FROM,
    to: email,
    subject: 'Reset your GatherSafe password',
    html,
  });
}
