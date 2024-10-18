import Database from 'better-sqlite3';

const db = new Database('enochian-studio.sqlite');

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
    prompts: string; // JSON string of string[]
    metadata: string; // JSON string of any[]
    createdAt: string;
    updatedAt: string;
};

// Helper type for parsed Prompt data
export type ParsedPrompt = Omit<Prompt, 'prompts' | 'metadata'> & {
    prompts: string[];
    metadata: unknown[];
};

// Helper functions to parse JSON fields
export function parsePrompt(prompt: Prompt): ParsedPrompt {
    return {
        ...prompt,
        prompts: JSON.parse(prompt.prompts),
        metadata: JSON.parse(prompt.metadata),
    };
}

export function stringifyPrompt(prompt: ParsedPrompt): Prompt {
    return {
        ...prompt,
        prompts: JSON.stringify(prompt.prompts),
        metadata: JSON.stringify(prompt.metadata),
    };
}
