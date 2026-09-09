import { StateGraph, Annotation, START, END } from '@langchain/langgraph'
import { BaseMessage } from '@langchain/core/messages'
import { AgentState } from '@/lib/types'
import { researchNode, analyzeNode, draftNode, sendNode } from './nodes'

// LangGraph v1 uses Annotation.Root instead of the old `channels` object.
const AgentAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    // Nodes already return [...state.messages, newMessage], so just take `next`.
    // Using [...prev, ...next] here would duplicate messages exponentially.
    reducer: (prev, next) => next ?? prev,
    default: () => [],
  }),
  query: Annotation<string>({
    reducer: (prev, next) => next || prev,
    default: () => '',
  }),
  searchResults: Annotation<AgentState['searchResults']>({
    reducer: (prev, next) => next || prev,
    default: () => undefined,
  }),
  reportContent: Annotation<AgentState['reportContent']>({
    reducer: (prev, next) => next || prev,
    default: () => undefined,
  }),
  analysis: Annotation<AgentState['analysis']>({
    reducer: (prev, next) => next || prev,
    default: () => undefined,
  }),
  emailDraft: Annotation<AgentState['emailDraft']>({
    reducer: (prev, next) => next || prev,
    default: () => undefined,
  }),
  approved: Annotation<AgentState['approved']>({
    reducer: (prev, next) => next ?? prev,
    default: () => undefined,
  }),
  status: Annotation<AgentState['status']>({
    reducer: (prev, next) => next || prev,
    default: () => 'idle' as const,
  }),
  error: Annotation<AgentState['error']>({
    reducer: (prev, next) => next || prev,
    default: () => undefined,
  }),
})

function routeNext(state: typeof AgentAnnotation.State) {
  // Nodes set `status` to indicate what should run NEXT,
  // so map the *new* status to the next node.
  switch (state.status) {
    case 'analyzing':
      return 'analyze'
    case 'drafting':
      return 'draft'
    case 'awaiting_approval':
      // Pause for human approval — do NOT go to `send` yet.
      return END
    case 'sending':
      return 'send'
    default:
      return END
  }
}

export function createAgentGraph() {
  return new StateGraph(AgentAnnotation)
    .addNode('research', researchNode)
    .addNode('analyze', analyzeNode)
    .addNode('draft', draftNode)
    .addNode('send', sendNode)
    .addEdge(START, 'research')
    .addConditionalEdges('research', routeNext)
    .addConditionalEdges('analyze', routeNext)
    .addConditionalEdges('draft', routeNext)
    .addEdge('send', END)
    .compile()
}
