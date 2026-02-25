import OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';
import 'dotenv/config';
import { missionHasDocuments } from './documents.js';
import { getToolDefinitions, executeTool } from '../tools/index.js';

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

// Tool definitions are now managed in the tools module.

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

        // Execute each tool call using the tools module
        for (const toolCall of choice.message.tool_calls) {
            const hasDocs = tools.some(t => t.function.name === 'file_search');
            const resultText = await executeTool(
                toolCall.function.name,
                toolCall.function.arguments,
                { missionId, hasDocuments: hasDocs }
            );

            currentMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: resultText,
            });
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
    const tools = getToolDefinitions({ missionId, hasDocuments });

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
    const tools = getToolDefinitions({ missionId, hasDocuments });

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
