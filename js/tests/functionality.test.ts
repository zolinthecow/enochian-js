import { describe, expect, it } from 'vitest';

import { z } from 'zod';
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

        const answers = [
            "A balanced diet is essential for maintaining overall health and well-being. Eating a variety of nutrient-rich foods, including fruits, vegetables, whole grains, lean proteins, and healthy fats, can help support your body's functions and reduce the risk of chronic diseases. Aim to include a rainbow of colors on your plate to ensure you're getting a range of vitamins and minerals. Focus on whole, unprocessed foods as much as possible, and limit your intake of sugary drinks, refined carbohydrates, and saturated fats. Additionally, stay hydrated by drinking plenty of water throughout the day. A balanced diet can also help support a healthy weight, boost your energy levels, and even improve your mood. By making informed food choices, you can take a significant step towards maintaining your overall health and well-being.",
            "Regular Exercise! This is a crucial aspect of maintaining overall health and well-being. Engaging in physical activity on a regular basis can help boost your mood, increase energy levels, and even reduce the risk of chronic diseases like heart disease, diabetes, and some cancers. Aim for at least 150 minutes of moderate-intensity exercise, or 75 minutes of vigorous-intensity exercise, or a combination of both, per week. You can incorporate physical activity into your daily routine by taking a brisk walk during your lunch break, doing a few sets of stairs instead of the elevator, or trying a new workout class on the weekends. Additionally, consider incorporating strength training exercises into your routine, such as weightlifting or bodyweight exercises, to help build muscle and bone density. Remember to listen to your body and start slowly, especially if you're new to exercise, and always consult with a healthcare professional before making any significant changes to your exercise routine.",
            '1. Eat a balanced diet with a variety of nutrient-rich foods, and 2. Engage in regular exercise to support your overall health and well-being.',
        ];

        expect(forks[0]?.get('detailed_tip')).toBe(answers[0]);
        expect(forks[1]?.get('detailed_tip')).toBe(answers[1]);
        expect(s?.get('summary')).toBe(answers[2]);
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

    it('does constrained decoding correctly', async () => {
        const s = new ProgramState();

        await s.setModel(url);

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
        const profile = s.get('answer', schema);
        expect(schema.safeParse(profile).success).toBe(true);
    });
});
