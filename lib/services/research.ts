import { tavily } from '@tavily/core'
import FirecrawlApp from '@mendable/firecrawl-js'

// NOTE: your .env shows `TAVILY_API_kEY` (lowercase k) — Node env vars are
// case-sensitive, so check BOTH spellings, plus the correct `TAVILY_API_KEY`.
function getTavilyKey() {
  return (
    process.env.TAVILY_API_KEY ||
    process.env.TAVILY_API_kEY ||
    ''
  )
}

function getTavilyClient() {
  const apiKey = getTavilyKey()
  if (!apiKey) {
    throw new Error(
      'Missing Tavily API key. Your .env has `TAVILY_API_kEY` (lowercase k) — rename it to `TAVILY_API_KEY` in .env.local and restart `next dev`.'
    )
  }
  return tavily({ apiKey })
}

function getFirecrawl() {
  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!apiKey) {
    throw new Error('Missing FIRECRAWL_API_KEY env var. Add it to .env.local and restart `next dev`.')
  }
  return new FirecrawlApp({ apiKey })
}

export async function searchWeb(query: string) {
  const tavilyClient = getTavilyClient()
  const response = await tavilyClient.search(query, {
    search_depth: 'advanced',
    max_results: 3
  })

  return response.results.map(r => ({
    title: r.title,
    url: r.url,
    content: r.content
  }))
}

export async function scrapePage(url: string): Promise<string> {
  const firecrawl = getFirecrawl()
  const result = await firecrawl.scrapeUrl(url, {
    formats: ['markdown']
  })

  return result.markdown || ''
}

export async function researchTopic(query: string) {
  // Search the web
  const searchResults = await searchWeb(query)

  if (!searchResults.length) {
    throw new Error(`No search results found for: ${query}`)
  }

  // Scrape the top result
  const content = await scrapePage(searchResults[0].url)

  return {
    query,
    results: [{
      ...searchResults[0],
      fullContent: content.slice(0, 5000) // Limit to 5000 chars
    }]
  }
}