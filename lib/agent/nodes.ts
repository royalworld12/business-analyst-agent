import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { HumanMessage, AIMessage } from '@langchain/core/messages'
import { AgentState } from '@/lib/types'
import { researchTopic } from '@/lib/services/research'
import { sendEmail } from '../services/email'

// Model resolution: env override first, then known-good defaults.
// `gemini-2.0-flash` was retired by Google (404) — don't hardcode it.
function getApiKey() {
  return (
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    ''
  )
}

function getPrimaryModel() {
  return (
    process.env.GOOGLE_MODEL ||
    process.env.GOOGLE_GENAI_MODEL ||
    'gemini-3.6-flash'
  )
}

function createLLM(model: string) {
  const apiKey = getApiKey()
  if (!apiKey) {
    throw new Error(
      'Missing Google API key. Set GOOGLE_GENERATIVE_AI_API_KEY (or GOOGLE_API_KEY) in .env.local and restart `next dev`.'
    )
  }
  return new ChatGoogleGenerativeAI({ model, apiKey })
}

// Try primary model, fall back across known models on 404/retired errors.
async function invokeWithFallback(prompt: string): Promise<string> {
  const candidates = [
    getPrimaryModel(),
    'gemini-2.5-flash',
    'gemini-1.5-flash',
    // Last resort: whatever Google currently suggests
    'gemini-3.6-flash'
  ].filter((m, i, arr) => m && arr.indexOf(m) === i)

  let lastError: unknown = null
  for (const model of candidates) {
    try {
      const llm = createLLM(model)
      const response = await llm.invoke([new HumanMessage(prompt)])
      return response.content as string
    } catch (error) {
      lastError = error
      const msg = error instanceof Error ? error.message : String(error)
      const isRetired =
        msg.includes('404') ||
        msg.toLowerCase().includes('not found') ||
        msg.toLowerCase().includes('no longer available') ||
        msg.toLowerCase().includes('not supported')
      // Only fall through to next model for retired/unknown-model errors
      if (!isRetired) throw error
      console.warn(`Model ${model} unavailable, trying fallback... (${msg.slice(0, 200)})`)
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`All Gemini models failed. Last error: ${String(lastError)}`)
}

// Node 1: Research
export async function researchNode(state: AgentState): Promise<Partial<AgentState>> {
  try {
    const results = await researchTopic(state.query)

    return {
      searchResults: results.results,
      reportContent: results.results[0].fullContent,
      status: 'analyzing',
      messages: [
        ...state.messages,
        new AIMessage(`Found report: ${results.results[0].title}`)
      ]
    }
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

// Node 2: Analyze
export async function analyzeNode(state: AgentState): Promise<Partial<AgentState>> {
  try {
    const prompt = `Analyze this earnings report and extract:
1. A 2-sentence summary
2. Key financial metrics (3-5 bullets)
3. Top risks (3-5 bullets)
4. Opportunities (3-5 bullets)

Report:
${state.reportContent}

Return ONLY valid JSON with keys: summary, keyMetrics, risks, opportunities (no markdown fences)`

    const rawContent = await invokeWithFallback(prompt)

    // Strip markdown code fences if the model adds them
    const cleaned = rawContent
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim()

    const analysis = JSON.parse(cleaned)

    return {
      analysis,
      status: 'drafting',
      messages: [
        ...state.messages,
        new AIMessage('Analysis complete')
      ]
    }
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
      messages: [
        ...state.messages,
        new AIMessage(`Analysis failed: ${error instanceof Error ? error.message : String(error)}`)
      ]
    }
  }
}

// Node 3: Draft Email
export async function draftNode(state: AgentState): Promise<Partial<AgentState>> {
  try {
    const prompt = `Write a professional business email summarizing this earnings analysis.

Analysis:
${JSON.stringify(state.analysis, null, 2)}

Original query: ${state.query}

Return ONLY valid JSON (no markdown fences) with exactly two keys:
{
  "subject": "a short email subject line, max 78 chars, no 'Subject:' prefix",
  "body": "the email greeting + paragraphs. Use PLAIN TEXT only: no markdown (no **, no ###, no *, no _), no 'Subject:' line inside the body, use blank lines between sections. End with 'Best regards' + placeholder name."
}`

    const rawContent = await invokeWithFallback(prompt)

    // Strip markdown code fences if the model adds them
    const cleaned = rawContent
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim()

    let subject = `${state.query.slice(0, 60)} — Analysis`
    let emailBody = cleaned

    try {
      const parsed = JSON.parse(cleaned)
      if (parsed.subject) subject = String(parsed.subject).trim()
      if (parsed.body) emailBody = String(parsed.body).trim()
    } catch {
      // Model ignored JSON instruction — use raw text, strip leading Subject line
      emailBody = cleaned
    }

    // Defensive cleanup: model sometimes still prefixes "Subject: ..." inside body
    emailBody = emailBody
      .replace(/^\s*(Subject|Re):\s*.*\r?\n+/i, '')
      .trim()

    // Preserve the recipient the user typed in the UI (`route.ts` stores it in
    // `emailDraft.recipient`). Fall back to env default only if none was given.
    const recipient =
      state.emailDraft?.recipient || process.env.RECIPIENT_EMAIL || ''

    return {
      emailDraft: {
        subject,
        body: emailBody,
        recipient
      },
      status: 'awaiting_approval',
      messages: [
        ...state.messages,
        new AIMessage('Draft ready for review')
      ]
    }
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
      messages: [
        ...state.messages,
        new AIMessage(`Draft failed: ${error instanceof Error ? error.message : String(error)}`)
      ]
    }
  }
}

// Node 4: Send Email
export async function sendNode(state: AgentState): Promise<Partial<AgentState>> {
  if (!state.approved) {
    return {
      status: 'awaiting_approval',
      messages: [
        ...state.messages,
        new AIMessage('Awaiting approval before sending')
      ]
    }
  }

  try {
    const recipient = state.emailDraft?.recipient || ''

    if (!recipient) {
      throw new Error('No recipient email provided')
    }

    await sendEmail({
      to: recipient,
      subject: state.emailDraft?.subject || '',
      html: state.emailDraft?.body || ''
    })

    return {
      status: 'complete',
      messages: [
        ...state.messages,
        new AIMessage(`Email sent to ${recipient}`)
      ]
    }
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
      messages: [
        ...state.messages,
        new AIMessage(`Failed to send email: ${error instanceof Error ? error.message : String(error)}`)
      ]
    }
  }
}