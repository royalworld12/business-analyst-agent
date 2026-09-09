import { createAgentGraph } from '@/lib/agent/graph'
import { sendNode } from '@/lib/agent/nodes'
import { HumanMessage } from '@langchain/core/messages'

export const maxDuration = 60

export async function POST(req: Request) {
  const body = await req.json()
  const { query, approved, recipient } = body

  // --- Approval path: send the already-approved draft, don't re-run research ---
  if (approved) {
    // Frontend sends back the full agent state (analysis + emailDraft).
    // Fall back to minimal reconstruction for backwards compatibility.
    const draft = body.emailDraft ?? (recipient ? { recipient } : undefined)

    const sendState: Record<string, unknown> = {
      messages: body.messages ?? [new HumanMessage(query ?? '')],
      query: query ?? draft?.subject ?? '',
      status: 'sending' as const,
      approved: true,
      analysis: body.analysis,
      searchResults: body.searchResults,
      reportContent: body.reportContent,
      emailDraft: {
        subject: draft?.subject ?? '',
        body: draft?.body ?? '',
        // Never lose the recipient: prefer explicit field, then draft, then env
        recipient: recipient || draft?.recipient || process.env.RECIPIENT_EMAIL || ''
      }
    }

    try {
      // Run only the send node — no re-search, no re-draft
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await sendNode(sendState as any)
      return Response.json({ ...sendState, ...result })
    } catch (error) {
      return Response.json(
        {
          ...sendState,
          status: 'error',
          error: error instanceof Error ? error.message : String(error)
        },
        { status: 500 }
      )
    }
  }

  // --- Initial research path ---
  const graph = createAgentGraph()

  const initialState = {
    messages: [new HumanMessage(query)],
    query,
    status: 'searching' as const,
    approved,
    // Pass a full-shape draft so LangGraph v1's strict Annotation type accepts it.
    emailDraft: recipient ? { subject: '', body: '', recipient } : undefined
  }

  try {
    const result = await graph.invoke(initialState)
    return Response.json(result)
  } catch (error) {
    return Response.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        query
      },
      { status: 500 }
    )
  }
}