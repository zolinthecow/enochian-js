import assert from 'node:assert';
import type { ClientOptions, OpenAI } from 'openai';
import { ulid } from 'ulid';
import type { z } from 'zod';
import type {
    DebugInfo,
    GenerateReqNonStreamingInput,
    GenerateReqStreamingInput,
    GenerateRespSingle,
    Message,
    MetaInfo,
    ToolUseParams,
} from './api.js';
import type Backend from './backends/backend.interface.js';
import OpenAIBackend from './backends/openai.js';
import SGLBackend, { type SGLSetModelParams } from './backends/sgl.js';
import { isNonStreamingInput } from './utils.js';

type Stringifiable = string | number | boolean | bigint;

// DOCS COVERAGE: /api-reference/program-state
export default class ProgramState {
    private _messages: Array<Message>;
    private _answers: { [key: string]: GenerateRespSingle };
    private _backend: Backend;
    private _debug: DebugInfo | null;

    constructor(
        backend: Backend = new SGLBackend(),
        messages: Array<Message> = [],
        answers: { [key: string]: GenerateRespSingle } = {},
        debug: DebugInfo | null = null,
    ) {
        this._messages = [...messages];
        this._answers = { ...answers };
        this._backend = backend;
        this._debug = debug;
    }

    async fromSGL(opts: SGLSetModelParams): Promise<ProgramState> {
        if (!(this._backend instanceof SGLBackend)) {
            this._backend = new SGLBackend();
        }
        await this._backend.setModel(opts);
        return this;
    }
    fromOpenAI(opts?: {
        client?: ClientOptions;
        modelName?: OpenAI.ChatModel;
        baseURL?: string;
    }): ProgramState {
        if (!(this._backend instanceof OpenAIBackend)) {
            if (opts?.client) this._backend = new OpenAIBackend(opts.client);
            else this._backend = new OpenAIBackend();
        } else {
            if (opts?.client) {
                this._backend = new OpenAIBackend(opts.client);
            }
        }
        (this._backend as OpenAIBackend).setModel({
            baseURL: opts?.baseURL,
            modelName: opts?.modelName,
        });
        return this;
    }
    getBackendType(): 'OpenAI' | 'SGL' {
        if (this._backend instanceof OpenAIBackend) {
            return 'OpenAI';
        } else {
            return 'SGL';
        }
    }

    private _createRoleFunction(role: 'user' | 'assistant' | 'system') {
        function roleFunction(
            this: ProgramState,
            strings: TemplateStringsArray,
            ...values: Stringifiable[]
        ): Message[];
        function roleFunction(
            this: ProgramState,
            strings: TemplateStringsArray,
            ...values: (
                | GenAsyncFunctionReturnType
                | Promise<Stringifiable>
                | Stringifiable
            )[]
        ): Promise<Message[]>;
        function roleFunction(
            this: ProgramState,
            strings: TemplateStringsArray,
            ...values: (
                | GenAsyncGeneratorReturnType
                | GenAsyncFunctionReturnType
                | Promise<Stringifiable>
                | Stringifiable
            )[]
        ): AsyncGenerator<Message, Message[], void>;
        function roleFunction(
            this: ProgramState,
            strings: TemplateStringsArray,
            ...values:
                | Stringifiable[]
                | (
                      | GenAsyncFunctionReturnType
                      | Promise<Stringifiable>
                      | Stringifiable
                  )[]
                | (
                      | GenAsyncGeneratorReturnType
                      | GenAsyncFunctionReturnType
                      | Promise<Stringifiable>
                      | Stringifiable
                  )[]
        ):
            | Message[]
            | Promise<Message[]>
            | AsyncGenerator<Message, Message[], void> {
            if (values.some((v) => isGenAsyncGenerator(v))) {
                return async function* (this: ProgramState) {
                    const generator = this._processRoleStringTemplate(
                        role,
                        strings,
                        ...(values as (
                            | GenAsyncGeneratorReturnType
                            | GenAsyncFunctionReturnType
                            | Promise<Stringifiable>
                            | Stringifiable
                        )[]),
                    );
                    let chunk = await generator.next();
                    while (!chunk.done) {
                        yield chunk.value;
                        chunk = await generator.next();
                    }
                    // Get last message
                    const lastChunk = chunk;
                    if (!lastChunk.value || !lastChunk.done) {
                        throw new Error('Missing return from gen');
                    }
                    return lastChunk.value;
                }.call(this);
            } else if (
                values.some(
                    (v) => isGenAsyncFunction(v) || v instanceof Promise,
                )
            ) {
                return this._processRoleStringTemplate(
                    role,
                    strings,
                    ...(values as (
                        | GenAsyncFunctionReturnType
                        | Promise<Stringifiable>
                        | Stringifiable
                    )[]),
                );
            } else {
                return this._processRoleStringTemplate(
                    role,
                    strings,
                    ...(values as Stringifiable[]),
                );
            }
        }
        return roleFunction;
    }

