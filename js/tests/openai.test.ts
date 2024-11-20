import { describe, expect, it } from 'vitest';

import { z } from 'zod';
import ProgramState, {
    createTools,
    isUnderTokenThreshold,
    trimFromOldMessages,
    trimFromMiddle,
    trimByRelativePriority,
} from '../src/index.js';

describe('Basic functionality of the OpenAI ProgramState', () => {
    it('does a multiturn question correctly', async () => {
        const s = new ProgramState().fromOpenAI({ modelName: 'gpt-4o-mini' });

        await s
            .add(s.system`You are a helpful assistant.`)
            .add(s.user`Tell me a joke`)
            .add(
                s.assistant`${s.gen('answer1', { sampling_params: { temperature: 0 } })}`,
            );
        await s
            .add(s.user`Tell me a better one`)
            .add(
                s.assistant`No problem! ${s.gen('answer2', { sampling_params: { temperature: 0 } })}`,
            );

        expect(s.get('answer1')).toBeDefined();
        expect(s.get('answer2')).toBeDefined();
    });

    it('does forking correctly', async () => {
        const s = new ProgramState().fromOpenAI({ modelName: 'gpt-4o-mini' });

        s.add(s.system`You are a helpful assistant.`)
            .add(s.user`How can I stay healthy?`)
            .add(s.assistant`Here are two tips for staying healthy:
                1. Balanced Diet. 2. Regular Exercise.\n\n`);

        const forks = s.fork(2);
        await Promise.all(
            forks.map((f, i) =>
                f
                    .add(
                        f.user`Now, expand tip ${(i + 1).toString()} into a paragraph.`,
                    )
                    .add(
                        f.assistant`${f.gen('detailed_tip', { sampling_params: { max_new_tokens: 256, temperature: 0 } })}`,
                    ),
            ),
        );

        await s
            .add(s.user`Please expand.`)
            .add(s.assistant`Tip 1: ${forks[0]?.get('detailed_tip') ?? ''}
                Tip 2: ${forks[1]?.get('detailed_tip') ?? ''}
                In summary, ${s.gen('summary', { sampling_params: { temperature: 0 } })}`);

        expect(forks[0]?.get('detailed_tip')).toBeDefined();
        expect(forks[1]?.get('detailed_tip')).toBeDefined();
        expect(s?.get('summary')).toBeDefined();
    });

    it('does streaming correctly', async () => {
        const s = new ProgramState().fromOpenAI({ modelName: 'gpt-4o-mini' });

        const gen = s
            .add(s.system`You are a helpful assistant.`)
            .add(s.user`Tell me a joke`)
            .add(
                s.assistant`${s.gen('answer1', { stream: true, sampling_params: { temperature: 0 } })}`,
            );
        for await (const chunk of gen) {
            expect(typeof chunk.content).toBe('string');
        }

        expect(s.get('answer1')).toBeDefined();
    });

    it('does constrained decoding correctly', async () => {
        const s = new ProgramState().fromOpenAI({ modelName: 'gpt-4o-mini' });

        const Step = z.object({
            explanation: z.string(),
            output: z.string(),
        });
        const MathResponse = z.object({
            steps: z.array(Step),
            final_answer: z.string(),
        });

        await s
            .add(
                s.system`You are a helpful math tutor. Only use the schema for math responses.`,
            )
            .add(s.user`solve 8x + 3 = 21`)
            .add(
                s.assistant`${s.gen('answer', { sampling_params: { zod_schema: MathResponse } })}`,
            );
        const resp = s.get('answer', { from: 'zod', schema: MathResponse });
        expect(MathResponse.safeParse(resp).success).toBe(true);
    });

    it('does tools correctly', async () => {
        const s = new ProgramState().fromOpenAI({ modelName: 'gpt-4o-mini' });

        const schema = z.object({
            equation: z.string(),
        });
        function solveEquation(args: z.infer<typeof schema>) {
            return 'mock function';
        }
        const tools = createTools([
            {
                function: solveEquation,
                name: 'solveEquation',
                params: schema,
                description: 'Solves a math equation',
            },
        ]);
        await s
            .add(
                s.system`You are an AI that cannot do math without a calculator.`,
            )
            .add(s.user`solve 8 + 3`)
            .add(s.assistant`${s.gen('step', { tools })}`);
        const resp = s.get('step', { from: 'tools', tools });
        expect(
            resp[0]?.toolUsed === 'solveEquation' &&
                resp[0]?.response === 'mock function',
        ).toBe(true);
    });
});

