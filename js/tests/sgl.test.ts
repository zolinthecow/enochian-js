import { describe, expect, it } from 'vitest';

import { z } from 'zod';
import ProgramState, { createTools, OpenAIBackend } from '../src/index.js';

const IP = process.env.SGL_IP;
const port = process.env.SGL_PORT;
const url = `http://${IP}:${port}`;

describe('Basic functionality of the sgl ProgramState', () => {
    it('does a multiturn question correctly', async () => {
        const s = await new ProgramState().fromSGL(url);

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

        expect(s.get('answer1')).toContain("Here's one:");
        expect(s.get('answer2')).toContain("Here's another one:");
    });

    it('does backend swapping properly', async () => {
        const s = await new ProgramState().fromSGL(url);

        await s
            .add(s.system`You are a helpful assistant.`)
            .add(s.user`Tell me a joke`)
            .add(
                s.assistant`${s.gen('answer1', { sampling_params: { temperature: 0 } })}`,
            );

        s.fromOpenAI({ modelName: 'gpt-4o' });

        await s
            .add(s.user`Tell me a better one`)
            .add(s.assistant`No problem! ${s.gen('answer2')}`);

        expect(s.get('answer1')).toContain("Here's one");
        expect(s.get('answer2')).toBeDefined();
    });

    it('does choices correctly', async () => {
        const s = await new ProgramState().fromSGL(url);

        await s
            .add(s.system`You are an animal.`)
            .add(s.user`What are you?`)
            .add(
                s.assistant`I am a ${s.gen('answer', { choices: ['hippopotamus', 'giraffe'] })}`,
            );

        expect(s.get('answer')).toBe('giraffe');
    });

    it('does forking correctly', async () => {
        const s = await new ProgramState().fromSGL(url);

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
        const s = await new ProgramState().fromSGL(url);

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
        const s = await new ProgramState().fromSGL(url);

        const schema = z.object({
            id: z.string().uuid(),
            name: z.string().min(2).max(50),
            age: z.number().int().min(0).max(120),
            email: z.string().email(),
            tags: z.array(z.string()).min(1).max(5),
            role: z.enum(['admin', 'user', 'guest']),
            settings: z
                .object({
                    theme: z.enum(['light', 'dark']),
                    notifications: z.boolean(),
                })
                .optional(),
            // You can't use z.date() since the LLM will generate a datestring, not a Date
            joinedAt: z.string().date(),
        });

        await s
            .add(s.user`Describe a google employee's profile in json format`)
            .add(
                s.assistant`${s.gen('answer', { sampling_params: { zod_schema: schema } })}`,
            );
        const profile = s.get('answer', { from: 'zod', schema });
        expect(schema.safeParse(profile).success).toBe(true);
    });

    it('does tools correctly', async () => {
        const s = await new ProgramState().fromSGL(url);

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
