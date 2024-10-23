import { z } from 'zod';
import type {
    GenerateReqInput,
    GenerateReqNonStreamingInput,
    GenerateRespSingle,
    MetaInfo,
} from './api.js';
import type { Message } from './backends/backend.interface.js';

// Typescript flattens the type union when doing Omit so it is no longer a discriminated union
// based on `stream`, so we need to recast it to a non-streaming input.
export const isNonStreamingInput = (
    input: Omit<GenerateReqInput, 'text' | 'input_ids'>,
): input is Omit<GenerateReqNonStreamingInput, 'text' | 'input_ids'> => {
    return !input.stream;
};