    user = this._createRoleFunction('user');
    assistant = this._createRoleFunction('assistant');
    system = this._createRoleFunction('system');

    private _processRoleStringTemplate(
        role: 'system' | 'user' | 'assistant',
        strings: TemplateStringsArray,
        ...values: Stringifiable[]
    ): Message[];
    private _processRoleStringTemplate(
        role: 'system' | 'user' | 'assistant',
        strings: TemplateStringsArray,
        ...values: (
            | GenAsyncFunctionReturnType
            | Promise<Stringifiable>
            | Stringifiable
        )[]
    ): Promise<Message[]>;
    private _processRoleStringTemplate(
        role: 'system' | 'user' | 'assistant',
        strings: TemplateStringsArray,
        ...values: (
            | GenAsyncGeneratorReturnType
            | GenAsyncFunctionReturnType
            | Promise<Stringifiable>
            | Stringifiable
        )[]
    ): AsyncGenerator<Message, Message[], void>;
    private _processRoleStringTemplate(
        role: 'system' | 'user' | 'assistant',
        strings: TemplateStringsArray,
        ...values:
            | Stringifiable[]
            | (
                  | GenAsyncFunctionReturnType
                  | Promise<Stringifiable>
                  | Stringifiable
              )[]
            | (
                  | GenAsyncGeneratorReturnType
                  | GenAsyncFunctionReturnType
                  | Promise<Stringifiable>
                  | Stringifiable
              )[]
    ):
        | Message[]
        | Promise<Message[]>
        | AsyncGenerator<Message, Message[], void> {
        const allMessages: Message[] = [];
        function createLatestMessage(): Message {
            allMessages.push({ role, content: '' });
            return (
                allMessages[allMessages.length - 1] ?? {
                    role,
                    content: '',
                }
            );
        }
        function getFullMessage() {
            return {
                role,
                content: allMessages.reduce((acc, m) => acc + m.content, ''),
            };
        }

        // If there is any async generator function it should become a generator
        if (values.some((v) => isGenAsyncGenerator(v))) {
            return async function* (this: ProgramState) {
                // Split up any interpolated gen's into it's own message
                let latestMessage = createLatestMessage();
                for (let i = 0; i < strings.length; i++) {
                    latestMessage.content += strings[i];
                    if (i < values.length) {
                        const value = values[i];
                        if (isGenAsyncGenerator(value)) {
                            latestMessage = createLatestMessage();
                            const generator = value([
                                ...this._messages,
                                getFullMessage(),
                            ]);
                            for await (const messageChunk of generator) {
                                latestMessage.content += messageChunk.content;
                                latestMessage.id = messageChunk.id;
                                latestMessage.genID = messageChunk.genID;
                                yield messageChunk;
                            }
                            latestMessage = createLatestMessage();
                        } else if (isGenAsyncFunction(value)) {
                            latestMessage = createLatestMessage();
                            const generatedMessage = await value([
                                ...this._messages,
                                getFullMessage(),
                            ]);
                            latestMessage.content = generatedMessage.content;
                            latestMessage.id = generatedMessage.id;
                            latestMessage.genID = generatedMessage.genID;
                            yield latestMessage;
                            latestMessage = createLatestMessage();
                        } else if (value instanceof Promise) {
                            const awaited = (await value).toString();
                            latestMessage.content += awaited;
                            yield {
                                role,
                                content: awaited,
                            };
                        } else if (value !== undefined) {
                            const toAppend = value.toString();
                            latestMessage.content += toAppend;
                            yield {
                                role,
                                content: toAppend,
                            };
                        }
                    }
                }
                return allMessages.filter((m) => m.content !== '');
            }.call(this);
        } else if (
            values.some((v) => isGenAsyncFunction(v) || v instanceof Promise)
        ) {
            // Should only be async if there is an async function inside `values`.
            const processTemplate = async (): Promise<Message[]> => {
                let latestMessage = createLatestMessage();
                for (let i = 0; i < strings.length; i++) {
                    latestMessage.content += strings[i];
                    if (i < values.length) {
                        const value = values[i];
                        if (isGenAsyncFunction(value)) {
                            latestMessage = createLatestMessage();
                            const generatedMessage = await value([
                                ...this._messages,
                                getFullMessage(),
                            ]);
                            // Should trim out the generated end tokens
                            latestMessage.content = generatedMessage.content;
                            latestMessage.id = generatedMessage.id;
                            latestMessage.genID = generatedMessage.genID;
                            latestMessage = createLatestMessage();
                        } else if (value instanceof Promise) {
                            const awaited = await value;
                            latestMessage.content += awaited.toString();
                        } else if (value !== undefined) {
                            const toAppend = value.toString();
                            latestMessage.content += toAppend;
                        }
                    }
                }
                return allMessages.filter((m) => m.content !== '');
            };

            return (async () => {
                return await processTemplate();
            })();
        } else {
            // If there are no async functions inside the string template then just concat them together
            return [
                {
                    role,
                    content: strings.reduce(
                        (acc, str, i) => acc + str + (values[i] || ''),
                        '',
                    ),
                },
            ];
        }
    }

