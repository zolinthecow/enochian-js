import type { GenerateReqInput } from './api.js';
import { GenerateRespSchema, GetModelInfoSchema } from './api.js';
import { ChatTemplateGroup } from './chatTemplate.js';

type Message = { role: 'user' | 'assistant' | 'system'; content: string };

export default class ProgramState {
    private _messages: Array<Message> = [];
    private _answers: { [key: string]: string } = {};
    private _current_model = {
        url: '',
        path: '',
    };
    private _chatTemplateGroup = new ChatTemplateGroup();

    private async _sendGenRequest(input: GenerateReqInput): Promise<string> {
        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(input),
        };
        console.log('OPTS:', options, '\n');
        const resp = await fetch(
            `${this._current_model.url}/generate`,
            options,
        );
        const json = await resp.json();
        console.log(json);
        const generateResp = GenerateRespSchema.parse(json);
        return generateResp.text;
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
        if (values.some((v) => isAsyncFunction(v))) {
            const template = this._chatTemplateGroup.match(
                this._current_model.path,
            );
            // I'm not sure how we're supposed to use the `hist_messages` param
            const prefix_suffix = template.get_prefix_and_suffix(
                role,
                this._messages,
            );

            const processTemplate = async (): Promise<string> => {
                let curPrompt = '';
                for (let i = 0; i < strings.length; i++) {
                    curPrompt += strings[i];
                    if (i < values.length) {
                        const value = values[i];
                        if (isAsyncFunction(value)) {
                            // Need to apply the chat template prefix to the cur prompt
                            const text = `${template.get_prompt(this._messages)}${prefix_suffix[0]}${curPrompt}`;
                            // For now must be the gen function
                            const generatedText = await value(text);
                            // Should trim out the generated end tokens
                            curPrompt += generatedText.replace(
                                prefix_suffix[1],
                                '',
                            );
                        } else {
                            curPrompt += value;
                        }
                    }
                }
                return curPrompt;
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

    async setModel(url: string): Promise<ProgramState> {
        this._current_model.url = url;
        const resp = await fetch(`${this._current_model.url}/get_model_info`, {
            method: 'GET',
        });
        const json = await resp.json();
        const modelInfo = GetModelInfoSchema.parse(json);
        this._current_model.path = modelInfo.model_path;
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
    ): (text: string) => Promise<string> {
        return async (text: string): Promise<string> => {
            const reqInput: GenerateReqInput = {
                text,
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

            const ans = await this._sendGenRequest(reqInput);
            this._answers[answerKey] = ans;
            return ans;
        };
    }

    get(key: string): string | undefined {
        return this._answers[key];
    }

    get_prompt(): string {
        return this._chatTemplateGroup
            .get_chat_template(this._current_model.path)
            .get_prompt(this._messages);
    }
}

function isAsyncFunction(
    value: unknown,
): value is (prompt: string) => Promise<string> {
    return typeof value === 'function';
}
