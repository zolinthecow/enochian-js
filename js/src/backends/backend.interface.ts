import type { GenerateReqInput, GenerateResp } from '../api.js';

export type Message = {
    role: 'user' | 'assistant' | 'system';
    content: string;
};

export default interface Backend {
    setModel({
        url,
        modelName,
    }: { url?: string; modelName?: string }): Promise<void> | void;
    gen(
        messages: Message[],
        genInput?: Omit<Partial<GenerateReqInput>, 'text' | 'input_ids'>,
    ): Promise<GenerateResp>;
    getPrompt(messages: Message[]): string;
    clone(): Backend;
}
