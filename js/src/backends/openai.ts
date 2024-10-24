import assert from 'node:assert';
import OpenAI, { type ClientOptions } from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod.mjs';
import { ulid } from 'ulid';
import type {
    Debug,
    GenerateReqNonStreamingInput,
    GenerateReqStreamingInput,
    GenerateRespSingle,
} from '../api.js';
import { postStudioPrompt } from '../debug.js';
import { isNonStreamingInput } from '../utils.js';
import type Backend from './backend.interface.js';
import type { Message } from './backend.interface.js';

export type OpenAISetModelParams = {
    url?: string;
    modelName?: OpenAI.ChatModel;
};

// DOCS COVERAGE: /api-reference/backends
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
        assert(
            !genInput?.sampling_params?.n || genInput?.sampling_params?.n === 1,
            'Generating multiple responses is unimplemented.',
        );
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

                const chatCompletionInput = genInputToChatCompletionInput(
                    messages,
                    this._modelName,
                    genInput,
                );
                const debugReqId = ulid();
                await this._postDebugStudioRequest(
                    genInput?.debug,
                    chatCompletionInput,
                    debugReqId,
                );

                const completion =
                    await this._openai.chat.completions.create(
                        chatCompletionInput,
                    );

                if (genInput?.debug?.debugName) {
                    await postStudioPrompt(
                        {
                            type: genInput?.debug?.debugName,
                            id: genInput?.debug?.debugPromptID ?? undefined,
                            requests: [
                                {
                                    id: debugReqId,
                                    responseContent: JSON.stringify(
                                        completion.choices[0],
                                    ),
                                    responseMetadata: completion,
                                    responseTimestamp: new Date().toISOString(),
                                },
                            ],
                        },
                        genInput.debug,
                    );
                }

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
        const completionCreateParams = genInputToChatCompletionInput(
            messages,
            this._modelName,
            genInput,
        );

        const debugReqId = ulid();

        await this._postDebugStudioRequest(
            genInput?.debug,
            completionCreateParams,
            debugReqId,
        );

        const completion = await this._openai.chat.completions.create(
            completionCreateParams,
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

        if (genInput?.debug?.debugName) {
            await postStudioPrompt(
                {
                    type: genInput?.debug?.debugName,
                    id: genInput?.debug?.debugPromptID ?? undefined,
                    requests: [
                        {
                            id: resp.meta_info.id,
                            responseContent: resp.text,
                            responseMetadata: resp.meta_info,
                            responseTimestamp: new Date().toISOString(),
                        },
                    ],
                },
                genInput.debug,
            );
        }

        return resp;
    }

    private async _postDebugStudioRequest(
        debug: Debug | undefined | null,
        req: OpenAI.Chat.ChatCompletionCreateParams,
        reqId: string,
    ) {
        if (debug?.debugName) {
            await postStudioPrompt(
                {
                    type: debug.debugName,
                    id: debug.debugPromptID ?? undefined,
                    requests: [
                        {
                            id: reqId,
                            requestPrompt: JSON.stringify(req.messages),
                            requestMetadata: {
                                ...req,
                                messsages: undefined,
                            },
                            requestTimestamp: new Date().toISOString(),
                        },
                    ],
                },
                debug,
            );
        }
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
        stop: genInput?.sampling_params?.stop,
        temperature: genInput?.sampling_params?.temperature,
        top_p: genInput?.sampling_params?.top_p,
        stream: genInput?.stream,
    };
    if (genInput?.sampling_params?.json_schema) {
        bodyParams.response_format = {
            type: 'json_schema',
            json_schema: JSON.parse(genInput?.sampling_params?.json_schema),
        };
    }
    if (genInput?.sampling_params?.zod_schema) {
        bodyParams.response_format = zodResponseFormat(
            genInput.sampling_params.zod_schema,
            'response',
        );
    }
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
