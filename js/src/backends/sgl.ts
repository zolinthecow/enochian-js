import {
    type GenerateReqInput,
    type GenerateReqNonStreamingInput,
    type GenerateRespMultiple,
    GenerateRespSchema,
    type GenerateRespSingle,
    GetModelInfoSchema,
    type MetaInfo,
    type MetaInfoWithLogprobs,
} from '../api.js';
import { ChatTemplateGroup } from '../chatTemplate.js';
import { tokenLengthNormalized } from '../choices.js';
import { isNonStreamingInput } from '../utils.js';
import type { Message } from './backend.interface.js';
import type Backend from './backend.interface.js';

export type SGLSetModelParams = string;

export default class SGLBackend implements Backend {
    private _chatTemplateGroup: ChatTemplateGroup;
    private _currentModel: { url: string; path: string };

    constructor(
        chatTemplateGroup: ChatTemplateGroup = new ChatTemplateGroup(),
        currentModel: { url: string; path: string } = { url: '', path: '' },
    ) {
        this._chatTemplateGroup = chatTemplateGroup;
        this._currentModel = currentModel;
    }

    clone() {
        return new SGLBackend(this._chatTemplateGroup.clone(), {
            ...this._currentModel,
        });
    }

    getPrompt(messages: Message[]): string {
        return this._chatTemplateGroup
            .get_chat_template(this._currentModel.path)
            .get_prompt(messages);
    }

    async setModel(url: SGLSetModelParams): Promise<void> {
        this._currentModel.url = url;
        const resp = await fetch(`${this._currentModel.url}/get_model_info`, {
            method: 'GET',
        });
        const json = await resp.json();
        const modelInfo = GetModelInfoSchema.parse(json);
        this._currentModel.path = modelInfo.model_path;
    }

    async gen(
        messages: Message[],
        genInput?: Omit<GenerateReqInput, 'text' | 'input_ids'>,
    ): Promise<GenerateRespSingle> {
        if (
            genInput &&
            isNonStreamingInput(genInput) &&
            genInput?.choices !== undefined
        ) {
            return await this._selectChoice(genInput.choices, messages);
        } else {
            return await this._sendGenerateRequest(messages, genInput);
        }
    }

    // If someone does `s.add(s.user`...`).add(s.user`...`)` it should be combined into one `user` message
    private _getConcatedMessages(_messages: Message[]) {
        const messages = JSON.parse(JSON.stringify(_messages));
        const newMessages: Message[] = [];
        for (let i = 0; i < messages.length; i++) {
            const prevMessage = newMessages[i - 1];
            const curMessage = messages[i];
            if (!curMessage) continue;
            if (
                i > 0 &&
                prevMessage &&
                messages[i - 1]?.role === messages[i]?.role
            ) {
                prevMessage.content += curMessage.content;
            } else {
                newMessages.push(curMessage);
            }
        }
        return newMessages;
    }

    private async _selectChoice(
        choices: string[],
        messages: Message[],
    ): Promise<GenerateRespSingle> {
        // First cache the prefix
        const throwaway = await this._sendGenerateRequest(messages, {
            sampling_params: {
                max_new_tokens: 0,
            },
        });
        const promptLength = throwaway.meta_info.prompt_tokens;
        // Take away one token for assistant start tag + one token for potential token healing
        const logprobStartLength = Math.max(promptLength - 2, 0);

        // Compute logprobs
        const logprobsResp = await this._sendGenerateRequest(
            choices.map((c) => [
                ...messages,
                { role: 'assistant', content: c },
            ]),
            {
                sampling_params: {
                    max_new_tokens: 0,
                    temperature: 0,
                },
                return_logprob: true,
                return_text_in_logprobs: true,
                logprob_start_len: logprobStartLength,
            },
        );
        const metaInfos = logprobsResp.map((r) => r.meta_info);
        if (!metaInfos.every(isMetaInfoWithLogProbs)) {
            throw new Error('Choices request did not return logprobs.');
        }

        const normalizedPromptLogprobs = metaInfos.map(
            (m) => m.normalized_prompt_logprob,
        );
        const inputTokenLogprobs = metaInfos.map((m) => m.input_token_logprobs);
        const outputTokenLogprobs = metaInfos.map(
            (m) => m.output_token_logprobs,
        );

        assertAllDefined(inputTokenLogprobs);
        assertAllDefined(outputTokenLogprobs);

        // If token healing did not occur then we would have included an extra token inside
        // our logprobs, so we should remove that.
        const prompt = this._messagesToPrompt(messages);
        for (let i = 0; i < inputTokenLogprobs.length; i++) {
            const healedTokenString = inputTokenLogprobs[i]?.[0]?.[2];
            if (healedTokenString && prompt.endsWith(healedTokenString)) {
                const healedTokenLogprob = inputTokenLogprobs[i]?.[0]?.[0];
                const curNormalizedPromptLogprobs = normalizedPromptLogprobs[i];
                const curInputTokenLogprobs = inputTokenLogprobs[i];
                if (
                    curNormalizedPromptLogprobs === undefined ||
                    curInputTokenLogprobs === undefined ||
                    healedTokenLogprob === undefined
                )
                    throw new Error('No normalized token logprob');
                normalizedPromptLogprobs[i] =
                    (curNormalizedPromptLogprobs * inputTokenLogprobs.length -
                        healedTokenLogprob) /
                    (curInputTokenLogprobs.length - 1);
                inputTokenLogprobs[i] = curInputTokenLogprobs.slice(1);
            }
        }

        const choice = tokenLengthNormalized({
            choices,
            normalized_prompt_logprobs: normalizedPromptLogprobs,
            input_token_logprobs: inputTokenLogprobs,
            output_token_logprobs: outputTokenLogprobs,
        });
        const choiceIndex = choices.indexOf(choice.decision);
        const chosenLogprobsResp = logprobsResp[choiceIndex];

        if (!chosenLogprobsResp) {
            throw new Error('No chosen logprobs resp');
        }

        return {
            ...chosenLogprobsResp,
            text: choice.decision,
            meta_info: {
                ...chosenLogprobsResp.meta_info,
                ...choice.meta_info,
            },
        };
    }

