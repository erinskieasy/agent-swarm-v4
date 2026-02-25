import type { AgentTool, AgentToolContext } from './types.js';
import { webSearchTool } from './webSearch.js';
import { fileSearchTool } from './fileSearch.js';

export const tools: AgentTool[] = [
    webSearchTool,
    fileSearchTool
];

export function getAvailableTools(context: AgentToolContext): AgentTool[] {
    return tools.filter(tool => tool.isAvailable(context));
}

export function getToolDefinitions(context: AgentToolContext) {
    return getAvailableTools(context).map(t => t.definition);
}

export async function executeTool(name: string, argsText: string, context: AgentToolContext): Promise<string> {
    const tool = tools.find(t => t.definition.function.name === name);
    if (!tool) {
        return `Error: Tool '${name}' not found.`;
    }
    if (!tool.isAvailable(context)) {
        return `Error: Tool '${name}' is not currently available in this context.`;
    }

    try {
        const args = JSON.parse(argsText);
        return await tool.execute(args, context);
    } catch (err: any) {
        return `Error parsing tool arguments or executing: ${err.message}`;
    }
}
