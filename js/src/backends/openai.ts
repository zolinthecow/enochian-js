import OpenAI, { type ClientOptions } from 'openai';
import type {
    GenerateReqInput,
    GenerateReqNonStreamingInput,
    GenerateReqStreamingInput,
    GenerateResp,
    GenerateRespSingle,
} from '../api.js';
import { isNonStreamingInput } from '../utils.js';
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
        | AsyncGenerator<GenerateRespSingle, GenerateRespSingle, unknown> {
        if (genInput && !isNonStreamingInput(genInput)) {
            return this._streamResponse(messages, genInput);
        } else {
            return (async () => {
                if (
                    genInput &&
                    isNonStreamingInput(genInput) &&
                    genInput?.choices
                ) {
                    throw new Error('Choices not implemented for OpenAI.');
                }

                const completion = await this._openai.chat.completions.create(
                    genInputToChatCompletionInput(
                        messages,
                        this._modelName,
                        genInput,
                    ),
                );
                return chatCompletionNonStreamingOutputToGenResp(completion);
            })();
        }
    }

    private async *_streamResponse(
        messages: Message[],
        genInput?: Omit<
            GenerateReqStreamingInput,
            'text' | 'input_ids' | 'choices'
        >,
    ): AsyncGenerator<GenerateRespSingle, GenerateRespSingle, unknown> {
        let accumlatedMessage = '';
        const completion = await this._openai.chat.completions.create(
            genInputToChatCompletionInput(messages, this._modelName, genInput),
        );
        let resp: GenerateRespSingle | undefined;
        for await (const chunk of completion) {
            // TODO: Parallel using index
            accumlatedMessage += chunk.choices[0]?.delta.content ?? '';
            resp = chatCompletionChunkToGenRespSingle(chunk);
            if (chunk.choices.length !== 0) yield resp;
        }
        if (!resp) {
            throw new Error('No messages generated?');
        }
        resp.text = accumlatedMessage;
        return resp;
    }
}

function genInputToChatCompletionInput(
    messages: Message[],
    model: OpenAI.ChatModel,
    genInput?: Omit<GenerateReqNonStreamingInput, 'text' | 'input_ids'>,
): OpenAI.Chat.ChatCompletionCreateParamsNonStreaming;
function genInputToChatCompletionInput(
    messages: Message[],
    model: OpenAI.ChatModel,
    genInput?: Omit<GenerateReqStreamingInput, 'text' | 'input_ids'>,
): OpenAI.Chat.ChatCompletionCreateParamsStreaming;
function genInputToChatCompletionInput(
    messages: Message[],
    model: OpenAI.ChatModel,
    genInput?:
        | Omit<GenerateReqNonStreamingInput, 'text' | 'input_ids'>
        | Omit<GenerateReqStreamingInput, 'text' | 'input_ids'>,
):
    | OpenAI.Chat.ChatCompletionCreateParamsNonStreaming
    | OpenAI.Chat.ChatCompletionCreateParamsStreaming {
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
        stream: genInput?.stream,
    };
    if (genInput?.stream) {
        bodyParams.stream_options = {
            include_usage: true,
        };
    }
    return bodyParams;
}

function chatCompletionNonStreamingOutputToGenResp(
    completion: OpenAI.Chat.ChatCompletion,
): GenerateRespSingle {
    const completionToGenResp = (
        _completion: OpenAI.Chat.ChatCompletion,
        idx: number,
    ): GenerateRespSingle => {
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

function chatCompletionChunkToGenRespSingle(
    chunk: OpenAI.Chat.Completions.ChatCompletionChunk,
): GenerateRespSingle {
    const resp: GenerateRespSingle = {
        text: chunk.choices[0]?.delta.content ?? '',
        index: 0,
        meta_info: {
            prompt_tokens: chunk.usage?.prompt_tokens ?? -1,
            completion_tokens: chunk.usage?.completion_tokens ?? -1,
            completion_tokens_wo_jump_forward:
                chunk.usage?.completion_tokens ?? -1,
            finish_reason:
                chunk.choices[0]?.finish_reason === 'length'
                    ? {
                          type: 'length',
                          length: chunk.usage?.completion_tokens ?? 0,
                      }
                    : {
                          type: 'stop',
                          matched: -1, /// OpenAI does not tell us this
                      },
            id: chunk.id,
        },
    };
    return resp;
}
