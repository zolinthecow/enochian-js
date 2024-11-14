import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { z } from 'zod';

let packageRoot: string;
if (typeof __dirname !== 'undefined') {
    packageRoot = path.resolve(__dirname, '..', '..');
} else {
    const currentFilePath = fileURLToPath(import.meta.url);
    packageRoot = path.resolve(path.dirname(currentFilePath), '..', '..');
}
const dbPath = path.resolve(packageRoot, 'enochian-studio.db');
const db = createClient({
    url: `file:${dbPath}`,
});

export default db;

// Type for the PromptType table
export const PromptTypeSchema = z.object({
    type: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
});
export type PromptType = z.infer<typeof PromptTypeSchema>;

export const PromptRequestSchema = z.object({
    id: z.string(),
    requestPrompt: z.string(),
    requestTimestamp: z.string(),
    requestMetadata: z.unknown(), // JSON object
    responseContent: z.string().optional(),
    responseTimestamp: z.string().optional(),
    responseMetadata: z.unknown().optional(), // JSON object
});
export const PromptSchema = z.object({
    id: z.string(),
    type: z.string(),
    requests: z.string().transform((str) => {
        const parsed = JSON.parse(str);
        console.log('PARSEDD', parsed);
        return z.array(PromptRequestSchema).parse(parsed);
    }),
    createdAt: z.string(),
    updatedAt: z.string(),
});
export type Prompt = z.infer<typeof PromptSchema>;

export type PromptRequest = z.infer<typeof PromptRequestSchema>;

// Helper type for parsed Prompt data
export type ParsedPrompt = Omit<Prompt, 'requests'> & {
    requests: PromptRequest[];
};

export function stringifyPrompt(prompt: ParsedPrompt): Prompt {
    return {
        ...prompt,
        requests: JSON.stringify(prompt.requests),
    };
}
