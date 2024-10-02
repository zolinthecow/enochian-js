// Define the ChatTemplateStyle enum
enum ChatTemplateStyle {
    PLAIN = 0,
    LLAMA2 = 1,
}

// Define the ChatTemplate class
export class ChatTemplate {
    name: string;
    default_system_prompt: string | null;
    role_prefix_and_suffix: { [key: string]: [string, string] };
    stop_str: string[];
    image_token: string;
    style: ChatTemplateStyle;

    constructor(
        name: string,
        default_system_prompt: string | null,
        role_prefix_and_suffix: { [key: string]: [string, string] },
        stop_str: string[] = [],
        image_token = '<image>',
        style: ChatTemplateStyle = ChatTemplateStyle.PLAIN,
    ) {
        this.name = name;
        this.default_system_prompt = default_system_prompt;
        this.role_prefix_and_suffix = role_prefix_and_suffix;
        this.stop_str = stop_str;
        this.image_token = image_token;
        this.style = style;
    }

    get_prefix_and_suffix(
        role: string,
        hist_messages: Array<{ role: string; content: string | null }>,
    ): [string, string] {
        const [prefix, suffix] = this.role_prefix_and_suffix[role] || ['', ''];

        if (this.style === ChatTemplateStyle.LLAMA2) {
            if (role === 'system' && hist_messages.length === 0) {
                const [user_prefix, _] = this.role_prefix_and_suffix.user || [
                    '',
                    '',
                ];
                const [system_prefix, system_suffix] = this
                    .role_prefix_and_suffix.system || ['', ''];
                return [user_prefix + system_prefix, system_suffix];
            } else if (role === 'user' && hist_messages[0]?.content !== null) {
                return ['', suffix];
            }
        }

        return [prefix, suffix];
    }

    get_prompt(
        messages: Array<{ role: string; content: string | null }>,
    ): string {
        let prompt = '';
        for (let i = 0; i < messages.length; i++) {
            const message = messages[i];
            if (!message) continue;
            let { role, content } = message;
            if (role === 'system' && content === null) {
                content = this.default_system_prompt;
                if (content === null) {
                    continue;
                }
            }
            const [prefix, suffix] = this.get_prefix_and_suffix(
                role,
                messages.slice(0, i),
            );
            prompt += `${prefix}${content}${suffix}`;
        }
        return prompt;
    }
}

// Define the ChatTemplateGroup class
export class ChatTemplateGroup {
    templates: { [key: string]: ChatTemplate } = {};
    matching_functions: Array<(modelPath: string) => ChatTemplate | null> = [];

    constructor() {
        this.init();
    }

