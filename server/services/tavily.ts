import { chatCompletionJSON } from './openai.js';

// ─── Types ───────────────────────────────────────────────────

export interface SearchResult {
    title: string;
    url: string;
    snippet: string;
    score: number;
}

export interface ResearchFindings {
    sources: SearchResult[];
    summary: string;
    queriesUsed: string[];
}

// ─── Tavily API ──────────────────────────────────────────────

const TAVILY_API_URL = 'https://api.tavily.com/search';

/**
 * Perform a single web search via Tavily.
 * Returns structured results with titles, URLs, content snippets, and relevance scores.
 */
export async function webSearch(
    query: string,
    options: { maxResults?: number; searchDepth?: 'basic' | 'advanced' } = {}
): Promise<SearchResult[]> {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
        console.warn('TAVILY_API_KEY not set — skipping web search');
        return [];
    }

    try {
        const response = await fetch(TAVILY_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api_key: apiKey,
                query,
                max_results: options.maxResults || 5,
                search_depth: options.searchDepth || 'basic',
                include_answer: false,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Tavily search failed (${response.status}):`, errorText);
            return [];
        }

        const data = await response.json() as {
            results: Array<{
                title: string;
                url: string;
                content: string;
                score: number;
            }>;
        };

        return (data.results || []).map((r) => ({
            title: r.title,
            url: r.url,
            snippet: r.content?.slice(0, 300) || '',
            score: r.score || 0,
        }));
    } catch (error: any) {
        console.error('Tavily search error:', error.message);
        return [];
    }
}

// ─── Query Generation Prompt ─────────────────────────────────

const QUERY_GEN_PROMPT = `You generate targeted web search queries to ground an AI interpretation in reality.

Given an objective and context, produce 2-3 SHORT, specific search queries that would return the most useful real-world information. Focus on:
- Current best practices, tools, or technologies relevant to the objective
- Market data, pricing, or competitive landscape if relevant
- Common pitfalls or challenges others have faced with similar goals

Respond as JSON:
{
  "queries": ["query 1", "query 2", "query 3"]
}`;

const NEEDS_RESEARCH_PROMPT = `You decide whether new user feedback requires additional web research.

Given the user's original goal, previous research sources, and new feedback, decide if the feedback introduces NEW TOPICS that need grounding in real-world data.

Examples where research IS needed:
- "Use Stripe for payments" → need to research Stripe's current capabilities
- "Target the European market" → need to research EU regulations, market data
- "Budget is $5k" → need to research pricing of tools/services mentioned

Examples where research is NOT needed:
- "Make it more concise" → stylistic feedback, no new topics
- "Focus on deliverable 2" → narrowing scope, already researched
- "Change audience to developers" → audience clarification, no new external data needed

Respond as JSON:
{
  "needsResearch": true/false,
  "reason": "brief explanation",
  "queries": ["search query 1", "search query 2"] // only if needsResearch is true
}`;

// ─── High-Level Research Function ────────────────────────────

/**
 * Research a topic by generating targeted queries and running them.
 * Returns deduplicated, relevance-sorted results with a summary.
 */
export async function researchTopic(
    objective: string,
    context?: { weakPoints?: string[]; scope?: string }
): Promise<ResearchFindings> {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
        return { sources: [], summary: 'Web research skipped — no API key configured.', queriesUsed: [] };
    }

    // Generate targeted queries
    const contextStr = context
        ? `\nIdentified gaps: ${context.weakPoints?.join(', ') || 'none'}\nScope: ${context.scope || 'not specified'}`
        : '';

    const queryPlan = await chatCompletionJSON<{ queries: string[] }>(
        QUERY_GEN_PROMPT,
        `Objective: ${objective}${contextStr}`
    );

    const queries = queryPlan.queries?.slice(0, 3) || [objective];

    // Run searches in parallel
    const allResults: SearchResult[] = [];
    const searchPromises = queries.map(async (query) => {
        const results = await webSearch(query, { maxResults: 3 });
        return results;
    });

    const searchResults = await Promise.all(searchPromises);
    for (const results of searchResults) {
        allResults.push(...results);
    }

    // Deduplicate by URL
    const seen = new Set<string>();
    const deduped = allResults.filter((r) => {
        if (seen.has(r.url)) return false;
        seen.add(r.url);
        return true;
    });

    // Sort by relevance score
    deduped.sort((a, b) => b.score - a.score);

    // Take top results
    const topSources = deduped.slice(0, 8);

    // Generate a brief summary of findings
    const summary = topSources.length > 0
        ? `Found ${topSources.length} relevant sources across ${queries.length} search queries.`
        : 'No relevant web results found.';

    return {
        sources: topSources,
        summary,
        queriesUsed: queries,
    };
}

/**
 * Determine if user feedback requires new web research.
 * Returns search queries if research is needed, empty array if not.
 */
export async function shouldResearchFeedback(
    originalGoal: string,
    previousSources: SearchResult[],
    userFeedback: string
): Promise<{ needed: boolean; queries: string[] }> {
    const previousTopics = previousSources.map((s) => s.title).join(', ');

    const decision = await chatCompletionJSON<{
        needsResearch: boolean;
        reason: string;
        queries?: string[];
    }>(
        NEEDS_RESEARCH_PROMPT,
        `Original goal: ${originalGoal}\nPrevious research covered: ${previousTopics || 'no previous research'}\nNew user feedback: ${userFeedback}`
    );

    return {
        needed: decision.needsResearch || false,
        queries: decision.queries || [],
    };
}
