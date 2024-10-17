import type {
    GenerateReqInput,
    GenerateReqNonStreamingInput,
    GenerateReqStreamingInput,
    GenerateResp,
    GenerateRespSingle,
} from '../api.js';
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
        message: Message[],
        genInput?: Omit<GenerateReqNonStreamingInput, 'text' | 'input_ids'>,
    ): Promise<GenerateRespSingle>;
    gen(
        message: Message[],
        genInput?: Omit<GenerateReqStreamingInput, 'text' | 'input_ids'>,
    ): AsyncGenerator<GenerateRespSingle, GenerateRespSingle, unknown>;
    gen(
        messages: Message[],
        genInput?:
            | Omit<GenerateReqNonStreamingInput, 'text' | 'input_ids'>
            | Omit<GenerateReqStreamingInput, 'text' | 'input_ids'>,
    ):
        | Promise<GenerateRespSingle>
        | AsyncGenerator<GenerateRespSingle, GenerateRespSingle, unknown>;
    getPrompt(messages: Message[]): string;
    clone(): Backend;
}
