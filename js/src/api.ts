import { z } from 'zod';

// biome-ignore lint/suspicious/noExplicitAny: needs any type
type Tool<TName extends string = string, TReturn = any> = {
    // biome-ignore lint/suspicious/noExplicitAny: needs any type
    function: (...args: any[]) => TReturn | Promise<TReturn>;
    name: TName;
    params?: z.ZodSchema;
    description?: string;
};

// The createTools function with explicit type annotations
export function createTools<
    const T extends Array<{
        // biome-ignore lint/suspicious/noExplicitAny: needs any type
        function: (...args: any[]) => any;
        name: string;
        params?: z.ZodSchema;
        description?: string;
    }>,
>(
    tools: T,
): { [K in keyof T]: Tool<T[K]['name'], ReturnType<T[K]['function']>> } {
    // biome-ignore lint/suspicious/noExplicitAny: needs any type
    return tools as any;
}
export type ToolUseParams = ReturnType<typeof createTools>;

export type DebugInfo = {
    baseUrl: string;
    port: number;
    debugName: string | null;
    debugPromptID: string | null;
};

/**
 * Metadata to pass into a function. It can be anything, but this type provides
 * some keys that work with built-in presets
 */
export type MessageMetadata = {
    /**
     * Attaches an ID to a message so that it can be referred to in update calls and stuff
     */
    id?: string;
    /**
     * Is this message probably going to be in the prefix cache? If this value is
     * set to true, then the message will NOT be passed into any `transform` functions
     * since amortized over many generations it will not cost anything.
     */
    probablyPrefixCached?: boolean;
    /**
     * Relative priority. It can be used with the `trimByRelativePriority` transform
     * preset to remove messages by order of priority, lower means will be trimmed first
     */
    prel?: number;
    /**
     * Used to group messages under "buckets" which can then be trimmed by relevancy
     */
    type?: string;
    // Catchall
    [key: string]: unknown;
};

export type Message = {
    role: 'user' | 'assistant' | 'system';
    content: string;
} & MessageMetadata;

// DOCS COVERAGE: /api-reference/request-types
/**
 * Base type for generation request input without `stream` and `choices`.
 */
type GenerateReqInputBase = {
    /** The input prompt. It can be a single prompt or a batch of prompts. */
    text?: string | string[];
    /** The token ids for text; one can either specify text or input_ids. */
    input_ids?: number[] | number[][];
    /**
     * The image input. It can be a file name, a url, or base64 encoded string.
     * See also python/sglang/srt/utils.py:load_image.
     */
    image_data?: string | string[];
    /** The sampling parameters. */
    sampling_params?: SamplingParams;
    /** The request id. */
    rid?: string | string[];
    /** Whether to return logprobs. */
    return_logprob?: boolean;
    /**
     * The start location of the prompt for return_logprob.
     * By default, this value is "-1", which means it will only return logprobs for output tokens.
     */
    logprob_start_len?: number;
    /** The number of top logprobs to return. */
    top_logprobs_num?: number;
    /** Whether to detokenize tokens in text in the returned logprobs. */
    return_text_in_logprobs?: boolean;
    /** Enochian studio debug info */
    debug?: DebugInfo | null;
    /** Tools */
    tools?: ToolUseParams;
    /**
     * Transform callback.
     * Passes in a list of messages that are valid to be transformed (messages that should not be ignored)
     * and returns the messages to actually send to the LLM backend
     */
    transform?: (messages: Message[]) => Promise<Message[]>;
};

// DOCS COVERAGE: /api-reference/request-types
/**
 * Represents the input for a non-streaming generation request.
 */
export type GenerateReqNonStreamingInput = GenerateReqInputBase & {
    stream?: false | undefined;
    choices?: string[];
};

// DOCS COVERAGE: /api-reference/request-types
/**
 * Represents the input for a streaming generation request.
 * Disallows `choices` parameters.
 */
export type GenerateReqStreamingInput = Omit<
    GenerateReqInputBase,
    'choices'
> & {
    stream: true;
};

// DOCS COVERAGE: /api-reference/request-types
/**
 * Represents the input for a generation request.
 * It can be either streaming or non-streaming.
 */
export type GenerateReqInput =
    | GenerateReqNonStreamingInput
    | GenerateReqStreamingInput;

// DOCS COVERAGE: /api-reference/request-types
/**
 * Represents the sampling parameters for generation.
 */
