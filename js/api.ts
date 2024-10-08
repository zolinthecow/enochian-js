import { z } from 'zod';

/**
 * Represents the input for a generation request.
 */
export type GenerateReqInput = {
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
    sampling_params: SamplingParams | SamplingParams[];
    /** The request id. */
    rid?: string | string[];
    /** Whether to return logprobs. */
    return_logprob?: boolean | boolean[];
    /**
     * The start location of the prompt for return_logprob.
     * By default, this value is "-1", which means it will only return logprobs for output tokens.
     */
    logprob_start_len?: number | number[];
    /** The number of top logprobs to return. */
    top_logprobs_num?: number | number[];
    /** Whether to detokenize tokens in text in the returned logprobs. */
    return_text_in_logprobs?: boolean;
    /** Whether to stream output. */
    stream?: boolean;
};

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

// TODO: This is not complete at all
export const GenerateRespSchema = z.object({
    text: z.string(),
    meta_info: z.object({
        prompt_tokens: z.number(),
        completion_tokens: z.number(),
        completion_tokens_wo_jump_forward: z.number(),
        finish_reason: z.discriminatedUnion('type', [
            z.object({
                type: z.literal('length'),
                length: z.number(),
            }),
            z.object({
                type: z.literal('stop'),
                // Token ID
                matched: z.number(),
            }),
        ]),
        id: z.string(),
    }),
    index: z.number(),
});
export type GenerateResp = z.infer<typeof GenerateRespSchema>;

export const GetModelInfoSchema = z.object({
    model_path: z.string(),
    is_generation: z.boolean(),
});
export type GetModelInfo = z.infer<typeof GetModelInfoSchema>;
