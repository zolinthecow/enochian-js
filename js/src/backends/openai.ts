import OpenAI, { type ClientOptions } from 'openai';
import type { GenerateReqInput, GenerateResp } from '../api.js';
import type { Message } from './backend.interface.js';
import type Backend from './backend.interface.js';

export type CompletionCreateParams = Parameters<
    InstanceType<typeof OpenAI>['chat']['completions']['create']
>;

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

    setModel({
        url,
        modelName,
    }: { url?: string; modelName?: OpenAI.ChatModel }): void {
        if (url) this._openai.baseURL = url;
        if (modelName) this._modelName = modelName;
    }

    // TODO: Needs to have some GenerateReqInput -> OpenAI kwargs function and some output converter.
    // Or maybe it should just return the native output?
    async gen(
        messages: Message[],
        genInput?: Omit<Partial<GenerateReqInput>, 'text'>,
    ): Promise<GenerateResp> {
        const completion = await this._openai.chat.completions.create({
            model: this._modelName,
            messages,
        });
        let finishReason:
            | { type: 'length'; length: number }
            | { type: 'stop'; matched: number };
        if (completion.choices[0]?.finish_reason === 'length') {
            finishReason = {
                type: 'length',
                length: completion.usage?.completion_tokens ?? 0,
            };
        } else {
            finishReason = {
                type: 'stop',
                matched: 0,
            };
        }
        return {
            text: completion.choices[0]?.message.content ?? '',
            meta_info: {
                prompt_tokens: completion.usage?.prompt_tokens ?? 0,
                completion_tokens: completion.usage?.completion_tokens ?? 0,
                completion_tokens_wo_jump_forward:
                    completion.usage?.completion_tokens ?? 0,
                finish_reason: finishReason,
                id: completion.id,
            },
            index: 0,
        };
    }
}