    add(
        messages: Message[],
        metadata?: { [key: string]: unknown },
    ): ProgramState;
    add(
        messages: Promise<Message[]>,
        metadata?: { [key: string]: unknown },
    ): Promise<ProgramState>;
    add(
        messages: AsyncGenerator<Message, Message[], undefined>,
        metadata?: { [key: string]: unknown },
    ): AsyncGenerator<Message>;
    add(
        messages:
            | Message[]
            | Promise<Message[]>
            | AsyncGenerator<Message, Message[], undefined>,
        metadata?: { [key: string]: unknown },
    ): ProgramState | Promise<ProgramState> | AsyncGenerator<Message> {
        function getMessages(messages: Message[]) {
            const newMessages: Message[] = [];
            for (const message of messages) {
                const m = message;
                if (m.role === 'system') {
                    m.probablyPrefixCached = true;
                }
                newMessages.push(m);
            }
            return newMessages;
        }

        if (messages instanceof Promise) {
            return (async () => {
                const m: Message[] = [];
                for (const message of await messages) {
                    m.push({ ...message, ...metadata });
                }

                this._messages.push(...getMessages(m));
                return this;
            })();
        } else if (isAsyncMessageGenerator(messages)) {
            return async function* (this: ProgramState) {
                let chunk = await messages.next();
                while (!chunk.done) {
                    yield chunk.value;
                    chunk = await messages.next();
                }
                // Get last message
                const lastChunk = chunk;
                if (!lastChunk.value || !lastChunk.done) {
                    throw new Error('Missing return from gen');
                }
                const allMessages = lastChunk.value;
                const m: Message[] = [];
                for (const message of allMessages) {
                    m.push({ ...message, ...metadata });
                }
                this._messages.push(...getMessages(m));
            }.call(this);
        } else {
            this._messages.push(
                ...getMessages(
                    (messages as Message[]).map((m) => ({ ...m, ...metadata })),
                ),
            );
            return this;
        }
    }

