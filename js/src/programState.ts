import type {
    GenerateReqInput,
    GenerateReqNonStreamingInput,
    GenerateReqStreamingInput,
    GenerateResp,
    GenerateRespSingle,
    MetaInfo,
} from './api.js';
import type { SetModelParams } from './backends/backend.interface.js';
import type Backend from './backends/backend.interface.js';
import type { OpenAISetModelParams } from './backends/openai.js';
import SGLBackend, { type SGLSetModelParams } from './backends/sgl.js';
import { isNonStreamingInput } from './utils.js';

type Message = { role: 'user' | 'assistant' | 'system'; content: string };

export default class ProgramState {
    private _messages: Array<Message>;
    private _answers: { [key: string]: GenerateRespSingle };
    private _backend: Backend;

    constructor(
        backend: Backend = new SGLBackend(),
        messages: Array<Message> = [],
        answers: { [key: string]: GenerateRespSingle } = {},
    ) {
        this._messages = [...messages];
        this._answers = { ...answers };
        this._backend = backend;
    }

    private _createRoleFunction(role: 'user' | 'assistant' | 'system') {
        function roleFunction(
            this: ProgramState,
            strings: TemplateStringsArray,
            ...values: string[]
        ): Message;
        function roleFunction(
            this: ProgramState,
            strings: TemplateStringsArray,
            ...values: (GenAsyncFunctionReturnType | string)[]
        ): Promise<Message>;
        function roleFunction(
            this: ProgramState,
            strings: TemplateStringsArray,
            ...values: (
                | GenAsyncGeneratorReturnType
                | GenAsyncFunctionReturnType
                | string
            )[]
        ): AsyncGenerator<Message>;
        function roleFunction(
            this: ProgramState,
            strings: TemplateStringsArray,
            ...values:
                | string[]
                | (GenAsyncFunctionReturnType | string)[]
                | (
                      | GenAsyncGeneratorReturnType
                      | GenAsyncFunctionReturnType
                      | string
                  )[]
        ): Message | Promise<Message> | AsyncGenerator<Message> {
            if (values.some((v) => isGenAsyncGenerator(v))) {
                return async function* (this: ProgramState) {
                    const chunks = this._processRoleStringTemplate(
                        role,
                        strings,
                        ...(values as (
                            | GenAsyncGeneratorReturnType
                            | GenAsyncFunctionReturnType
                            | string
                        )[]),
                    );
                    for await (const chunk of chunks) {
                        yield {
                            role,
                            content: chunk,
                        };
                    }
                }.call(this);
            } else if (values.some((v) => isGenAsyncFunction(v))) {
                return (async () => ({
                    role,
                    content: await this._processRoleStringTemplate(
                        role,
                        strings,
                        ...(values as (GenAsyncFunctionReturnType | string)[]),
                    ),
                }))();
            } else {
                return {
                    role,
                    content: this._processRoleStringTemplate(
                        role,
                        strings,
                        ...(values as string[]),
                    ),
                };
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
        ...values: string[]
    ): string;
    private _processRoleStringTemplate(
        role: 'system' | 'user' | 'assistant',
        strings: TemplateStringsArray,
        ...values: (GenAsyncFunctionReturnType | string)[]
    ): Promise<string>;
    private _processRoleStringTemplate(
        role: 'system' | 'user' | 'assistant',
        strings: TemplateStringsArray,
        ...values: (
            | GenAsyncGeneratorReturnType
            | GenAsyncFunctionReturnType
            | string
        )[]
    ): AsyncGenerator<string>;
    private _processRoleStringTemplate(
        role: 'system' | 'user' | 'assistant',
        strings: TemplateStringsArray,
        ...values:
            | string[]
            | (GenAsyncFunctionReturnType | string)[]
            | (
                  | GenAsyncGeneratorReturnType
                  | GenAsyncFunctionReturnType
                  | string
              )[]
    ): string | Promise<string> | AsyncGenerator<string> {
        // If there is any async generator function it should become a generator
        if (values.some((v) => isGenAsyncGenerator(v))) {
            return async function* (this: ProgramState) {
                const curMessage: Message = {
                    role,
                    content: '',
                };
                for (let i = 0; i < strings.length; i++) {
                    curMessage.content += strings[i];
                    if (i < values.length) {
                        const value = values[i];
                        if (isGenAsyncGenerator(value)) {
                            const generator = value([
                                ...this._messages,
                                curMessage,
                            ]);
                            for await (const chunk of generator) {
                                curMessage.content += chunk;
                                yield chunk;
                            }
                        } else if (isGenAsyncFunction(value)) {
                            const generatedText = await value([
                                ...this._messages,
                                curMessage,
                            ]);
                            curMessage.content += generatedText;
                            yield generatedText;
                        } else if (typeof value === 'string') {
                            curMessage.content += value;
                            yield value;
                        }
                    }
                }
            }.call(this);
        } else if (values.some((v) => isGenAsyncFunction(v))) {
            // Should only be async if there is an async function inside `values`.
            const processTemplate = async (): Promise<string> => {
                const curMessage: Message = {
                    role,
                    content: '',
                };
                for (let i = 0; i < strings.length; i++) {
                    curMessage.content += strings[i];
                    if (i < values.length) {
                        const value = values[i];
                        if (isGenAsyncFunction(value)) {
                            const generatedText = await value([
                                ...this._messages,
                                curMessage,
                            ]);
                            // Should trim out the generated end tokens
                            curMessage.content += generatedText;
                        } else if (typeof value === 'string') {
                            curMessage.content += value;
                        }
                    }
                }
                return curMessage.content;
            };

            return (async () => {
                return await processTemplate();
            })();
        } else {
            // If there are no async functions inside the string template then just concat them together
            return strings.reduce(
                (acc, str, i) => acc + str + (values[i] || ''),
                '',
            );
        }
    }

    // For type safety in whether or not you have to await this
    setModel(params: SGLSetModelParams): Promise<void>;
    setModel(params: OpenAISetModelParams): void;
    setModel(params: SetModelParams): void | Promise<void> {
        return this._backend.setModel(params);
    }

    setBackend(backend: Backend): ProgramState {
        this._backend = backend;
        return this;
    }

    add(message: Message): ProgramState;
    add(message: Promise<Message>): Promise<ProgramState>;
    add(
        message: AsyncGenerator<Message, Message, undefined>,
    ): AsyncGenerator<Message>;
    add(
        message:
            | Message
            | Promise<Message>
            | AsyncGenerator<Message, Message, undefined>,
    ): ProgramState | Promise<ProgramState> | AsyncGenerator<Message> {
        if (message instanceof Promise) {
            return (async () => {
                this._messages.push(await message);
                return this;
            })();
        } else if (isAsyncMessageGenerator(message)) {
            return async function* (this: ProgramState) {
                for await (const m of message) {
                    yield m;
                }
                const fullMessage = await message.next();
                this._messages.push(fullMessage.value);
            }.call(this);
        } else {
            this._messages.push(message);
            return this;
        }
    }

    gen(
        answerKey: string,
        genInput?: Omit<GenerateReqNonStreamingInput, 'text' | 'input_ids'>,
    ): (messages: Message[]) => Promise<string>;
    gen(
        answerKey: string,
        genInput?: Omit<GenerateReqStreamingInput, 'text' | 'input_ids'>,
    ): (messages: Message[]) => AsyncGenerator<string, void, unknown>;
    gen(
        answerKey: string,
        genInput?: Omit<GenerateReqInput, 'text' | 'input_ids'>,
    ):
        | ((messages: Message[]) => Promise<string>)
        | ((messages: Message[]) => AsyncGenerator<string, void, unknown>) {
        if (!genInput || isNonStreamingInput(genInput)) {
            return async (messages: Message[]): Promise<string> => {
                const ans = await this._backend.gen(messages, genInput);
                if (Array.isArray(ans)) {
                    throw new Error('Multiple generations not implemented.');
                }
                this._answers[answerKey] = ans;
                return ans.text;
            };
        } else {
            return async function* (messages: Message[]) {
                const temp = ['1', '2', '3'];
                for (const t of temp) {
                    // Simulate some asynchronous processing
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                    yield t;
                }
            };
        }
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
                    ),
            );
    }

    get(key: string): string | undefined {
        return this._answers[key]?.text;
    }

    getPrompt(): string {
        return this._backend.getPrompt(this._messages);
    }

    getMetaInfo(key: string): MetaInfo | undefined {
        return this._answers[key]?.meta_info;
    }
}

type GenAsyncFunctionReturnType = (messages: Message[]) => Promise<string>;
type GenAsyncGeneratorReturnType = (
    messages: Message[],
) => AsyncGenerator<string, void, unknown>;

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
): obj is AsyncGenerator<Message, Message, undefined> {
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
