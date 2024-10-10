import {
    type GenerateReqInput,
    type GenerateResp,
    GenerateRespSchema,
    GetModelInfoSchema,
} from '../api.js';
import { ChatTemplateGroup } from '../chatTemplate.js';
import type { Message } from './backend.interface.js';
import type Backend from './backend.interface.js';

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

    // Does not use `modelName`
    async setModel({
        url,
        modelName,
    }: { url?: string; modelName?: string }): Promise<void> {
        if (!url) {
            throw new Error('No model endpoint provided');
        }
        this._currentModel.url = url;
        const resp = await fetch(`${this._currentModel.url}/get_model_info`, {
            method: 'GET',
        });
        const json = await resp.json();
        const modelInfo = GetModelInfoSchema.parse(json);
        this._currentModel.path = modelInfo.model_path;
    }

    async gen(
        messages: Message[],
        genInput?: Omit<Partial<GenerateReqInput>, 'text' | 'input_ids'>,
    ): Promise<GenerateResp> {
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

        const reqInput: GenerateReqInput = {
            text: prompt,
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

        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(reqInput),
        };
        console.log(options);
        const resp = await fetch(`${this._currentModel.url}/generate`, options);
        const json = await resp.json();
        const generateResp = GenerateRespSchema.parse(json);
        return generateResp;
    }

    // If someone does `s.add(s.user`...`).add(s.user`...`)` it should be combined into one `user` message
    private _getConcatedMessages(messages: Message[]) {
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
}
