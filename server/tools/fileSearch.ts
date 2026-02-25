import type { AgentTool, AgentToolContext } from './types.js';
import { searchDocuments } from '../services/documents.js';

export const fileSearchTool: AgentTool = {
    definition: {
        type: 'function',
        function: {
            name: 'file_search',
            description: 'Search the user\'s uploaded documents for specific information. Use when the user has provided files and you need to find data, quotes, statistics, or facts from their documents.',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'What to search for in the uploaded documents. Be specific.',
                    },
                },
                required: ['query'],
            },
        },
    },
    async execute(args: { query: string }, context: AgentToolContext): Promise<string> {
        if (!context.missionId) {
            return 'File search failed: No mission ID provided.';
        }
        try {
            const chunks = await searchDocuments(context.missionId, args.query, 5);
            return chunks.length > 0
                ? chunks.map((c, i) =>
                    `--- Match ${i + 1} (from "${c.metadata.filename}", chunk #${c.chunkIndex}, score: ${c.score}) ---\n${c.content}`
                ).join('\n\n')
                : 'No matching content found in the uploaded documents.';
        } catch (err: any) {
            return `File search failed: ${err.message}`;
        }
    },
    isAvailable(context: AgentToolContext): boolean {
        return !!context.hasDocuments; // Only available if documents exist
    }
};