    gen(
        answerKey: string,
        genInput?: Omit<GenerateReqNonStreamingInput, 'text' | 'input_ids'>,
    ): GenAsyncFunctionReturnType;
    gen(
        answerKey: string,
        genInput?: Omit<GenerateReqStreamingInput, 'text' | 'input_ids'>,
    ): GenAsyncGeneratorReturnType;
    gen(
        answerKey: string,
        genInput?:
            | Omit<GenerateReqNonStreamingInput, 'text' | 'input_ids'>
            | Omit<GenerateReqStreamingInput, 'text' | 'input_ids'>,
    ): GenAsyncFunctionReturnType | GenAsyncGeneratorReturnType {
        // If debug and there is no prompt ID then set it
        if (this._debug && !this._debug.debugPromptID) {
            this._debug.debugPromptID = ulid();
        }
        assert(
            !genInput?.sampling_params?.n || genInput?.sampling_params?.n === 1,
            'Generating multiple responses is unimplemented.',
        );

        async function getTransformedMessages(messages: Message[]) {
            if (!genInput?.transform) return messages;
            const messagesToTransform: Message[] = [];
            const prefixCachedMessages: Message[] = [];
            const lastMessage = messages[messages.length - 1];
            if (!lastMessage) {
                console.error('LAST MESSAGE IS UNDEFINED?');
                return messages;
            }

            let isInPrefix = true;
            for (let i = 0; i < messages.length - 1; i++) {
                const m = messages[i];
                if (!m) {
                    console.warn('Undefined message found in transform');
                    continue;
                }
                if (!m.probablyPrefixCached) {
                    isInPrefix = false;
                } else if (!isInPrefix) {
                    // If it's marked as probablyPrefixCached but we've left the prefix already then
                    // the prompt is messed up.
                    console.warn(
                        'Non-contiguous prefix block found, you *probably* messed up!! Will not apply transform',
                    );
                    return messages;
                }
                if (isInPrefix) prefixCachedMessages.push(m);
                else messagesToTransform.push(m);
            }
            const transformedMessages =
                await genInput.transform(messagesToTransform);
            return [
                ...prefixCachedMessages,
                ...transformedMessages,
                lastMessage,
            ];
        }
        if (!genInput || isNonStreamingInput(genInput)) {
            return async (messages: Message[]): Promise<Message> => {
                const messagesToUse = await getTransformedMessages(messages);
                const ans = await this._backend.gen(messagesToUse, {
                    ...genInput,
                    debug: this._debug,
                });
                if (Array.isArray(ans)) {
                    throw new Error('Multiple generations not implemented.');
                }
                this._answers[answerKey] = ans;
                return {
                    role: 'assistant',
                    content: ans.text,
                    id: answerKey,
                    genID: answerKey,
                };
            };
        } else {
            const self = this;
            return async function* (messages: Message[]) {
                const messagesToUse = await getTransformedMessages(messages);
                // We expect the function to yield individual chunks, then return the final message
                const generator = await self._backend.gen(messagesToUse, {
                    ...genInput,
                    debug: self._debug,
                });
                // Cannot do `for await` since I want the return value as well
                let chunk: IteratorResult<GenerateRespSingle> =
                    await generator.next();
                while (!chunk.done) {
                    yield {
                        role: 'assistant',
                        content: chunk.value.text,
                        id: answerKey,
                        genID: answerKey,
                    };
                    chunk = await generator.next();
                }
                // Get last message
                const fullMessage = chunk;
                if (!fullMessage.value || !fullMessage.done) {
                    throw new Error('Missing return from gen');
                }
                self._answers[answerKey] = fullMessage.value;
            };
        }
    }

    async getTokenCount(messages: Message[]) {
        return await this._backend.getTokenCount(messages);
    }

    fork(_numForks?: number) {
        const numForks = _numForks && _numForks > 0 ? _numForks : 1;
        return Array(numForks)
            .fill(null)
            .map(
                () =>
                    new ProgramState(
                        this._backend.clone(),
                        this._messages,
                        this._answers,
                        this._debug,
                    ),
            );
    }

    get(key: string): string | undefined;
    get<Z extends z.ZodType>(
        key: string,
        options: { from: 'zod'; schema: Z },
    ): z.infer<Z> | undefined;
    get<T extends ToolUseParams>(
        key: string,
        options: { from: 'tools'; tools: T },
    ): (ToolResponse<T> | { toolUsed: 'respondToUser'; response: string })[];
    get<Z extends z.ZodType, T extends ToolUseParams>(
        key: string,
        options?: { from: 'zod'; schema: Z } | { from: 'tools'; tools: T },
    ):
        | string
        | z.infer<Z>
        | (ToolResponse<T> | { toolUsed: 'respondToUser'; response: string })[]
        | undefined {
        const value = this._answers[key]?.text;
        if (!value) {
            // If you can't find it in the answers try in the message history
            // which then would have to be concat'd and returned
            const messages = this._messages.filter((m) => m.id === key);
            if (messages) {
                return messages.reduce((acc, m) => acc + m.content, '');
            } else {
                return undefined;
            }
        }

        if (!options) {
            return value as string;
        }
        if (options.from === 'zod') {
            return options.schema.parse(JSON.parse(value));
        }
        if (options.from === 'tools') {
            return JSON.parse(value) as
                | ToolResponse<T>
                | { toolUsed: 'respondToUser'; response: string };
        }
    }

