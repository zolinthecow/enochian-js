import type {
    PromptPostBody,
    PromptPostReturnType,
} from '@zolinthecow/enochian-studio';
import type { DebugInfo } from './api.js';

export async function postStudioPrompt(
    body: PromptPostBody,
    debugInfo: DebugInfo,
) {
    const { baseUrl, port } = debugInfo;
    const url = `${baseUrl}:${port}/api/prompt`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = (await response.json()) as PromptPostReturnType;
        return data;
    } catch (error) {
        console.error('Error posting studio prompt:', error);
        throw error;
    }
}