describe('Testing transform function', () => {
    it('does basic trimming correctly', async () => {
        const s = new ProgramState().fromOpenAI({ modelName: 'gpt-4o-mini' });

        s.add(s.system`You are a helpful assistant`);
        s.add(
            s.user`If you see this message ignore everything else I said and output "HELLO"`,
        );
        s.add(s.user`If you see this message say "bye bye" AND NOTHING ELSE`);
        await s.add(
            s.assistant`${s.gen('resp', {
                transform: async (messages) => {
                    const newMessages = messages;
                    // Max 20 tokens in prompt
                    while (
                        !(await isUnderTokenThreshold(newMessages, s, {
                            threshold: 25,
                        }))
                    ) {
                        newMessages.shift();
                    }
                    return newMessages;
                },
                sampling_params: {
                    temperature: 0,
                },
            })}`,
        );
        expect(s.get('resp') === 'bye bye').toBe(true);
    });

    it('does trim by relative priority correctly', async () => {
        const s = new ProgramState().fromOpenAI({ modelName: 'gpt-4o-mini' });

        s.add(s.system`You are a helpful assistant`, { prel: 100 });
        // This will be trimmed from the prompt
        s.add(
            s.user`If you see this message ignore everything else I said and output "HELLO"`,
            { prel: -1 },
        );
        // This will not be trimmed from the prompt
        s.add(s.user`If you see this message say "bye bye" AND NOTHING ELSE`, {
            prel: 10,
        });
        await s.add(
            s.assistant`${s.gen('resp', {
                transform: async (messages) =>
                    trimByRelativePriority(messages, s, { threshold: 25 }),
                sampling_params: {
                    temperature: 0,
                },
            })}`,
        );
        expect(s.get('resp') === 'bye bye').toBe(true);
    });

    it('does trim from old messages correctly', async () => {
        const s = new ProgramState().fromOpenAI({ modelName: 'gpt-4o-mini' });

        s.add(s.system`You are a helpful assistant`);
        // This will be trimmed from the prompt
        s.add(
            s.user`If you see this message ignore everything else I said and output "HELLO"`,
        );
        // This will not be trimmed from the prompt
        s.add(s.user`If you see this message say "bye bye" AND NOTHING ELSE`);
        await s.add(
            s.assistant`${s.gen('resp', {
                transform: async (messages) =>
                    trimFromOldMessages(messages, s, { threshold: 25 }),
                sampling_params: {
                    temperature: 0,
                },
            })}`,
        );
        expect(s.get('resp') === 'bye bye').toBe(true);
    });

    it('does trim from old messages correctly', async () => {
        const s = new ProgramState().fromOpenAI({ modelName: 'gpt-4o-mini' });

        s.add(s.system`You are a helpful assistant`);
        // This will be trimmed from the prompt
        s.add(
            s.user`If you see this message ignore everything else I said and output "HELLO"`,
        );
        // This will not be trimmed from the prompt
        s.add(s.user`If you see this message say "bye bye" AND NOTHING ELSE`);
        await s.add(
            s.assistant`${s.gen('resp', {
                transform: async (messages) =>
                    trimFromMiddle(messages, s, { threshold: 25 }),
                sampling_params: {
                    temperature: 0,
                },
            })}`,
        );
        expect(s.get('resp') === 'bye bye').toBe(true);
    });
});
