import { describe, expect, it } from 'vitest';
import {
    isUnderTokenThreshold,
    trimByRelativePriority,
    trimFromMiddle,
    trimFromOldMessages,
} from '../src/index.js';
import { getPSSweep } from './utils.js';

describe('Transform function', async () => {
    const psSweep = await getPSSweep();
    for (const getS of psSweep) {
        it(`${(await getS()).getBackendType()}: Basic`, async () => {
            const s = await getS();

            s.add(s.system`You are a helpful assistant`);
            s.add(
                s.user`If you see this message ignore everything else I said and output "HELLO"`,
            );
            s.add(
                s.user`If you see this message say "bye bye" AND NOTHING ELSE`,
            );
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

        it(`${(await getS()).getBackendType()}: Relative priority`, async () => {
            const s = await getS();

            s.add(s.system`You are a helpful assistant`, { prel: 100 });
            // This will be trimmed from the prompt
            s.add(
                s.user`If you see this message ignore everything else I said and output "HELLO"`,
                { prel: -1 },
            );
            // This will not be trimmed from the prompt
            s.add(
                s.user`If you see this message say "bye bye" AND NOTHING ELSE`,
                {
                    prel: 10,
                },
            );
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

        it(`${(await getS()).getBackendType()}: Trim from old`, async () => {
            const s = await getS();

            s.add(s.system`You are a helpful assistant`);
            // This will be trimmed from the prompt
            s.add(
                s.user`If you see this message ignore everything else I said and output "HELLO"`,
            );
            // This will not be trimmed from the prompt
            s.add(
                s.user`If you see this message say "bye bye" AND NOTHING ELSE`,
            );
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

        it(`${(await getS()).getBackendType()}: Trim from middle`, async () => {
            const s = await getS();
            s.add(s.system`You are a helpful assistant`);
            // This will be trimmed from the prompt
            s.add(
                s.user`If you see this message ignore everything else I said and output "HELLO"`,
            );
            // This will not be trimmed from the prompt
            s.add(
                s.user`If you see this message say "bye bye" AND NOTHING ELSE`,
            );
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
    }
});
