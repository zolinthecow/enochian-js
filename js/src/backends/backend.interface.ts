import type { GenerateReqInput, GenerateResp } from '../api.js';
import type { OpenAISetModelParams } from './openai.js';
import type { SGLSetModelParams } from './sgl.js';

export type Message = {
    role: 'user' | 'assistant' | 'system';
    content: string;
};

export type SetModelParams = OpenAISetModelParams | SGLSetModelParams;

export default interface Backend {
    setModel(params: SetModelParams): Promise<void> | void;
    gen(
        messages: Message[],
        genInput?: Omit<Partial<GenerateReqInput>, 'text' | 'input_ids'>,
    ): Promise<GenerateResp>;
    getPrompt(messages: Message[]): string;
    clone(): Backend;
}
