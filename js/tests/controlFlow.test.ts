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

        it(`${(await getS()).getBackendType()}: Implicitly set message ID in gen`, async () => {
            const s = await getS();
            await s
                .add(s.system`You are a helpful assistant`)
                .add(s.user`Tell me a joke`)
                .add(s.assistant`${s.gen('joke1')}`);
            expect(s.get('joke1')).toBeDefined();
            await s
                .add(s.user`Tell me a better one`)
                .add(s.assistant`No problem! ${s.gen('joke2')}`);
            expect(s.get('joke2')).toBeDefined();
            expect(s.get('joke2')?.startsWith('No problem! ')).toBeFalsy();
            await s
                .add(s.user`Okay one last one`)
                .add(s.assistant`Sure thing. ${s.gen('joke3')}`, {
                    id: 'fullJoke3',
                });
            expect(s.get('joke3')).toBeDefined();
            expect(s.get('fullJoke3')).toBeDefined();
            expect(s.get('joke3')?.startsWith('Sure thing. ')).toBeFalsy();
            expect(s.get('fullJoke3')?.startsWith('Sure thing. ')).toBeTruthy();
        });

        it(`${(await getS()).getBackendType()}: Update and fully regenerate`, async () => {
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
            expect(s.get('b')).toBeDefined();
            expect(s.get('d')).toBeDefined();
        });

        it(`${(await getS()).getBackendType()}: Update in place`, async () => {
            const s = await getS();
            await s
                .add(s.system`You are a helpful assistant`)
                .add(s.user`Tell me a joke`)
                .add(s.assistant`${s.gen('joke')}`);
            expect(s.get('joke')).toBeDefined();
            await s
                .add(s.user`Tell me another one`)
                .add(s.assistant`${s.gen('joke2')}`);
            const oldJoke = s.get('joke');
            await s.update('joke', s.assistant`${s.gen('joke')}`, undefined, {
                deleteMessagesAfter: true,
            });
            expect(s.get('joke')).toBeDefined();
            expect(oldJoke !== s.get('joke')).toBeTruthy();
        });
    }
});
