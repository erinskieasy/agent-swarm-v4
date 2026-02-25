import type { ChatCompletionTool } from 'openai/resources/chat/completions';

export interface AgentToolContext {
    missionId?: string;
    hasDocuments?: boolean;
}

export interface AgentTool {
    definition: ChatCompletionTool;
    // Returns the string content to append to currentMessages
    execute(args: any, context: AgentToolContext): Promise<string>;
    // Condition to check if it should be included
    isAvailable(context: AgentToolContext): boolean;
}
