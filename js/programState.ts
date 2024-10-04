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
        const generateResp = GenerateRespSchema.parse(json);
        return generateResp.text;
    }

    async system(
        strings: TemplateStringsArray,
        ...values: (ReturnType<typeof this.gen> | string)[]
    ): Promise<Message> {
        return {
            role: 'system',
            content: await this._processRoleStringTemplate(
                'system',
                strings,
                ...values,
            ),
        };
    }

    async user(
        strings: TemplateStringsArray,
        ...values: (ReturnType<typeof this.gen> | string)[]
    ): Promise<Message> {
        return {
            role: 'user',
            content: await this._processRoleStringTemplate(
                'user',
                strings,
                ...values,
            ),
        };
    }

    async assistant(
        strings: TemplateStringsArray,
        ...values: (ReturnType<typeof this.gen> | string)[]
    ): Promise<Message> {
        return {
            role: 'assistant',
            content: await this._processRoleStringTemplate(
                'assistant',
                strings,
                ...values,
            ),
        };
    }

    private async _processRoleStringTemplate(
        role: 'system' | 'user' | 'assistant',
        strings: TemplateStringsArray,
        ...values: (ReturnType<typeof this.gen> | string)[]
    ): Promise<string> {
        // TODO: Get model name from URL
        const template = this._chatTemplateGroup.match(
            this._current_model.path,
        );
        // I'm not sure how we're supposed to use the `hist_messages` param
        const prefix_suffix = template.get_prefix_and_suffix(
            role,
            this._messages,
        );
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
                    curPrompt += generatedText.replace(prefix_suffix[1], '');
                } else {
                    curPrompt += value;
                }
            }
        }
        return curPrompt;
    }

    async setModel(url: string): Promise<ProgramState> {
        // TODO: This should get the model(s) from the URL
        this._current_model.url = url;
        const resp = await fetch(`${this._current_model.url}/get_model_info`, {
            method: 'GET',
        });
        const json = await resp.json();
        const modelInfo = GetModelInfoSchema.parse(json);
        this._current_model.path = modelInfo.model_path;
        return this;
    }

    async add(message: Promise<Message> | Message): Promise<ProgramState> {
        if (message instanceof Promise) {
            this._messages.push(await message);
        } else {
            this._messages.push(message);
        }
        return this;
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
