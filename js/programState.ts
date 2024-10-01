class ProgramState {
    private _prompt = '';
    private _answers: { [key: string]: string } = {};
    private _current_model = {
        url: '',
        name: '',
    };

    private async _sendGenRequest(): Promise<string> {
        // TODO: Make this actually work
        // @ts-expect-error I know this doesn't work yet
        const resp = await fetch(this._current_model.url);
        return await resp.json();
    }

    async system(
        strings: TemplateStringsArray,
        ...values: (Promise<string> | string)[]
    ): Promise<string> {
        // Applies system chat template to a string;
        // TODO: Apply system templat before and after this
        return await this._processStringTemplate(strings, ...values);
    }

    async user(
        strings: TemplateStringsArray,
        ...values: (Promise<string> | string)[]
    ): Promise<string> {
        // Applies user chat template to a string;
        // TODO: Apply user templat before and after this
        return await this._processStringTemplate(strings, ...values);
    }

    async assistant(
        strings: TemplateStringsArray,
        ...values: (Promise<string> | string)[]
    ): Promise<string> {
        // Applies assistant chat template to a string;
        // TODO: Apply assistant templat before and after this
        return await this._processStringTemplate(strings, ...values);
    }

    private async _processStringTemplate(
        strings: TemplateStringsArray,
        ...values: (Promise<string> | string)[]
    ): Promise<string> {
        for (let i = 0; i < strings.length; i++) {
            this._prompt += strings[i];
            if (i < values.length) {
                if (values[i] instanceof Promise) {
                    const resolvedValue = await values[i];
                    this._prompt += resolvedValue;
                } else {
                    this._prompt += values[i];
                }
            }
        }
        return this._prompt;
    }

    setModel(url: string, name: string): ProgramState {
        // TODO: This should get the model(s) from the URL
        this._current_model = {
            url,
            name,
        };
        return this;
    }

    add(prompt: string): ProgramState {
        this._prompt += prompt;
        return this;
    }

    async gen(answerKey: string): Promise<string> {
        const ans = await this._sendGenRequest();
        this._answers[answerKey] = ans;
        return ans;
    }
}