    update(
        id: string,
        newMessage: Message[],
        metadata?: { [key: string]: unknown },
        opts?: { deleteMessagesAfter?: boolean },
    ): ProgramState;
    update(
        id: string,
        newMessage: Promise<Message[]>,
        metadata?: { [key: string]: unknown },
        opts?: { deleteMessagesAfter?: boolean },
    ): Promise<ProgramState>;
    update(
        id: string,
        newMessage: AsyncGenerator<Message, Message[], void>,
        metadata?: { [key: string]: unknown },
        opts?: { deleteMessagesAfter?: boolean },
    ): AsyncGenerator<Message>;
    update(
        id: string,
        newMessage:
            | Message[]
            | Promise<Message[]>
            | AsyncGenerator<Message, Message[], void>,
        metadata?: { [key: string]: unknown },
        opts?: { deleteMessagesAfter?: boolean },
    ): ProgramState | Promise<ProgramState> | AsyncGenerator<Message> {
        const messageIdx = this._messages.findIndex(
            (m) => m.id === id || m.genID === id,
        );
        if (!messageIdx) {
            console.warn(`No message with id ${id}`);
            return this;
        }
        const messagesAfter = this._messages
            .splice(messageIdx, this._messages.length - messageIdx)
            .filter((m) => m.id !== id && m.genID !== id);
        if (newMessage instanceof Promise) {
            return (async () => {
                const result = this.add(newMessage, { id, ...metadata });
                if (!opts?.deleteMessagesAfter) {
                    this._messages.push(...messagesAfter);
                }
                return result;
            })();
        } else if (Symbol.asyncIterator in newMessage) {
            const self = this;
            return async function* () {
                const gen = self.add(newMessage, { id, ...metadata });
                for await (const msg of gen) {
                    yield msg;
                }
                if (!opts?.deleteMessagesAfter) {
                    self._messages.push(...messagesAfter);
                }
            }.call(this);
        } else {
            const result = this.add(newMessage, { id, ...metadata });
            if (!opts?.deleteMessagesAfter) {
                this._messages.push(...messagesAfter);
            }
            return result;
        }
    }

    delete(id: string): ProgramState {
        const idExists = !!this._messages.find((m) => m.id === id);
        if (!idExists) {
            const genIdx = this._messages.findIndex((m) => m.genID === id);
            if (genIdx === -1) {
                console.warn(`No message with id ${id}`);
                return this;
            } else {
                delete this._answers[this._messages[genIdx]?.genID as string];
                this._messages.splice(genIdx, 1);
            }
        } else {
            this._messages = this._messages.filter((m) => m.id !== id);
        }
        return this;
    }

    getPrompt(): string {
        return this._backend.getPrompt(this._messages);
    }

    getMetaInfo(key: string): MetaInfo | undefined {
        return this._answers[key]?.meta_info;
    }

    setDebugInfo(debugInfo: Partial<DebugInfo> | null): ProgramState {
        if (!debugInfo) {
            this._debug = null;
        } else {
            if (!this._debug) {
                this._debug = {
                    baseUrl: 'http://localhost',
                    port: 56765,
                    debugName: null,
                    debugPromptID: null,
                    ...debugInfo,
                };
            } else {
                this._debug = {
                    ...this._debug,
                    ...debugInfo,
                };
            }
        }
        return this;
    }

    beginDebugRegion(debugInfo: { debugName: string; debugPromptID?: string }) {
        if (!this._debug) {
            this._debug = {
                baseUrl: 'http://localhost',
                port: 56765,
                debugName: null,
                debugPromptID: null,
            };
        }
        this._debug = {
            ...this._debug,
            ...debugInfo,
        };
        return this;
    }

    endDebugRegion(): ProgramState {
        if (!this._debug) return this;
        this._debug = {
            ...this._debug,
            debugName: null,
            debugPromptID: null,
        };
        return this;
    }
}

type GenAsyncFunctionReturnType = (messages: Message[]) => Promise<Message>;
type GenAsyncGeneratorReturnType = (
    messages: Message[],
) => AsyncGenerator<Message, void, unknown>;

function isGenAsyncFunction(
    value: unknown,
): value is GenAsyncFunctionReturnType {
    return (
        typeof value === 'function' &&
        value.constructor.name === 'AsyncFunction'
    );
}
function isGenAsyncGenerator(
    value: unknown,
): value is GenAsyncGeneratorReturnType {
    return (
        typeof value === 'function' &&
        value.constructor.name === 'AsyncGeneratorFunction'
    );
}

function isAsyncMessageGenerator(
    obj: unknown,
): obj is AsyncGenerator<Message, Message[], undefined> {
    if (obj === null || typeof obj !== 'object') {
        return false;
    }

    // Check if the object has the necessary methods of an AsyncGenerator
    const asyncGen = obj as Partial<AsyncGenerator<unknown, unknown, unknown>>;

    return (
        typeof asyncGen.next === 'function' &&
        typeof asyncGen.throw === 'function' &&
        typeof asyncGen.return === 'function' &&
        Symbol.asyncIterator in asyncGen
    );
}

type ToolResponse<T extends ToolUseParams> = {
    [K in keyof T]: {
        toolUsed: T[K]['name'];
        response: Awaited<ReturnType<T[K]['function']>>;
        error?: string;
    };
}[number];
