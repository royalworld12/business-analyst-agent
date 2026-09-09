import { BaseMessage } from '@langchain/core/messages'

export interface AgentState {
  messages: BaseMessage[]
  query: string
  searchResults?: Array<{ title: string; url: string; content: string }>
  reportContent?: string
  analysis?: {
    summary: string
    keyMetrics: string[]
    risks: string[]
    opportunities: string[]
  }
  emailDraft?: {
    subject: string
    body: string
    recipient: string
  }
  approved?: boolean
  status: 'idle' | 'searching' | 'analyzing' | 'drafting' | 'awaiting_approval' | 'sending' | 'complete' | 'error'
  error?: string
}

export interface ResearchResult {
  query: string
  results: Array<{
    title: string
    url: string
    content: string
  }>
}