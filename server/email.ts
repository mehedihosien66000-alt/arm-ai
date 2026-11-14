import { Resend } from 'resend';

export interface EmailSendResult {
  messageId: string;
}

export function getEmailConfigStatus(): {
  configured: boolean;
  missing: string[];
} {
  const missing: string[] = [];
  if (!process.env.RESEND_API_KEY?.trim()) {
    missing.push('RESEND_API_KEY');
  }
  if (!process.env.EMAIL_FROM?.trim()) {
    missing.push('EMAIL_FROM');
  }
  return {
    configured: missing.length === 0,
    missing,
  };
}

export async function sendTransactionalEmail(params: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<EmailSendResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();

  if (!apiKey || !from) {
    const status = getEmailConfigStatus();
    throw Object.assign(
      new Error(
        `Email delivery is not configured on the server (${status.missing.join(', ')} missing). Configure them in Settings > Secrets.`,
      ),
      { statusCode: 503, code: 'EMAIL_NOT_CONFIGURED' },
    );
  }

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from,
    to: [params.to],
    subject: params.subject,
    text: params.text,
    html: params.html,
  });

  if (error || !data?.id) {
    const message =
      error?.message || 'Email provider failed to accept the verification message.';
    throw Object.assign(new Error(message), {
      statusCode: 502,
      code: 'EMAIL_DELIVERY_FAILED',
    });
  }

  return { messageId: data.id };
}
