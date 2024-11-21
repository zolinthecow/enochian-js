import { describe, expect, it } from 'vitest';
import { getPSSweep } from './utils.js';

describe('Control flow', async () => {
    const psSweep = await getPSSweep();
    for (const getS of psSweep) {
        it(`${(await getS()).getBackendType()}: Get whole message`, async () => {
            const s = await getS();
            s.add(s.user`hi my name is zolin`, { id: 'b' });
            expect(s.get('b')).toBe('hi my name is zolin');
        });

        it(`${(await getS()).getBackendType()}: Update and regenerate`, async () => {
            const s = await getS();
            await s
                .add(s.system`You are a helpful assistant`, { id: 'a' })
                .add(s.user`Tell me a joke`, { id: 'b' })
                .add(s.assistant`${s.gen('joke')}`, { id: 'c' });
            expect(s.get('joke')).toBeDefined();
            expect(s.get('a')).toBe('You are a helpful assistant');
            await s
                .update('b', s.user`Tell me a short story`, undefined, {
                    deleteMessagesAfter: true,
                })
                .add(
                    s.assistant`${s.gen('story', { sampling_params: { max_new_tokens: 24 } })}`,
                    { id: 'd' },
                );
            expect(s.get('b')).toBeUndefined();
            expect(s.get('d')).toBeDefined();
        });
    }
});