export type SamplingParams = {
    /** The maximum number of output tokens */
    max_new_tokens?: number;
    /** Stop when hitting any of the strings in this list. */
    stop?: string | string[];
    /**
     * Stop when hitting any of the token_ids in this list. Could be useful when mixed with
     * `min_new_tokens`.
     */
    stop_token_ids?: number[];
    /** Sampling temperature */
    temperature?: number;
    /** Top-p sampling */
    top_p?: number;
    /** Top-k sampling */
    top_k?: number;
    /** Min-p sampling */
    min_p?: number;
    /** Whether to ignore EOS token. */
    ignore_eos?: boolean;
    /** Whether to skip the special tokens during detokenization. */
    skip_special_tokens?: boolean;
    /** Whether to add spaces between special tokens during detokenization. */
    spaces_between_special_tokens?: boolean;
    /** Constrains the output to follow a given regular expression. */
    regex?: string;
    /** Do parallel sampling and return `n` outputs. */
    n?: number;
    /**
     * Constrains the output to follow a given JSON schema.
     * `regex` and `json_schema` cannot be set at the same time.
     */
    json_schema?: string;
    /**
     * Constrains the output to follow a given Zod schema.
     * Generates a `json_schema` and overrides whatever was set in it.
     */
    zod_schema?: z.ZodSchema;
    /**
     * Float that penalizes new tokens based on their frequency in the generated text so far.
     * Values > 0 encourage the model to use new tokens, while values < 0 encourage the model to
     * repeat tokens. Must be -2 <= value <= 2. Setting to 0 (default) will disable this penalty.
     */
    frequency_penalty?: number;
    /**
     * Float that penalizes new tokens based on whether they appear in the generated text so far.
     * Values > 0 encourage the model to use new tokens, while values < 0 encourage the model to repeat
     * tokens. Must be -2 <= value <= 2. Setting to 0 (default) will disable this penalty.
     */
    presence_penalty?: number;
    /**
     * Float that penalizes new tokens based on whether they appear in the prompt and the generated text
     * so far. Values > 1 encourage the model to use new tokens, while values < 1 encourage the model to
     * repeat tokens. Must be 0 <= value <= 2. Setting to 1 (default) will disable this penalty.
     */
    repetition_penalty?: number;
    /**
     * Guides inference to generate at least this number of tokens by penalizing logits of tokenizer's
     * EOS token and `stop_token_ids` to -inf, until the output token reaches given length.
     * Note that any of the `stop` string can be generated before reaching `min_new_tokens`, as it is
     * difficult to infer the correct token ID by given `stop` strings.
     * Must be 0 <= value < max_new_tokens. Setting to 0 (default) will disable this penalty.
     */
    min_new_tokens?: number;
};

export const LogprobSchema = z.tuple([
    z.number(),
    z.number(),
    z.string().optional(),
]);
export type Logprob = z.infer<typeof LogprobSchema>;

export const MetaInfoSchemaWithoutLogprobs = z.object({
    prompt_tokens: z.number(),
    completion_tokens: z.number(),
    completion_tokens_wo_jump_forward: z.number(),
    finish_reason: z
        .discriminatedUnion('type', [
            z.object({
                type: z.literal('length'),
                length: z.number(),
            }),
            z.object({
                type: z.literal('stop'),
                // Token ID or stop string
                matched: z.number().or(z.string()),
            }),
        ])
        .nullish(),
    id: z.string(),
});
export type MetaInfoWithoutLogprobs = z.infer<
    typeof MetaInfoSchemaWithoutLogprobs
>;

export const MetaInfoSchemaWithLogprobs = MetaInfoSchemaWithoutLogprobs.extend({
    input_token_logprobs: z.array(LogprobSchema).nullish(),
    output_token_logprobs: z.array(LogprobSchema).nullish(),
    input_top_logprobs: z.array(z.array(LogprobSchema)).nullish(),
    output_top_logprobs: z.array(z.array(LogprobSchema)).nullish(),
    normalized_prompt_logprob: z.number(),
});
export type MetaInfoWithLogprobs = z.infer<typeof MetaInfoSchemaWithLogprobs>;

export const MetaInfoSchema = z.union([
    MetaInfoSchemaWithLogprobs,
    MetaInfoSchemaWithoutLogprobs,
]);
export type MetaInfo = z.infer<typeof MetaInfoSchema>;

export const GenerateRespSingleSchema = z.object({
    text: z.string(),
    meta_info: MetaInfoSchema,
    index: z.number().optional(),
});
export type GenerateRespSingle = z.infer<typeof GenerateRespSingleSchema>;

export const GenerateRespMultipleSchema = z.array(GenerateRespSingleSchema);
export type GenerateRespMultiple = z.infer<typeof GenerateRespMultipleSchema>;

export const GenerateRespSchema = z.union([
    GenerateRespMultipleSchema,
    GenerateRespSingleSchema,
]);
export type GenerateResp = z.infer<typeof GenerateRespSchema>;

export const GetModelInfoSchema = z.object({
    model_path: z.string(),
    is_generation: z.boolean(),
});
export type GetModelInfo = z.infer<typeof GetModelInfoSchema>;
