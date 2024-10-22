import { describe, expect, it } from 'vitest';

import ProgramState, { OpenAIBackend } from '../src/index.js';

const IP = process.env.SGL_IP;
const port = process.env.SGL_PORT;
const url = `http://${IP}:${port}`;

describe('Basic functionality of the ProgramState', () => {
    it('does a multiturn question correctly', async () => {
        const s = new ProgramState();

        await s.setModel(url);
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

        const answers = [
            "Here's one:\n" +
                '\n' +
                "Why couldn't the bicycle stand up by itself?\n" +
                '\n' +
                '(Wait for it...)\n' +
                '\n' +
                'Because it was two-tired!\n' +
                '\n' +
                'Hope that made you smile! Do you want to hear another one?',
            " Here's another one:\n" +
                '\n' +
                "Why don't scientists trust atoms?\n" +
                '\n' +
                '(Think about it for a sec...)\n' +
                '\n' +
                'Because they make up everything!\n' +
                '\n' +
                'Hope that one was more to your liking! Do you want to hear another one?',
        ];

        expect(s.get('answer1')).toBe(answers[0]);
        expect(s.get('answer2')).toBe(answers[1]);
    });

    it('does backend swapping properly', async () => {
        const s = new ProgramState();

        await s.setModel(url);
        await s
            .add(s.system`You are a helpful assistant.`)
            .add(s.user`Tell me a joke`)
            .add(
                s.assistant`${s.gen('answer1', { sampling_params: { temperature: 0 } })}`,
            );

        s.setBackend(
            new OpenAIBackend({ apiKey: process.env.OPENAI_KEY }),
        ).setModel({ modelName: 'gpt-4o' });

        await s
            .add(s.user`Tell me a better one`)
            .add(s.assistant`No problem! ${s.gen('answer2')}`);

        const answer1 =
            "Here's one:\n" +
            '\n' +
            "Why couldn't the bicycle stand up by itself?\n" +
            '\n' +
            '(Wait for it...)\n' +
            '\n' +
            'Because it was two-tired!\n' +
            '\n' +
            'Hope that made you smile! Do you want to hear another one?';
        expect(s.get('answer1')).toBe(answer1);
        // Can't really control openai deterministically, so as long as it didn't crash I'm fine with it
        expect(s.get('answer2')).toBeDefined();
    });

    it('does choices correctly', async () => {
        const s = new ProgramState();

        await s.setModel(url);
        await s
            .add(s.system`You are an animal.`)
            .add(s.user`What are you?`)
            .add(
                s.assistant`I am a ${s.gen('answer', { choices: ['hippopotamus', 'giraffe'] })}`,
            );

        expect(s.get('answer')).toBe('giraffe');
    });

    it('does forking correctly', async () => {
        const s = new ProgramState();
        await s.setModel(url);

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
        expect(s?.get('summary')).contains('1.');
    });

    it('does streaming correctly', async () => {
        const s = new ProgramState();

        await s.setModel(url);
        const gen = s
            .add(s.system`You are a helpful assistant.`)
            .add(s.user`Tell me a joke`)
            .add(
                s.assistant`${s.gen('answer1', { stream: true, sampling_params: { temperature: 0 } })}`,
            );
        for await (const chunk of gen) {
            expect(typeof chunk.content).toBe('string');
        }

        const answer1 =
            "Here's one:\n" +
            '\n' +
            "Why couldn't the bicycle stand up by itself?\n" +
            '\n' +
            '(Wait for it...)\n' +
            '\n' +
            'Because it was two-tired!\n' +
            '\n' +
            'Hope that made you smile! Do you want to hear another one?';
        expect(s.get('answer1')).toBe(answer1);
    });
});
