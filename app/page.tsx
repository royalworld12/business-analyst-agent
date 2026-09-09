'use client'

import { useState } from 'react'
import { AgentState } from '@/lib/types'

export default function Page() {
  const [query, setQuery] = useState('')
  const [email, setEmail] = useState('')
  const [state, setState] = useState<AgentState | null>(null)
  const [loading, setLoading] = useState(false)

  // Trim so pasted values with leading/trailing spaces still count.
  // Validate email shape so a half-typed address doesn't silently fail later.
  const trimmedQuery = query.trim()
  const trimmedEmail = email.trim()
  const emailValid = /.+@.+\..+/.test(trimmedEmail)
  const canSubmit = !loading && trimmedQuery.length > 0 && emailValid

  async function runAgent() {
    setLoading(true)
    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: trimmedQuery, recipient: trimmedEmail })
      })

      const result = await res.json()
      setState(result)
    } finally {
      setLoading(false)
    }
  }

  async function approve() {
    setLoading(true)
    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: state!.query,
          approved: true,
          recipient: trimmedEmail,
          // Send the full draft back so the server doesn't lose subject/body
          emailDraft: state!.emailDraft,
          analysis: state!.analysis,
          searchResults: state!.searchResults,
          reportContent: state!.reportContent,
          messages: state!.messages
        })
      })

      const result = await res.json()
      setState(result)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8 text-gray-900">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 text-gray-900">Business Analyst Agent</h1>

        {/* Input Form */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2 text-gray-700">Research Query</label>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g., Tesla latest quarterly earnings report"
              className="w-full p-3 border border-gray-300 rounded-lg bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-2 text-gray-700">Your Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full p-3 border border-gray-300 rounded-lg bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            onClick={runAgent}
            disabled={!canSubmit}
            title={
              loading
                ? 'Processing...'
                : !trimmedQuery
                  ? 'Enter a research query'
                  : !emailValid
                    ? 'Enter a valid email address'
                    : 'Start research'
            }
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Processing...' : 'Start Research'}
          </button>
          {!canSubmit && !loading && (
            <p className="mt-2 text-sm text-gray-500">
              {!trimmedQuery && !emailValid
                ? 'Enter a research query and a valid email to continue.'
                : !trimmedQuery
                  ? 'Enter a research query to continue.'
                  : 'Enter a valid email address to continue.'}
            </p>
          )}
        </div>

        {/* Status */}
        {state && (
          <div className="bg-white rounded-lg shadow-lg p-6 text-gray-900">
            <div className="mb-4">
              <span className="text-sm font-medium text-gray-700">Status:</span>
              <span className="ml-2 font-semibold text-gray-900">{state.status}</span>
            </div>

            {/* Analysis */}
            {state.analysis && (
              <div className="mb-6">
                <h3 className="text-xl font-bold mb-3 text-gray-900">Analysis</h3>
                <p className="mb-4 text-gray-900">{state.analysis.summary}</p>

                <h4 className="font-semibold mb-2 text-gray-900">Key Metrics:</h4>
                <ul className="list-disc pl-5 mb-4 text-gray-900">
                  {state.analysis.keyMetrics.map((m, i) => <li key={i}>{m}</li>)}
                </ul>

                <h4 className="font-semibold mb-2 text-gray-900">Risks:</h4>
                <ul className="list-disc pl-5 mb-4 text-gray-900">
                  {state.analysis.risks.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            )}

            {/* Email Draft */}
            {state.emailDraft && state.status === 'awaiting_approval' && (
              <div className="border-t border-gray-200 pt-6">
                <h3 className="text-xl font-bold mb-3 text-gray-900">Email Draft</h3>
                <div className="bg-gray-50 p-4 rounded mb-4">
                  <p className="font-semibold mb-2 text-gray-900">Subject: {state.emailDraft.subject}</p>
                  <pre className="whitespace-pre-wrap text-sm text-gray-900">{state.emailDraft.body}</pre>
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={approve}
                    className="flex-1 bg-green-600 text-white py-3 rounded-lg font-semibold"
                  >
                    Approve & Send
                  </button>
                  <button
                    onClick={() => setState(null)}
                    className="flex-1 bg-red-600 text-white py-3 rounded-lg font-semibold"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Complete */}
            {state.status === 'complete' && (
              <div className="text-center py-8">
                <div className="text-6xl mb-4">✅</div>
                <h3 className="text-2xl font-bold text-gray-900">Email Sent!</h3>
              </div>
            )}

            {/* Error — this is where "not sending email" actually shows up */}
            {state.status === 'error' && (
              <div className="border-t border-gray-200 pt-6">
                <h3 className="text-xl font-bold mb-3 text-red-600">Error</h3>
                <pre className="whitespace-pre-wrap text-sm bg-red-50 text-red-900 p-4 rounded border border-red-200">
                  {state.error || 'Unknown error'}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}