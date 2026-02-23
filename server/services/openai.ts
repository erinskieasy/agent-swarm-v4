import OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';
import 'dotenv/config';
import { webSearch } from './tavily.js';
import { searchDocuments, missionHasDocuments } from './documents.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MAX_TOOL_ROUNDS = 3; // prevent infinite tool-call loops

/**
 * Returns a date context line to inject into system prompts
 * so the LLM knows the current date and doesn't hallucinate outdated info.
 */
function getDateContext(hasDocuments: boolean): string {
    const now = new Date();
    const formatted = now.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
    const tools = hasDocuments
        ? 'You have access to a web_search tool and a file_search tool. Use web_search for current real-world data, and file_search to find information in the user\'s uploaded documents.'
        : 'You have access to a web_search tool — use it when you need current, real-world data to produce accurate results.';
    return `\n\nCurrent date: ${formatted}. ${tools}`;
}

/**
 * Web search tool definition for OpenAI function calling.
 */
const WEB_SEARCH_TOOL: ChatCompletionTool = {
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
};

/**
 * File search tool definition for OpenAI function calling.
 */
const FILE_SEARCH_TOOL: ChatCompletionTool = {
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
};

/**
 * Build the tools array based on whether the mission has documents.
 */
function getTools(hasDocuments: boolean): ChatCompletionTool[] {
    const tools = [WEB_SEARCH_TOOL];
    if (hasDocuments) {
        tools.push(FILE_SEARCH_TOOL);
    }
    return tools;
}

/**
 * Process any tool calls in the response by executing searches
 * and feeding results back into the conversation.
 */
async function handleToolCalls(
    messages: ChatCompletionMessageParam[],
    response: OpenAI.Chat.Completions.ChatCompletion,
    model: string,
    temperature: number,
    tools: ChatCompletionTool[],
    missionId?: string,
    extraOptions?: Record<string, any>,
): Promise<string> {
    let currentResponse = response;
    let currentMessages = [...messages];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const choice = currentResponse.choices[0];
        if (!choice?.message?.tool_calls?.length) {
            // No more tool calls — return the final text
            return choice?.message?.content || '';
        }

        // Add the assistant's tool-call message to history
        currentMessages.push(choice.message as ChatCompletionMessageParam);

        // Execute each tool call
        for (const toolCall of choice.message.tool_calls) {
            if (toolCall.function.name === 'web_search') {
                try {
                    const args = JSON.parse(toolCall.function.arguments);
                    const results = await webSearch(args.query, { maxResults: 4 });
                    const resultText = results.length > 0
                        ? results.map((r, i) => `${i + 1}. **${r.title}** (${r.url})\n   ${r.snippet}`).join('\n\n')
                        : 'No relevant results found.';

                    currentMessages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        content: resultText,
                    });
                } catch (err: any) {
                    currentMessages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        content: `Search failed: ${err.message}`,
                    });
                }
            } else if (toolCall.function.name === 'file_search' && missionId) {
                try {
                    const args = JSON.parse(toolCall.function.arguments);
                    const chunks = await searchDocuments(missionId, args.query, 5);
                    const resultText = chunks.length > 0
                        ? chunks.map((c, i) =>
                            `--- Match ${i + 1} (from "${c.metadata.filename}", chunk #${c.chunkIndex}, score: ${c.score}) ---\n${c.content}`
                        ).join('\n\n')
                        : 'No matching content found in the uploaded documents.';

                    currentMessages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        content: resultText,
                    });
                } catch (err: any) {
                    currentMessages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        content: `File search failed: ${err.message}`,
                    });
                }
            }
        }

        // Get the next response with tool results
        currentResponse = await openai.chat.completions.create({
            model,
            messages: currentMessages,
            temperature,
            tools,
            tool_choice: 'auto',
            ...extraOptions,
        });
    }

    // Max rounds reached — return whatever we have
    return currentResponse.choices[0]?.message?.content || '';
}

/**
 * Standard chat completion with tools — returns the assistant's text response.
 * The LLM can autonomously decide to search the web or uploaded documents.
 */
export async function chatCompletion(
    systemPrompt: string,
    userMessage: string,
    model: string = 'gpt-4o',
    options?: { missionId?: string },
): Promise<string> {
    const missionId = options?.missionId;
    const hasDocuments = missionId ? await missionHasDocuments(missionId) : false;
    const tools = getTools(hasDocuments);

    const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt + getDateContext(hasDocuments) },
        { role: 'user', content: userMessage },
    ];

    const response = await openai.chat.completions.create({
        model,
        messages,
        temperature: 0.7,
        tools,
        tool_choice: 'auto',
    });

    // If the LLM used a tool, handle the loop
    if (response.choices[0]?.message?.tool_calls?.length) {
        return handleToolCalls(messages, response, model, 0.7, tools, missionId);
    }

    return response.choices[0]?.message?.content || '';
}

/**
 * JSON chat completion with tools — parses the response as JSON of type T.
 * The LLM can search the web or uploaded documents before producing its structured JSON output.
 */
export async function chatCompletionJSON<T>(
    systemPrompt: string,
    userMessage: string,
    model: string = 'gpt-4o',
    options?: { missionId?: string },
): Promise<T> {
    const missionId = options?.missionId;
    const hasDocuments = missionId ? await missionHasDocuments(missionId) : false;
    const tools = getTools(hasDocuments);

    const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt + getDateContext(hasDocuments) },
        { role: 'user', content: userMessage },
    ];

    // First call: allow tools but NOT json_object mode (can't combine tool_calls with response_format)
    const response = await openai.chat.completions.create({
        model,
        messages,
        temperature: 0.7,
        tools,
        tool_choice: 'auto',
    });

    // If the LLM used tools, handle the loop then do a final JSON pass
    if (response.choices[0]?.message?.tool_calls?.length) {
        const textResult = await handleToolCalls(messages, response, model, 0.7, tools, missionId);
        // The tool loop result may not be valid JSON — do a final pass to ensure JSON
        const jsonResponse = await openai.chat.completions.create({
            model,
            messages: [
                { role: 'system', content: systemPrompt + getDateContext(hasDocuments) },
                { role: 'user', content: userMessage + `\n\nAdditional context from research:\n${textResult}` },
            ],
            temperature: 0.7,
            response_format: { type: 'json_object' },
        });
        const text = jsonResponse.choices[0]?.message?.content || '{}';
        return JSON.parse(text) as T;
    }

    // No tool calls — try to parse directly, or do a JSON pass
    const directText = response.choices[0]?.message?.content || '{}';
    try {
        return JSON.parse(directText) as T;
    } catch {
        // LLM didn't return JSON (no response_format in tool-enabled call) — retry with json mode
        const jsonResponse = await openai.chat.completions.create({
            model,
            messages,
            temperature: 0.7,
            response_format: { type: 'json_object' },
        });
        const text = jsonResponse.choices[0]?.message?.content || '{}';
        return JSON.parse(text) as T;
    }
}
