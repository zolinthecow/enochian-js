import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { getPSSweep } from './utils.js';

describe('Constrained decoding', async () => {
    const psSweep = await getPSSweep();
    for (const getS of psSweep) {
        it(`${(await getS()).getBackendType()}: basic schema`, async () => {
            const s = await getS();
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

        if ((await getS()).getBackendType() !== 'OpenAI') {
            const s = await getS();
            it(`${(await getS()).getBackendType()}: union schema`, async () => {
                const schema = z.discriminatedUnion('location', [
                    z.object({
                        location: z.literal('Boston'),
                        basketballTeam: z.literal('Celtics'),
                        mayor: z.string(),
                    }),
                    z.object({
                        location: z.literal('New York'),
                        baseballTeam: z.string(),
                    }),
                ]);

                await s
                    .add(s.user`Describe your favorite city in JSON format`)
                    .add(
                        s.assistant`${s.gen('answer', { sampling_params: { zod_schema: schema } })}`,
                    );
                const profile = s.get('answer', { from: 'zod', schema });
                expect(schema.safeParse(profile).success).toBe(true);
            });
        }

        if ((await getS()).getBackendType() !== 'OpenAI') {
            const s = await getS();
            it(`${(await getS()).getBackendType()}: advanced schema`, async () => {
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
                    .add(
                        s.user`Describe a google employee's profile in json format`,
                    )
                    .add(
                        s.assistant`${s.gen('answer', { sampling_params: { zod_schema: schema } })}`,
                    );
                const profile = s.get('answer', { from: 'zod', schema });
                expect(schema.safeParse(profile).success).toBe(true);
            });
        }

        if ((await getS()).getBackendType() !== 'OpenAI') {
            it(`${(await getS()).getBackendType()}: choices`, async () => {
                const s = await getS();

                await s
                    .add(s.system`You are an animal.`)
                    .add(s.user`What are you?`)
                    .add(
                        s.assistant`I am a ${s.gen('answer', { choices: ['hippopotamus', 'giraffe'] })}`,
                    );

                expect(s.get('answer')).toBe('giraffe');
            });
        }
    }
});