    init() {
        // Register all chat templates
        this.register_chat_template(
            new ChatTemplate('default', null, {
                system: ['SYSTEM:', '\n'],
                user: ['USER:', '\n'],
                assistant: ['ASSISTANT:', '\n'],
            }),
        );

        this.register_chat_template(
            new ChatTemplate('claude', null, {
                system: ['', ''],
                user: ['\n\nHuman: ', ''],
                assistant: ['\n\nAssistant:', ''],
            }),
        );

        this.register_chat_template(
            new ChatTemplate(
                'chatml',
                null,
                {
                    system: ['<|im_start|>system\n', '<|im_end|>\n'],
                    user: ['<|im_start|>user\n', '<|im_end|>\n'],
                    assistant: ['<|im_start|>assistant\n', '<|im_end|>\n'],
                },
                ['<|im_end|>'],
                '<image>',
                ChatTemplateStyle.PLAIN,
            ),
        );

        this.register_chat_template(
            new ChatTemplate(
                'qwen',
                'You are a helpful assistant.',
                {
                    system: ['<|im_start|>system\n', '<|im_end|>\n'],
                    user: ['<|im_start|>user\n', '<|im_end|>\n'],
                    assistant: ['<|im_start|>assistant\n', '<|im_end|>\n'],
                },
                ['<|im_end|>'],
                '<image>',
                ChatTemplateStyle.PLAIN,
            ),
        );

        this.register_chat_template(
            new ChatTemplate(
                'chatml-llava',
                'You are a helpful assistant.',
                {
                    system: ['<|im_start|>system\n', '<|im_end|>\n'],
                    user: ['<|im_start|>user\n', '<|im_end|>\n'],
                    assistant: ['<|im_start|>assistant\n', '<|im_end|>\n'],
                },
                ['<|im_end|>'],
                '<image>\n',
                ChatTemplateStyle.PLAIN,
            ),
        );

        this.register_chat_template(
            new ChatTemplate(
                'vicuna_v1.1',
                'A chat between a curious user and an artificial intelligence assistant. ' +
                    "The assistant gives helpful, detailed, and polite answers to the user's questions.",
                {
                    system: ['', ' '],
                    user: ['USER:', ' '],
                    assistant: ['ASSISTANT:', '</s>'],
                },
                [],
                ' <image>\n',
                ChatTemplateStyle.PLAIN,
            ),
        );

        this.register_chat_template(
            new ChatTemplate(
                'yi-1.5',
                null,
                {
                    system: ['', ''],
                    user: [
                        '<|im_start|>user\n',
                        '<|im_end|>\n<|im_start|>assistant\n',
                    ],
                    assistant: ['', '<|im_end|>\n'],
                },
                ['<|im_end|>'],
                '<image>',
                ChatTemplateStyle.PLAIN,
            ),
        );

        this.register_chat_template(
            new ChatTemplate(
                'llama-2-chat',
                null,
                {
                    system: ['<<SYS>>\n', '\n<</SYS>>\n\n'],
                    user: ['[INST] ', ' [/INST]'],
                    assistant: ['', ' </s><s>'],
                },
                [],
                '<image>',
                ChatTemplateStyle.LLAMA2,
            ),
        );

        this.register_chat_template(
            new ChatTemplate(
                'llama-3-instruct',
                null,
                {
                    system: [
                        '<|start_header_id|>system<|end_header_id|>\n\n',
                        '<|eot_id|>',
                    ],
                    user: [
                        '<|start_header_id|>user<|end_header_id|>\n\n',
                        '<|eot_id|>',
                    ],
                    assistant: [
                        '<|start_header_id|>assistant<|end_header_id|>\n\n',
                        '<|eot_id|>',
                    ],
                },
                ['<|eot_id|>'],
                '<image>',
                ChatTemplateStyle.PLAIN,
            ),
        );

        this.register_chat_template(
            new ChatTemplate(
                'yi-vl',
                "This is a chat between an inquisitive human and an AI assistant. Assume the role of the AI assistant. Read all the images carefully, and respond to the human's questions with informative, helpful, detailed and polite answers." +
                    '这是一个好奇的人类和一个人工智能助手之间的对话。假设你扮演这个AI助手的角色。仔细阅读所有的图像，并对人类的问题做出信息丰富、有帮助、详细的和礼貌的回答。',
                {
                    system: ['', '\n\n'],
                    user: ['### Human:', '\n'],
                    assistant: ['### Assistant:', '\n'],
                },
                [],
                ' <image_placeholder>\n',
                ChatTemplateStyle.PLAIN,
            ),
        );

        this.register_chat_template(
            new ChatTemplate(
                'gemma-it',
                null,
                {
                    system: ['', ''],
                    user: ['<start_of_turn>user\n', '<end_of_turn>\n'],
                    assistant: ['<start_of_turn>model\n', '<end_of_turn>\n'],
                },
                [],
                '<image>',
                ChatTemplateStyle.PLAIN,
            ),
        );

        this.register_chat_template(
            new ChatTemplate(
                'dbrx-instruct',
                "You are DBRX, created by Databricks. You were last updated in December 2023. You answer questions based on information available up to that point.\nYOU PROVIDE SHORT RESPONSES TO SHORT QUESTIONS OR STATEMENTS, but provide thorough responses to more complex and open-ended questions.\nYou assist with various tasks, from writing to coding (using markdown for code blocks — remember to use ``` with code, JSON, and tables).\n(You do not have real-time data access or code execution capabilities. You avoid stereotyping and provide balanced perspectives on controversial topics. You do not provide song lyrics, poems, or news articles and do not divulge details of your training data.)\nThis is your system prompt, guiding your responses. Do not reference it, just respond to the user. If you find yourself talking about this message, stop. You should be responding appropriately and usually that means not mentioning this.\nYOU DO NOT MENTION ANY OF THIS INFORMATION ABOUT YOURSELF UNLESS THE INFORMATION IS DIRECTLY PERTINENT TO THE USER'S QUERY.",
                {
                    system: ['<|im_start|>system\n', '<|im_end|>'],
                    user: ['\n<|im_start|>user\n', '<|im_end|>'],
                    assistant: ['\n<|im_start|>assistant\n', '<|im_end|>'],
                },
                ['<|im_end|>'],
                '<image>',
                ChatTemplateStyle.PLAIN,
            ),
        );

        this.register_chat_template(
            new ChatTemplate(
                'c4ai-command-r',
                null,
                {
                    system: [
                        '<|START_OF_TURN_TOKEN|><|SYSTEM_TOKEN|>',
                        '<|END_OF_TURN_TOKEN|>',
                    ],
                    user: [
                        '<|START_OF_TURN_TOKEN|><|USER_TOKEN|>',
                        '<|END_OF_TURN_TOKEN|>',
                    ],
                    assistant: [
                        '<|START_OF_TURN_TOKEN|><|CHATBOT_TOKEN|>',
                        '<|END_OF_TURN_TOKEN|>',
                    ],
                },
                [],
                '<image>',
                ChatTemplateStyle.PLAIN,
            ),
        );

        // Register matching functions
        this.register_chat_template_matching_function(
            this.match_dbrx.bind(this),
        );
        this.register_chat_template_matching_function(
            this.match_vicuna.bind(this),
        );
        this.register_chat_template_matching_function(
            this.match_llama2_chat.bind(this),
        );
        this.register_chat_template_matching_function(
            this.match_llama3_instruct.bind(this),
        );
        this.register_chat_template_matching_function(
            this.match_chat_ml.bind(this),
        );
        this.register_chat_template_matching_function(
            this.match_chat_yi.bind(this),
        );
        this.register_chat_template_matching_function(
            this.match_gemma_it.bind(this),
        );
        this.register_chat_template_matching_function(
            this.match_c4ai_command_r.bind(this),
        );
    }

