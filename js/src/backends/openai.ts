import assert from 'node:assert';
import OpenAI, { type ClientOptions } from 'openai';
import type { APIPromise } from 'openai/core.mjs';
import { zodFunction, zodResponseFormat } from 'openai/helpers/zod.mjs';
import { ulid } from 'ulid';
import { z } from 'zod';
import type {
    DebugInfo,
    GenerateReqNonStreamingInput,
    GenerateReqStreamingInput,
    GenerateRespSingle,
    ToolUseParams,
} from '../api.js';
import { postStudioPrompt } from '../debug.js';
import { isNonStreamingInput } from '../utils.js';
import type Backend from './backend.interface.js';
import type { Message } from './backend.interface.js';

export type OpenAISetModelParams = {
    baseURL?: string;
    modelName?: OpenAI.ChatModel;
};

// DOCS COVERAGE: /api-reference/backends
export default class OpenAIBackend implements Backend {
    private _modelName: OpenAI.ChatModel = 'gpt-4o-mini';
    private _openai: OpenAI;

    constructor();
    constructor(openAIClient: OpenAI);
    constructor(openAIOpts: ClientOptions);
    constructor(opts?: OpenAI | ClientOptions) {
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

    setModel({ baseURL: url, modelName }: OpenAISetModelParams): void {
        if (url) this._openai.baseURL = url;
        if (modelName) this._modelName = modelName;
    }

    async gen(
        message: Message[],
        genInput?: Omit<GenerateReqNonStreamingInput, 'text' | 'input_ids'>,
    ): Promise<GenerateRespSingle>;
    async gen(
        message: Message[],
        genInput?: Omit<GenerateReqStreamingInput, 'text' | 'input_ids'>,
    ): Promise<AsyncGenerator<GenerateRespSingle, GenerateRespSingle, unknown>>;
    async gen(
        messages: Message[],
        genInput?:
            | Omit<GenerateReqNonStreamingInput, 'text' | 'input_ids'>
            | Omit<GenerateReqStreamingInput, 'text' | 'input_ids'>,
    ): Promise<
        | GenerateRespSingle
        | AsyncGenerator<GenerateRespSingle, GenerateRespSingle, unknown>
    > {
        assert(
            !genInput?.sampling_params?.n || genInput?.sampling_params?.n === 1,
            'Generating multiple responses is unimplemented.',
        );
        assert(
            !(genInput && isNonStreamingInput(genInput) && genInput?.choices),
            'Choices not implemented for OpenAI.',
        );
        if (genInput && !isNonStreamingInput(genInput)) {
            if (genInput.tools) {
                return this._useTools(genInput.tools, messages, genInput);
            } else {
                return this._streamResponse(messages, genInput);
            }
        } else {
            if (genInput?.tools) {
                return this._useTools(genInput.tools, messages, genInput);
            } else {
                return await this._plainGeneration(messages, genInput);
            }
        }
    }

    private async _createChatCompletion<
        T extends
            | Omit<GenerateReqNonStreamingInput, 'text' | 'input_ids'>
            | Omit<GenerateReqStreamingInput, 'text' | 'input_ids'>,
    >(
        messages: Message[],
        debugReqID: string,
        genInput?: T,
    ): Promise<
        GetChatCompletionReturnType<T extends { stream: true } ? true : false>
    > {
        const chatCompletionInput = genInputToChatCompletionInput(
            messages,
            this._modelName,
            // @ts-ignore
            genInput,
        );
        await this._postDebugStudioRequest(
            genInput?.debug,
            chatCompletionInput,
            debugReqID,
        );

        const completion =
            await this._openai.chat.completions.create(chatCompletionInput);

        return completion as GetChatCompletionReturnType<
            T extends { stream: true } ? true : false
        >;
    }

    private async _plainGeneration(
        messages: Message[],
        genInput?: Omit<GenerateReqNonStreamingInput, 'text' | 'input_ids'>,
    ): Promise<GenerateRespSingle> {
        const debugReqID = ulid();
        const completion = await this._createChatCompletion(
            messages,
            debugReqID,
            genInput,
        );

        const resp = chatCompletionNonStreamingOutputToGenResp(completion);
        await this._postDebugStudioResponse(genInput?.debug, resp, debugReqID);

        return resp;
    }

    private async *_streamResponse(
        messages: Message[],
        genInput?: Omit<
            GenerateReqStreamingInput,
            'text' | 'input_ids' | 'choices'
        >,
    ): AsyncGenerator<GenerateRespSingle, GenerateRespSingle, unknown> {
        let accumulatedMessage = '';
        const debugReqID = ulid();

        const completion = await this._createChatCompletion(
            messages,
            debugReqID,
            genInput,
        );

        let resp: GenerateRespSingle | undefined;
        for await (const chunk of completion) {
            // TODO: Parallel using index
            accumulatedMessage += chunk.choices[0]?.delta.content ?? '';
            resp = chatCompletionChunkToGenRespSingle(chunk);
            if (chunk.choices.length !== 0) yield resp;
        }
        if (!resp) {
            throw new Error('No messages generated?');
        }
        resp.text = accumulatedMessage;

        await this._postDebugStudioResponse(genInput?.debug, resp, debugReqID);

        return resp;
    }

    private async _useTools(
        tools: ToolUseParams,
        messages: Message[],
        genInput?: Omit<GenerateReqNonStreamingInput, 'text' | 'input_ids'>,
    ): Promise<GenerateRespSingle>;
    private async _useTools(
        tools: ToolUseParams,
        messages: Message[],
        genInput?: Omit<GenerateReqStreamingInput, 'text' | 'input_ids'>,
    ): Promise<AsyncGenerator<GenerateRespSingle, GenerateRespSingle, unknown>>;
    private async _useTools(
        tools: ToolUseParams,
        messages: Message[],
        genInput?:
            | Omit<GenerateReqNonStreamingInput, 'text' | 'input_ids'>
            | Omit<GenerateReqStreamingInput, 'text' | 'input_ids'>,
    ): Promise<
        | AsyncGenerator<GenerateRespSingle, GenerateRespSingle, unknown>
        | GenerateRespSingle
    > {
        if (genInput && !isNonStreamingInput(genInput)) {
            return this._useToolsStreaming(tools, messages, genInput);
        } else {
            return await this._useToolsNonStreaming(tools, messages, genInput);
        }
    }
    private async _handleToolCalls(
        tools: ToolUseParams,
        toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[],
    ) {
        const functionResponses: { toolUsed: string; response: unknown }[] = [];
        for (const toolCall of toolCalls) {
            const selectedTool = tools.find(
                (t) => t.name === toolCall.function.name,
            );
            assert(selectedTool, 'Selected nonexistant function');
            let response: unknown;
            if (selectedTool.params && toolCall.function.arguments !== '{}') {
                response = await selectedTool.function(
                    selectedTool.params.parse(
                        JSON.parse(toolCall.function.arguments),
                    ),
                );
            } else {
                response = await selectedTool.function();
            }
            console.log('CALLED TOOL', toolCall, response);
            functionResponses.push({
                toolUsed: selectedTool.name,
                response,
            });
        }
        return functionResponses;
    }
    private async _useToolsNonStreaming(
        tools: ToolUseParams,
        messages: Message[],
        genInput?: Omit<GenerateReqNonStreamingInput, 'text' | 'input_ids'>,
    ): Promise<GenerateRespSingle> {
        const debugReqID = ulid();
        const completion = await this._createChatCompletion(
            messages,
            debugReqID,
            genInput,
        );

        const resp = chatCompletionNonStreamingOutputToGenResp(completion);
        if (completion.choices[0]?.message.tool_calls) {
            const functionResponses = await this._handleToolCalls(
                tools,
                completion.choices[0]?.message.tool_calls,
            );
            resp.text = JSON.stringify(functionResponses);
        } else {
            resp.text = JSON.stringify([
                {
                    toolUsed: 'respondToUser',
                    response: resp.text,
                },
            ]);
        }

        await this._postDebugStudioResponse(genInput?.debug, resp, debugReqID);

        return resp;
    }
    private async *_useToolsStreaming(
        tools: ToolUseParams,
        messages: Message[],
        genInput?: Omit<GenerateReqStreamingInput, 'text' | 'input_ids'>,
    ) {
        const debugReqID = ulid();
        const completion = await this._createChatCompletion(
            messages,
            debugReqID,
            genInput,
        );

        let isToolCall = false;
        const toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] =
            [];
        const curToolCall: OpenAI.Chat.Completions.ChatCompletionMessageToolCall =
            {
                id: 'abc123',
                type: 'function',
                function: {
                    name: '',
                    arguments: '',
                },
            };
        let accumulatedMessage = '';
        let resp: GenerateRespSingle | undefined;

        for await (const chunk of completion) {
            if (!isToolCall && chunk.choices[0]?.delta.tool_calls) {
                isToolCall = true;
            }
            if (isToolCall) {
                if (chunk.choices[0]?.delta.tool_calls?.[0]?.function?.name) {
                    toolCalls.push(curToolCall);
                    curToolCall.function.arguments = '';
                    curToolCall.function.name =
                        chunk.choices[0].delta.tool_calls[0].function.name;
                } else {
                    assert(
                        chunk.choices[0]?.delta.tool_calls?.[0]?.function
                            ?.arguments,
                        'If not generating a function name it must be generating arguments',
                    );
                    curToolCall.function.arguments +=
                        chunk.choices[0].delta.tool_calls[0].function.arguments;
                }
                resp = chatCompletionChunkToGenRespSingle(chunk);
            } else {
                accumulatedMessage += chunk.choices[0]?.delta.content ?? '';
                resp = chatCompletionChunkToGenRespSingle(chunk);
                if (chunk.choices.length !== 0) yield resp;
            }
        }

        assert(
            resp !== undefined,
            'Tool call stream must generate at least one chunk',
        );
        if (!isToolCall) {
            resp.text = JSON.stringify([
                {
                    toolUsed: 'respondToUser',
                    response: accumulatedMessage,
                },
            ]);
            return resp;
        }

        const functionResponses = await this._handleToolCalls(tools, toolCalls);
        resp.text = JSON.stringify(functionResponses);

        await this._postDebugStudioResponse(genInput?.debug, resp, debugReqID);

        yield resp;
        return resp;
    }

