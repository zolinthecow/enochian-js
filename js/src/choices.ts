import type { Logprob, MetaInfoWithLogprobs } from './api.js';

export type ChoicesDecision = {
    decision: string;
    meta_info?: {
        normalized_prompt_logprobs: number;
        input_token_logprobs: Logprob[];
        output_token_logprobs: Logprob[];
    };
};

export type ChoicesSamplingMethod = (params: {
    choices: string[];
    normalized_prompt_logprobs: number[];
    input_token_logprobs: Logprob[][];
    output_token_logprobs: Logprob[][];
    // I'm not supporting unconditional likelihood normalization choices right now
    // unconditional_token_logprobs?: any[][];
}) => ChoicesDecision;

// Selects the option with the highest token length normalized prompt log probability.
export const tokenLengthNormalized: ChoicesSamplingMethod = ({
    choices,
    normalized_prompt_logprobs,
    input_token_logprobs,
    output_token_logprobs,
}) => {
    const maxIndex = normalized_prompt_logprobs.indexOf(
        Math.max(...normalized_prompt_logprobs),
    );
    const best_choice = choices[maxIndex];
    if (!best_choice) {
        throw new Error('[ERROR] Token length normalized choice');
    }
    if (
        !normalized_prompt_logprobs[maxIndex] ||
        !input_token_logprobs[maxIndex] ||
        !output_token_logprobs[maxIndex]
    ) {
        throw new Error('[ERROR]: Some selected logprobs are undefined');
    }

    const meta_info = {
        normalized_prompt_logprobs: normalized_prompt_logprobs[maxIndex],
        input_token_logprobs: input_token_logprobs[maxIndex],
        output_token_logprobs: output_token_logprobs[maxIndex],
    };

    return { decision: best_choice, meta_info };
};
