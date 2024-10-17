import type {
    GenerateReqInput,
    GenerateResp,
    GenerateRespSingle,
    MetaInfo,
} from './api.js';
import type { SetModelParams } from './backends/backend.interface.js';
import type Backend from './backends/backend.interface.js';
import type { OpenAISetModelParams } from './backends/openai.js';
import SGLBackend, { type SGLSetModelParams } from './backends/sgl.js';

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
            ...values: (ReturnType<typeof this.gen> | string)[]
        ): Promise<Message>;
        function roleFunction(
            this: ProgramState,
            strings: TemplateStringsArray,
            ...values: string[] | (ReturnType<typeof this.gen> | string)[]
        ): Message | Promise<Message> {
            if (values.every((v) => typeof v === 'string')) {
                return {
                    role,
                    content: this._processRoleStringTemplate(
                        role,
                        strings,
                        ...(values as string[]),
                    ),
                };
            } else {
                return (async () => {
                    return {
                        role,
                        content: await this._processRoleStringTemplate(
                            role,
                            strings,
                            ...values,
                        ),
                    };
                })();
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
        ...values: (ReturnType<typeof this.gen> | string)[]
    ): Promise<string>;
    private _processRoleStringTemplate(
        role: 'system' | 'user' | 'assistant',
        strings: TemplateStringsArray,
        ...values: string[] | (ReturnType<typeof this.gen> | string)[]
    ): string | Promise<string> {
        // This function should only be async if there is an async function inside `values`.
        if (values.some((v) => isGenFunction(v))) {
            const processTemplate = async (): Promise<string> => {
                const curMessage: Message = {
                    role,
                    content: '',
                };
                for (let i = 0; i < strings.length; i++) {
                    curMessage.content += strings[i];
                    if (i < values.length) {
                        const value = values[i];
                        if (isGenFunction(value)) {
                            const generatedText = await value([
                                ...this._messages,
                                curMessage,
                            ]);
                            // Should trim out the generated end tokens
                            curMessage.content += generatedText;
                        } else {
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
        message: Message | Promise<Message>,
    ): ProgramState | Promise<ProgramState> {
        if (message instanceof Promise) {
            return (async () => {
                this._messages.push(await message);
                return this;
            })();
        } else {
            this._messages.push(message);
            return this;
        }
    }

    gen(
        answerKey: string,
        genInput?: Omit<Partial<GenerateReqInput>, 'text'>,
    ): (messages: Message[]) => Promise<string> {
        return async (messages: Message[]): Promise<string> => {
            const ans = await this._backend.gen(messages, genInput);
            if (Array.isArray(ans)) {
                throw new Error('Multiple generations not implemented.');
            }
            this._answers[answerKey] = ans;
            return ans.text;
        };
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

function isGenFunction(
    value: unknown,
): value is ReturnType<InstanceType<typeof ProgramState>['gen']> {
    return typeof value === 'function';
}
