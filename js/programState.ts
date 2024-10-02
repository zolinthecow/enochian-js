import type { GenerateReqInput } from './api.js';
import { GenerateRespSchema } from './api.js';

export default class ProgramState {
    private _prompt = '';
    private _answers: { [key: string]: string } = {};
    private _current_model_endpoint = '';

    private async _sendGenRequest(_input?: GenerateReqInput): Promise<string> {
        let input: GenerateReqInput;
        if (_input) {
            input = _input;
        } else {
            input = {
                text: this._prompt,
                sampling_params: {
                    max_new_tokens: 16,
                    temperature: 0,
                },
            };
        }

        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(input),
        };
        const resp = await fetch(
            `${this._current_model_endpoint}/generate`,
            options,
        );
        const json = await resp.json();
        const generateResp = GenerateRespSchema.parse(json);
        return generateResp.text;
    }

    async system(
        strings: TemplateStringsArray,
        ...values: (() => Promise<string> | string)[]
    ): Promise<string> {
        // Applies system chat template to a string;
        // TODO: Apply system templat before and after this
        return await this._processStringTemplate(strings, ...values);
    }

    async user(
        strings: TemplateStringsArray,
        ...values: (() => Promise<string> | string)[]
    ): Promise<string> {
        // Applies user chat template to a string;
        // TODO: Apply user templat before and after this
        return await this._processStringTemplate(strings, ...values);
    }

    async assistant(
        strings: TemplateStringsArray,
        ...values: (() => Promise<string> | string)[]
    ): Promise<string> {
        // Applies assistant chat template to a string;
        // TODO: Apply assistant templat before and after this
        return await this._processStringTemplate(strings, ...values);
    }

    private async _processStringTemplate(
        strings: TemplateStringsArray,
        ...values: ((prompt: string) => Promise<string> | string)[]
    ): Promise<string> {
        let curPrompt = '';
        for (let i = 0; i < strings.length; i++) {
            curPrompt += strings[i];
            if (i < values.length) {
                if (values[i] instanceof Function) {
                    const gen = values[i];
                    if (!gen) continue;
                    const resolvedValue = await gen(this._prompt + curPrompt);
                    curPrompt += resolvedValue;
                } else {
                    curPrompt += values[i];
                }
            }
        }
        return curPrompt;
    }

    setModel(url: string): ProgramState {
        // TODO: This should get the model(s) from the URL
        this._current_model_endpoint = url;
        return this;
    }

    async add(prompt: Promise<string> | string): Promise<ProgramState> {
        if (prompt instanceof Promise) {
            this._prompt += await prompt;
        } else {
            this._prompt += prompt;
        }
        return this;
    }

    gen(answerKey: string): () => Promise<string> {
        return async (prompt?: string): Promise<string> => {
            // TEMP
            const input: GenerateReqInput = {
                text: prompt ? prompt : this._prompt,
                sampling_params: {
                    max_new_tokens: 16,
                    temperature: 0,
                },
            };

            const ans = await this._sendGenRequest(input);
            this._answers[answerKey] = ans;
            return ans;
        };
    }

    get(key: string): string | undefined {
        return this._answers[key];
    }
}