    private _messagesToPrompt(messages: Message[]): string {
        const concatedMessages = this._getConcatedMessages(messages);
        const template = this._chatTemplateGroup.match(this._currentModel.path);
        const latestMessageRole =
            concatedMessages[concatedMessages.length - 1]?.role;
        if (latestMessageRole !== 'assistant') {
            throw new Error("Can only generate on assistant's turn.");
        }
        const prefix_suffix = template.get_prefix_and_suffix(
            latestMessageRole,
            concatedMessages,
        );
        // We want to trim out the end-of-turn token so the model generates something
        let prompt = template.get_prompt(concatedMessages);
        const lastEndTokenIdx = prompt.lastIndexOf(prefix_suffix[1]);
        prompt = prompt.substring(0, lastEndTokenIdx);
        return prompt;
    }

    private async _sendGenerateRequest(
        messages: Message[][],
        genInput?: Omit<
            Partial<GenerateReqInput>,
            'text' | 'input_ids' | 'choices'
        >,
    ): Promise<GenerateRespMultiple>;
    private async _sendGenerateRequest(
        messages: Message[],
        genInput?: Omit<
            Partial<GenerateReqInput>,
            'text' | 'input_ids' | 'choices'
        >,
    ): Promise<GenerateRespSingle>;
    private async _sendGenerateRequest(
        messages: Message[][] | Message[],
        genInput?: Omit<
            Partial<GenerateReqInput>,
            'text' | 'input_ids' | 'choices'
        >,
    ): Promise<GenerateRespMultiple | GenerateRespSingle> {
        const reqInput: GenerateReqInput = {
            text: 'temp',
            ...genInput,
            // Default sampling params:
            sampling_params: {
                max_new_tokens: 128,
                min_new_tokens: 0,
                temperature: 1.0,
                top_p: 1.0,
                top_k: 1 << 30, // Whole vocabulary
                min_p: 0.0,
                frequency_penalty: 0.0,
                presence_penalty: 0.0,
                repetition_penalty: 1.0,
                ignore_eos: false,
                skip_special_tokens: true,
                spaces_between_special_tokens: true,
                n: 1,
                ...genInput?.sampling_params,
            },
        };

        if (messages.every((m) => Array.isArray(m))) {
            reqInput.text = messages.map((m) => this._messagesToPrompt(m));
        } else {
            reqInput.text = this._messagesToPrompt(messages);
        }

        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(reqInput),
        };
        console.log(options);
        const resp = await fetch(`${this._currentModel.url}/generate`, options);
        const json = await resp.json();
        const generateResp = GenerateRespSchema.parse(json);
        return generateResp;
    }
}

function isMetaInfoWithLogProbs(m: MetaInfo): m is MetaInfoWithLogprobs {
    return 'input_token_logprobs' in m;
}

function assertAllDefined<T>(
    arr: (T | null | undefined)[],
): asserts arr is T[] {
    if (arr.some((item) => item == null)) {
        throw new Error('Some items are null or undefined');
    }
}
