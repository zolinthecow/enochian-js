import assert from 'node:assert';
import { AutoTokenizer } from '@huggingface/transformers';
import { ulid } from 'ulid';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
    type DebugInfo,
    type GenerateReqInput,
    type GenerateReqNonStreamingInput,
    type GenerateReqStreamingInput,
    type GenerateResp,
    GenerateRespMultipleSchema,
    type GenerateRespSingle,
    GenerateRespSingleSchema,
    GetModelInfoSchema,
    type Message,
    type MetaInfo,
    type MetaInfoWithLogprobs,
    type ToolUseParams,
} from '../api.js';
import { ChatTemplateGroup } from '../chatTemplate.js';
import { tokenLengthNormalized } from '../choices.js';
import { postStudioPrompt } from '../debug.js';
import { isNonStreamingInput } from '../utils.js';
import type Backend from './backend.interface.js';

export type SGLSetModelParams = string;

// DOCS COVERAGE: /api-reference/backends
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
            !(
                genInput?.sampling_params?.regex &&
                genInput?.sampling_params?.json_schema
            ),
            'Cannot support both regex and json_schema',
        );
        if (genInput && !isNonStreamingInput(genInput)) {
            if (genInput.tools !== undefined) {
                return await this._useTools(genInput.tools, messages, genInput);
            } else {
                return this._streamResponse(messages, genInput);
            }
        } else {
            if (
                genInput &&
                isNonStreamingInput(genInput) &&
                genInput?.choices !== undefined
            ) {
                return await this._selectChoice(
                    genInput.choices,
                    messages,
                    genInput,
                );
            } else if (
                genInput &&
                isNonStreamingInput(genInput) &&
                genInput?.tools !== undefined
            ) {
                return await this._useTools(genInput.tools, messages, genInput);
            } else {
                return await this._plainGeneration(messages, genInput);
            }
        }
    }

    async getTokenCount(messages: Message[]): Promise<number> {
        const prompt = this._messagesToPrompt(messages);

        const tokenizer = await AutoTokenizer.from_pretrained(
            this._currentModel.path,
        );
        const { input_ids } = await tokenizer(prompt);

        return input_ids.size;
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

    private async _plainGeneration(
        messages: Message[],
        genInput?: Omit<GenerateReqInput, 'text' | 'input_ids'>,
    ): Promise<GenerateRespSingle> {
        const httpResp = await this._sendGenerateRequest(messages, genInput);
        const httpJson = await httpResp.json();
        const generateResp = GenerateRespSingleSchema.parse(httpJson);

        await this._postDebugStudioResponse(genInput?.debug, generateResp);

        return generateResp;
    }

    private async *_streamResponse(
        messages: Message[],
        genInput?: Omit<GenerateReqInput, 'text' | 'input_ids' | 'choices'>,
    ): AsyncGenerator<GenerateRespSingle, GenerateRespSingle, unknown> {
        const resp = await this._sendGenerateRequest(messages, genInput);
        if (!resp.body) {
            throw new Error('No response body in stream');
        }
        const reader = resp.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let prevMessage: GenerateRespSingle | undefined;

        async function* readStream(
            reader: ReadableStreamDefaultReader<ArrayBuffer>,
        ) {
            while (true) {
                const { done, value } = await reader.read();
                if (done) return;
                yield value;
            }
        }

        for await (const chunk of readStream(reader)) {
            const textChunk = decoder.decode(chunk);
            const lines = textChunk
                .split('\n')
                .map((l) => l.trim())
                .filter(Boolean);

            for (const line of lines) {
                const match = line.match(/^data:\s*(.+)$/);
                if (match?.[1] && match[1] !== '[DONE]') {
                    const generateResp = GenerateRespSingleSchema.parse(
                        JSON.parse(match[1]),
                    );
                    yield {
                        ...generateResp,
                        text: prevMessage
                            ? generateResp.text.slice(prevMessage.text.length)
                            : generateResp.text,
                    };
                    prevMessage = generateResp;
                }
            }
        }

        if (!prevMessage) {
            throw new Error('No chunks were generated??');
        }

        await this._postDebugStudioResponse(genInput?.debug, prevMessage);

        return prevMessage;
    }

    private async _selectChoice(
        choices: string[],
        messages: Message[],
        genInput?: Omit<GenerateReqInput, 'text' | 'input_ids' | 'choices'>,
    ): Promise<GenerateRespSingle> {
        // First cache the prefix
        const throwawayResponse = await this._sendGenerateRequest(messages, {
            sampling_params: {
                max_new_tokens: 0,
            },
            debug: genInput?.debug ?? null,
        });

        const throwawayJson = await throwawayResponse.json();
        const throwaway = GenerateRespSingleSchema.parse(throwawayJson);

        await this._postDebugStudioResponse(genInput?.debug, throwaway);

        const promptLength = throwaway.meta_info.prompt_tokens;
        // Take away one token for assistant start tag + one token for potential token healing
        const logprobStartLength = Math.max(promptLength - 2, 0);

        // Compute logprobs
        const logprobsResponse = await this._sendGenerateRequest(
            choices.map((c) => [
                ...messages,
                { role: 'assistant', content: c } as Message,
            ]),
            {
                sampling_params: {
                    max_new_tokens: 0,
                    temperature: 0,
                },
                return_logprob: true,
                return_text_in_logprobs: true,
                logprob_start_len: logprobStartLength,
                debug: genInput?.debug ?? null,
            },
        );
        const logprobsJson = await logprobsResponse.json();
        const logprobsResp = GenerateRespMultipleSchema.parse(logprobsJson);

        const metaInfos = logprobsResp.map((r) => r.meta_info);

        await this._postDebugStudioResponse(genInput?.debug, logprobsResp);

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
        const toolParams = [
            ...tools.map((t) =>
                t.params
                    ? z.object({
                          toolName: z.literal(t.function.name),
                          params: t.params,
                      })
                    : z.object({ toolName: z.literal(t.function.name) }),
            ),
            z.object({ toolName: z.literal('respondToUser') }),
        ];
        const jsonSchema = {
            anyOf: toolParams.map((t) => zodToJsonSchema(t)),
            $schema: 'http://json-schema.org/draft-07/schema#',
        };
        const messagesWithTools: Message[] = [];
        let putToolsPromptIn = false;
        for (const message of messages) {
            if (message.role !== 'system' && !putToolsPromptIn) {
                messagesWithTools.push({
                    role: 'system',
                    content: `${
                        'You have access to the following tools:\n' +
                        tools
                            .map(
                                (t) =>
                                    `${t.function.name}: ${t.description ?? 'A function'}`,
                            )
                            .join(',\n') +
                        ', and respondToUser: Directly respond to the user\n.'
                    }`,
                });
                putToolsPromptIn = true;
            }
            messagesWithTools.push(message);
        }
        const genResponse = await this._sendGenerateRequest(messagesWithTools, {
            ...genInput,
            sampling_params: {
                ...genInput?.sampling_params,
                json_schema: JSON.stringify(jsonSchema),
            },
        });
        const genJson = await genResponse.json();
        const parsedGenJson = GenerateRespSingleSchema.parse(genJson);
        await this._postDebugStudioResponse(genInput?.debug, parsedGenJson);
        const toolDef = JSON.parse(parsedGenJson.text) as {
            toolName: string;
            params?: unknown;
        };
        if (toolDef.toolName === 'respondToUser') {
            if (genInput && !isNonStreamingInput(genInput)) {
                return this._streamResponse(messages, genInput);
            } else {
                const directResponseResp = await this._sendGenerateRequest(
                    messages,
                    genInput,
                );
                const directRespJson = GenerateRespSingleSchema.parse(
                    await directResponseResp.json(),
                );
                await this._postDebugStudioResponse(
                    genInput?.debug,
                    directRespJson,
                );
                return {
                    text: JSON.stringify([
                        {
                            toolUsed: 'respondToUser',
                            response: directRespJson.text,
                        },
                    ]),
                    meta_info: {
                        ...directRespJson.meta_info,
                        prompt_tokens:
                            parsedGenJson.meta_info.prompt_tokens +
                            directRespJson.meta_info.prompt_tokens,
                        completion_tokens:
                            parsedGenJson.meta_info.completion_tokens +
                            directRespJson.meta_info.completion_tokens,
                        completion_tokens_wo_jump_forward:
                            parsedGenJson.meta_info
                                .completion_tokens_wo_jump_forward +
                            directRespJson.meta_info
                                .completion_tokens_wo_jump_forward,
                    },
                    index: directRespJson.index,
                } as GenerateRespSingle;
            }
        } else {
            const toolToUse = tools.find(
                (t) => t.function.name === toolDef.toolName,
            );
            if (!toolToUse) {
                throw new Error(
                    `No tool was selected: ${JSON.stringify(parsedGenJson, null, 2)}`,
                );
            }
            console.log('💎 GONNA USE TOOL', toolDef);
            let toolFunctionResp: unknown;
            if (toolDef.params) {
                console.log('WITH PARAMS', toolDef.params);
                toolFunctionResp = await toolToUse.function(toolDef.params);
            } else {
                toolFunctionResp = await toolToUse.function();
            }
            const toReturn: GenerateRespSingle = {
                text: JSON.stringify([
                    {
                        toolUsed: toolDef.toolName,
                        response: toolFunctionResp,
                    },
                ]),
                meta_info: parsedGenJson.meta_info,
                index: parsedGenJson.index,
            };
            if (genInput && !isNonStreamingInput(genInput)) {
                const generator = async function* () {
                    yield toReturn;
                    return toReturn;
                };
                return generator();
            } else {
                return toReturn;
            }
        }
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
        messages: Message[][] | Message[],
        genInput?: Omit<GenerateReqInput, 'text' | 'input_ids' | 'choices'>,
    ): Promise<Response> {
        let reqId: string | string[] = genInput?.rid ?? ulid();
        if (Array.isArray(messages[0])) {
            reqId = genInput?.rid ?? messages.map((_) => ulid());
        }

        let jsonSchema: string | undefined =
            genInput?.sampling_params?.json_schema;
        if (genInput?.sampling_params?.zod_schema) {
            jsonSchema = JSON.stringify(
                zodToJsonSchema(genInput?.sampling_params?.zod_schema, {
                    emailStrategy: 'pattern:zod',
                }),
            );
        }

        const reqInput: Omit<GenerateReqInput, 'debug' | 'zod_schema'> = {
            text: 'temp',
            ...genInput,
            rid: reqId,
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
                json_schema: jsonSchema,
                zod_schema: undefined,
            },
        };

        if (messages.every((m) => Array.isArray(m))) {
            reqInput.text = messages.map((m) => this._messagesToPrompt(m));
        } else {
            reqInput.text = this._messagesToPrompt(messages);
        }

        await this._postDebugStudioRequest(genInput?.debug, reqInput);
        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(reqInput),
        };

        const resp = await fetch(`${this._currentModel.url}/generate`, options);
        return resp;
    }

    private async _postDebugStudioRequest(
        debug: DebugInfo | undefined | null,
        req: Omit<GenerateReqInput, 'debug' | 'zod_schema'>,
    ) {
        if (debug?.debugName) {
            assert(
                req.rid != null &&
                    (Array.isArray(req.rid)
                        ? req.rid.every((r) => r != null)
                        : true),
                'Must provide request ID for debug studio.',
            );
            await postStudioPrompt(
                {
                    type: debug.debugName,
                    id: debug.debugPromptID ?? undefined,
                    requests: Array.isArray(req.text)
                        ? req.text.map((t, i) => ({
                              id: (req.rid as string[])[i],
                              requestPrompt: t,
                              requestMetadata: { ...req, text: undefined },
                              requestTimestamp: new Date().toISOString(),
                          }))
                        : [
                              {
                                  id: req.rid,
                                  requestPrompt: req.text,
                                  requestMetadata: {
                                      ...req,
                                      text: undefined,
                                  },
                                  requestTimestamp: new Date().toISOString(),
                              },
                          ],
                },
                debug,
            );
        }
    }
    private async _postDebugStudioResponse(
        debug: DebugInfo | undefined | null,
        resp: GenerateResp,
    ) {
        if (debug?.debugName) {
            await postStudioPrompt(
                {
                    type: debug.debugName,
                    id: debug.debugPromptID ?? undefined,
                    requests: [
                        {
                            id: Array.isArray(resp)
                                ? resp[0]?.meta_info.id
                                : resp.meta_info.id,
                            responseContent: Array.isArray(resp)
                                ? JSON.stringify(resp.map((l) => l.text))
                                : resp.text,
                            responseMetadata: Array.isArray(resp)
                                ? JSON.stringify(resp.map((r) => r.meta_info))
                                : resp.meta_info,
                            responseTimestamp: new Date().toISOString(),
                        },
                    ],
                },
                debug,
            );
        }
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
