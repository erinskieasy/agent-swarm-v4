import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export async function chatCompletion(
    systemPrompt: string,
    userMessage: string,
    model: string = 'gpt-4o-mini'
): Promise<string> {
    const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
    ];

    const response = await openai.chat.completions.create({
        model,
        messages,
        temperature: 0.7,
        max_tokens: 4000,
    });

    return response.choices[0]?.message?.content ?? '';
}

export async function chatCompletionJSON<T>(
    systemPrompt: string,
    userMessage: string,
    model: string = 'gpt-4o-mini'
): Promise<T> {
    const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
    ];

    const response = await openai.chat.completions.create({
        model,
        messages,
        temperature: 0.7,
        max_tokens: 4000,
        response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content ?? '{}';
    return JSON.parse(content) as T;
}