    private async _postDebugStudioResponse(
        debug: DebugInfo | undefined | null,
        resp: GenerateRespSingle,
        reqID: string,
    ) {
        if (debug?.debugName) {
            await postStudioPrompt(
                {
                    type: debug?.debugName,
                    id: debug?.debugPromptID ?? undefined,
                    requests: [
                        {
                            id: resp.meta_info.id,
                            responseContent: resp.text,
                            responseMetadata: resp.meta_info,
                            responseTimestamp: new Date().toISOString(),
                        },
                    ],
                },
                debug,
            );
        }
    }

    private async _postDebugStudioRequest(
        debug: DebugInfo | undefined | null,
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
    if (genInput?.tools) {
        bodyParams.tools = [];
        for (const tool of genInput.tools) {
            bodyParams.tools.push(
                zodFunction({
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.params ?? z.object({}),
                }),
            );
            // bodyParams.tools.push({
            //     type: "function",
            //     function: {
            //         name: tool.name,
            //         description: tool.description,
            //         parameters: tool.params
            //             ? {
            //                   ...zodToJsonSchema(tool.params),
            //                   additionalProperties: false,
            //               }
            //             : {
            //                   type: "object",
            //                   properties: {},
            //                   additionalProperties: false,
            //               },
            //         strict: true,
            //     },
            // });
        }
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

// biome-ignore lint/suspicious/noExplicitAny: Needs to be any
type GetOverloadReturnType<T, Args extends any[]> = T extends {
    (...args: Args): infer R;
    // biome-ignore lint/suspicious/noExplicitAny: Needs to be any
    (...args: any): any;
}
    ? R
    : T extends (...args: Args) => infer R
      ? R
      : never;

const _openaiTypeHelper = null as unknown as OpenAI;
type GetChatCompletionReturnType<T extends boolean> = T extends true
    ? Awaited<
          GetOverloadReturnType<
              typeof _openaiTypeHelper.chat.completions.create,
              [OpenAI.Chat.ChatCompletionCreateParamsStreaming]
          >
      >
    : Awaited<APIPromise<OpenAI.Chat.Completions.ChatCompletion>>;
