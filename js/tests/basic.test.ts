import { describe, expect, it } from 'vitest';
import { getPSSweep } from './utils.js';

describe('Basic', async () => {
    const psSweep = await getPSSweep();
    for (const getS of psSweep) {
        it(`${(await getS()).getBackendType()}: Normal control flow`, async () => {
            const s = await getS();
            await s
                .add(s.system`You are a helpful assistant.`)
                .add(s.user`Tell me a joke`)
                .add(
                    s.assistant`${s.gen('answer1', { sampling_params: { temperature: 0 } })}`,
                );
            expect(s.get('answer1')).toBeDefined();
        });

        it(`${(await getS()).getBackendType()}: Backend switching`, async () => {
            const s = await getS();
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

        it(`${(await getS()).getBackendType()}: Streaming`, async () => {
            const s = await getS();
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

        it(`${(await getS()).getBackendType()}: Forced starting point`, async () => {
            const s = await getS();
            await s
                .add(s.system`You are a helpful assistant.`)
                .add(s.user`Tell me a story`)
                .add(
                    s.assistant`Once upon a time, ${s.gen('answer1', { sampling_params: { temperature: 0, max_new_tokens: 16 } })}`,
                );

            expect(
                !s.get('answer1')?.startsWith('Once upon a time'),
            ).toBeTruthy();
        });
    }
});
