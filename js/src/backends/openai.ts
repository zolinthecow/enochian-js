import OpenAI, { type ClientOptions } from 'openai';
import type { GenerateReqInput, GenerateResp } from '../api.js';
import type { Message } from './backend.interface.js';
import type Backend from './backend.interface.js';

export type CompletionCreateParams = Parameters<
    InstanceType<typeof OpenAI>['chat']['completions']['create']
>;

export type OpenAISetModelParams = {
    url?: string;
    modelName?: OpenAI.ChatModel;
};

export default class OpenAIBackend implements Backend {
    private _modelName: OpenAI.ChatModel = 'gpt-4o-mini';
    private _openai: OpenAI;

    constructor(openAIClient: OpenAI);
    constructor(openAIOpts: ClientOptions);
    constructor(opts: OpenAI | ClientOptions) {
        if (opts instanceof OpenAI) {
            this._openai = opts;
        } else {
            this._openai = new OpenAI(opts);
        }
    }

    clone() {
        return new OpenAIBackend(this._openai);
    }

    getPrompt(messages: Message[]): string {
        return messages.reduce(
            (acc, cur) => acc + `${cur.role}: ${cur.content}\n`,
            '',
        );
    }

    setModel({ url, modelName }: OpenAISetModelParams): void {
        if (url) this._openai.baseURL = url;
        if (modelName) this._modelName = modelName;
    }

    async gen(
        messages: Message[],
        genInput?: Omit<Partial<GenerateReqInput>, 'text' | 'input_ids'>,
    ): Promise<GenerateResp> {
        if (genInput?.choices) {
            throw new Error('Choices not implemented for OpenAI.');
        }

        const completion = await this._openai.chat.completions.create(
            genInputToChatCompletionInput(messages, this._modelName, genInput),
        );
        return chatCompletionNonStreamingOutputToGenResp(completion);
    }
}

// TODO: This should be overloaded for streaming versus not streaming
function genInputToChatCompletionInput(
    messages: Message[],
    model: OpenAI.ChatModel,
    genInput?: Omit<Partial<GenerateReqInput>, 'text' | 'input_ids'>,
) {
    const bodyParams: OpenAI.Chat.ChatCompletionCreateParams = {
        messages,
        model,
        n: genInput?.sampling_params?.n,
        frequency_penalty: genInput?.sampling_params?.frequency_penalty,
        logprobs: genInput?.return_logprob,
        top_logprobs: genInput?.top_logprobs_num,
        max_completion_tokens: genInput?.sampling_params?.max_new_tokens,
        presence_penalty: genInput?.sampling_params?.presence_penalty,
        // TODO: JSON SCHEMA
        // response_format
        stop: genInput?.sampling_params?.stop,
        temperature: genInput?.sampling_params?.temperature,
        top_p: genInput?.sampling_params?.top_p,
        // stream: genInput?.stream ?? false,
        stream: false,
    };
    return bodyParams;
}

function chatCompletionNonStreamingOutputToGenResp(
    completion: OpenAI.Chat.ChatCompletion,
): GenerateResp {
    const completionToGenResp = (
        _completion: OpenAI.Chat.ChatCompletion,
        idx: number,
    ): GenerateResp => {
        if (idx > _completion.choices.length)
            throw new Error('Index out of range');
        return {
            text: completion.choices[idx]?.message.content ?? '',
            index: idx,
            meta_info: {
                prompt_tokens: completion.usage?.prompt_tokens ?? -1,
                completion_tokens: completion.usage?.completion_tokens ?? -1,
                completion_tokens_wo_jump_forward:
                    completion.usage?.completion_tokens ?? -1,
                finish_reason:
                    completion.choices[idx]?.finish_reason === 'length'
                        ? {
                              type: 'length',
                              length: completion.usage?.completion_tokens ?? 0,
                          }
                        : {
                              type: 'stop',
                              matched: -1, /// OpenAI does not tell us this
                          },
                id: completion.id,
            },
        };
    };
    if (completion.choices.length === 0) {
        throw new Error('No completions');
    } else if (completion.choices.length === 1) {
        return completionToGenResp(completion, 0);
    } else {
        throw new Error('UNIMPLEMENTED');
        // I'm not sure how I'm going to go about supporting parallel generations just yet
        // return completion.choices.map((_, i) => completionToGenResp(completion, i));
    }
}
