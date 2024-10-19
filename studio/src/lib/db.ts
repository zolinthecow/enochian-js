import Database from 'better-sqlite3';
import { z } from 'zod';

const db: Database.Database = new Database('enochian-studio.sqlite');

export default db;

// Type for the PromptType table
export type PromptType = {
    type: string;
    createdAt: string;
    updatedAt: string;
};

// Type for the Prompt table
export type Prompt = {
    id: string;
    type: string;
    requests: string; // JSON string of array of PromptRequest
    createdAt: string;
    updatedAt: string;
};

export const PromptRequestSchema = z.object({
    id: z.string(),
    requestPrompt: z.string(),
    requestTimestamp: z.string(),
    requestMetadata: z.unknown(), // JSON object
    responseContent: z.string().optional(),
    responseTimestamp: z.string().optional(),
    responseMetadata: z.unknown().optional(), // JSON object
});
export type PromptRequest = z.infer<typeof PromptRequestSchema>;

// Helper type for parsed Prompt data
export type ParsedPrompt = Omit<Prompt, 'requests'> & {
    requests: PromptRequest[];
};

// Helper functions to parse JSON fields
export function parsePrompt(prompt: Prompt): ParsedPrompt {
    return {
        ...prompt,
        requests: PromptRequestSchema.array().parse(
            JSON.parse(prompt.requests),
        ),
    };
}

export function stringifyPrompt(prompt: ParsedPrompt): Prompt {
    return {
        ...prompt,
        requests: JSON.stringify(prompt.requests),
    };
}
