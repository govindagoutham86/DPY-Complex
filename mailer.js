const nodemailer = require('nodemailer');

const smtpConfigured = Boolean(
  process.env.SMTP_HOST &&
  process.env.SMTP_USER &&
  process.env.SMTP_PASS &&
  process.env.LEASING_TEAM_EMAIL
);

let transporter = null;
if (smtpConfigured) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

async function sendInquiryNotification(inquiry) {
  if (!smtpConfigured) {
    console.warn('[mailer] SMTP is not fully configured. Inquiry saved without email:', inquiry.id);
    return {
      sent: false,
      teamSent: false,
      customerSent: false,
      reason: 'smtp_not_configured'
    };
  }

  const teamEmail = process.env.LEASING_TEAM_EMAIL;
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  const result = { sent: false, teamSent: false, customerSent: false };

  try {
    await transporter.sendMail({
      from,
      to: teamEmail,
      replyTo: inquiry.email,
      subject: `New leasing enquiry — ${inquiry.name} (${inquiry.category || 'General'})`,
      text: [
        `Name: ${inquiry.name}`,
        `Company: ${inquiry.company || '-'}`,
        `Phone: ${inquiry.phone}`,
        `Email: ${inquiry.email}`,
        `Category: ${inquiry.category || '-'}`,
        `Preferred size: ${inquiry.preferred_size || '-'}`,
        `Shop ID: ${inquiry.shop_id || '-'}`,
        '',
        'Message:',
        inquiry.message || '(none)'
      ].join('\n')
    });
    result.teamSent = true;
  } catch (err) {
    console.error('[mailer] leasing-team email failed:', err.message);
    result.teamError = err.message;
  }

  try {
    await transporter.sendMail({
      from,
      to: inquiry.email,
      subject: 'We received your enquiry — DPY Complex',
      text: `Hi ${inquiry.name},\n\nThanks for your interest in DPY Complex. Our leasing team has received your enquiry and will be in touch within one business day.\n\nBest,\nDPY Complex Leasing Team`
    });
    result.customerSent = true;
  } catch (err) {
    console.error('[mailer] customer acknowledgement failed:', err.message);
    result.customerError = err.message;
  }

  result.sent = result.teamSent || result.customerSent;
  return result;
}

module.exports = { sendInquiryNotification, smtpConfigured };
