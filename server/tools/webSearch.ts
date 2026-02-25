import type { AgentTool, AgentToolContext } from './types.js';
import { webSearch } from '../services/tavily.js';

export const webSearchTool: AgentTool = {
    definition: {
        type: 'function',
        function: {
            name: 'web_search',
            description: 'Search the web for current, real-world information. Use when you need up-to-date data, pricing, market info, technical docs, or anything beyond your training data.',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'The search query. Be specific and concise.',
                    },
                },
                required: ['query'],
            },
        },
    },
    async execute(args: { query: string }, _context: AgentToolContext): Promise<string> {
        try {
            const results = await webSearch(args.query, { maxResults: 4 });
            return results.length > 0
                ? results.map((r, i) => `${i + 1}. **${r.title}** (${r.url})\n   ${r.snippet}`).join('\n\n')
                : 'No relevant results found.';
        } catch (err: any) {
            return `Search failed: ${err.message}`;
        }
    },
    isAvailable(_context: AgentToolContext): boolean {
        return true; // Always available
    }
};
