import { Resend } from 'resend'

// Lazy-init so a missing env var at build time doesn't crash the module
function getResend() {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    throw new Error('Missing RESEND_API_KEY env var. Add it to .env.local and restart `next dev`.')
  }
  return new Resend(apiKey)
}

// Escape user/LLM text so it can't break the HTML layout
function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Convert the plain-text LLM body to simple email-safe HTML:
// blank line = new paragraph, single newline = line break
function plainTextToHtml(text: string) {
  const escaped = escapeHtml(text.trim())
  const paragraphs = escaped.split(/\r?\n\s*\r?\n/)
  return paragraphs
    .map((p) => `<p style="margin:0 0 12px 0;line-height:1.6">${p.replace(/\r?\n/g, '<br/>')}</p>`)
    .join('')
}

export async function sendEmail(params: {
  to: string
  subject: string
  html: string
}) {
  const to = params.to?.trim()
  const subject = params.subject?.trim()
  const html = params.html?.trim()

  if (!to) throw new Error('No recipient email provided (to is empty)')
  if (!subject) throw new Error('Email subject is empty — draft was lost before sending')
  if (!html) throw new Error('Email body is empty — draft was lost before sending')

  console.log('Sending email to:', to, '| subject:', subject)

  const { data, error } = await getResend().emails.send({
    from: 'Agent <onboarding@resend.dev>',
    // NOTE: Resend test mode (onboarding@resend.dev) can ONLY deliver to
    // the account owner's address or delivered@resend.dev unless you verify
    // a domain. Any other `to` will return an error — surfaced below.
    to,
    subject,
    html: plainTextToHtml(html)
  })

  if (error) {
    throw new Error(`Resend rejected the email: ${error.message}`)
  }

  return data
}