import { describe, expect, it } from 'vitest';
import { getPSSweep } from './utils.js';

describe('Basic', async () => {
    const psSweep = await getPSSweep();
    for (const getS of psSweep) {
        it(`${(await getS()).getBackendType()}: Forking`, async () => {
            const s = await getS();

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

        it(`${(await getS()).getBackendType()}: Multi-fork`, async () => {
            const s = await getS();

            await s
                .add(s.system`You are a helpful assistant.`)
                .add(s.user`Tell me a joke`)
                .add(s.assistant`${s.gen('joke')}`);

            const forks = s.fork(2).flatMap((f) => f.fork(2));
            expect(forks.length).toBe(4);
            await Promise.all(
                forks.map((f) =>
                    f
                        .add(f.user`Tell me a better one`)
                        .add(f.assistant`${f.gen('joke2')}`),
                ),
            );
            for (const f of forks) {
                expect(f.get('joke2')).toBeDefined();
            }
        });
    }
});