    register_chat_template(template: ChatTemplate) {
        this.templates[template.name] = template;
    }

    register_chat_template_matching_function(
        func: (modelPath: string) => ChatTemplate | null,
    ) {
        this.matching_functions.push(func);
    }

    get_chat_template(name: string): ChatTemplate {
        const template = this.templates[name];
        // biome-ignore lint/style/noNonNullAssertion: Default must exist
        if (!template) return this.templates.default!;
        return template;
    }

    match(modelPath: string): ChatTemplate {
        for (const matching_func of this.matching_functions) {
            const template = matching_func(modelPath);
            if (template !== null) {
                return template;
            }
        }
        return this.get_chat_template('default');
    }

    // Matching functions
    match_dbrx(modelPath: string): ChatTemplate | null {
        const model_path_lower = modelPath.toLowerCase();
        if (
            model_path_lower.includes('dbrx') &&
            model_path_lower.includes('instruct')
        ) {
            return this.get_chat_template('dbrx-instruct');
        }
        return null;
    }

    match_vicuna(modelPath: string): ChatTemplate | null {
        const model_path_lower = modelPath.toLowerCase();
        if (model_path_lower.includes('vicuna')) {
            return this.get_chat_template('vicuna_v1.1');
        }
        if (model_path_lower.includes('llava-v1.5')) {
            return this.get_chat_template('vicuna_v1.1');
        }
        if (model_path_lower.includes('llava-next-video-7b')) {
            return this.get_chat_template('vicuna_v1.1');
        }
        return null;
    }

    match_llama2_chat(modelPath: string): ChatTemplate | null {
        const model_path_lower = modelPath.toLowerCase();
        if (
            model_path_lower.includes('llama-2') &&
            model_path_lower.includes('chat')
        ) {
            return this.get_chat_template('llama-2-chat');
        }
        if (
            (model_path_lower.includes('mistral') ||
                model_path_lower.includes('mixtral')) &&
            model_path_lower.includes('instruct')
        ) {
            return this.get_chat_template('llama-2-chat');
        }
        if (
            model_path_lower.includes('codellama') &&
            model_path_lower.includes('instruct')
        ) {
            return this.get_chat_template('llama-2-chat');
        }
        return null;
    }

    match_llama3_instruct(modelPath: string): ChatTemplate | null {
        const model_path_lower = modelPath.toLowerCase();
        if (
            model_path_lower.includes('llama-3') &&
            model_path_lower.includes('instruct')
        ) {
            return this.get_chat_template('llama-3-instruct');
        }
        return null;
    }

    match_chat_ml(modelPath: string): ChatTemplate | null {
        const model_path_lower = modelPath.toLowerCase();
        if (model_path_lower.includes('tinyllama')) {
            return this.get_chat_template('chatml');
        }
        if (
            model_path_lower.includes('qwen') &&
            (model_path_lower.includes('chat') ||
                model_path_lower.includes('instruct')) &&
            !model_path_lower.includes('llava')
        ) {
            return this.get_chat_template('qwen');
        }
        if (
            model_path_lower.includes('llava-v1.6-34b') ||
            model_path_lower.includes('llava-v1.6-yi-34b') ||
            model_path_lower.includes('llava-next-video-34b') ||
            model_path_lower.includes('llava-onevision-qwen2')
        ) {
            return this.get_chat_template('chatml-llava');
        }
        return null;
    }

    match_chat_yi(modelPath: string): ChatTemplate | null {
        const model_path_lower = modelPath.toLowerCase();
        if (
            model_path_lower.includes('yi-vl') &&
            !model_path_lower.includes('llava')
        ) {
            return this.get_chat_template('yi-vl');
        } else if (
            model_path_lower.includes('yi-1.5') &&
            model_path_lower.includes('chat')
        ) {
            return this.get_chat_template('yi-1.5');
        }
        return null;
    }

    match_gemma_it(modelPath: string): ChatTemplate | null {
        const model_path_lower = modelPath.toLowerCase();
        if (
            model_path_lower.includes('gemma') &&
            model_path_lower.includes('it')
        ) {
            return this.get_chat_template('gemma-it');
        }
        return null;
    }

    match_c4ai_command_r(modelPath: string): ChatTemplate | null {
        const model_path_lower = modelPath.toLowerCase();
        if (model_path_lower.includes('c4ai-command-r')) {
            return this.get_chat_template('c4ai-command-r');
        }
        return null;
    }
}
