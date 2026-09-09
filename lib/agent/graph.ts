import { StateGraph } from '@langchain/langgraph'
import { AgentState } from '@/lib/types'
import { researchNode, analyzeNode, draftNode, sendNode } from './nodes'

function routeNext(state: AgentState): string {
  // Nodes set `status` to indicate what should run NEXT,
  // so map the *new* status to the next node.
  switch (state.status) {
    case 'analyzing':
      return 'analyze'
    case 'drafting':
      return 'draft'
    case 'awaiting_approval':
      // Pause for human approval — do NOT go to `send` yet.
      return '__end__'
    case 'sending':
      return 'send'
    default:
      return '__end__'
  }
}

export function createAgentGraph() {
  const workflow = new StateGraph<AgentState>({
    channels: {
      // Nodes already return [...state.messages, newMessage], so just take `next`.
      // Using [...prev, ...next] here would duplicate messages exponentially.
      messages: { value: (prev, next) => next ?? prev },
      query: { value: (prev, next) => next || prev },
      searchResults: { value: (prev, next) => next || prev },
      reportContent: { value: (prev, next) => next || prev },
      analysis: { value: (prev, next) => next || prev },
      emailDraft: { value: (prev, next) => next || prev },
      approved: { value: (prev, next) => next ?? prev },
      status: { value: (prev, next) => next || prev },
      error: { value: (prev, next) => next || prev }
    }
  })

  workflow.addNode('research', researchNode)
  workflow.addNode('analyze', analyzeNode)
  workflow.addNode('draft', draftNode)
  workflow.addNode('send', sendNode)

  workflow.setEntryPoint('research')
  workflow.addConditionalEdges('research', routeNext)
  workflow.addConditionalEdges('analyze', routeNext)
  workflow.addConditionalEdges('draft', routeNext)
  workflow.addEdge('send', '__end__')

  return workflow.compile()
}