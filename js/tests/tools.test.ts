import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createTools } from '../src/index.js';
import { getPSSweep } from './utils.js';

describe('Constrained decoding', async () => {
    const psSweep = await getPSSweep();
    for (const getS of psSweep) {
        it(`${(await getS()).getBackendType()}: Tool use`, async () => {
            const s = await getS();

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

        it(`${(await getS()).getBackendType()}: Error capturing`, async () => {
            const s = await getS();

            const schema = z.object({
                equation: z.string(),
            });
            function solveEquation(args: z.infer<typeof schema>): string {
                throw new Error('THIS FAILS');
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
            expect(resp[0]?.toolUsed).toBe('solveEquation');
            expect(resp[0]?.response).toBeUndefined();
            // @ts-ignore
            expect(resp[0]?.error).toBe('Error: THIS FAILS');
        });

        it(`${(await getS()).getBackendType()}: Responds to user`, async () => {
            const s = await getS();

            const schema = z.object({
                equation: z.string(),
            });
            function solveEquation(args: z.infer<typeof schema>): string {
                throw new Error('THIS FAILS');
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
                .add(s.user`Say hi to me`)
                .add(s.assistant`${s.gen('step', { tools })}`);
            const resp = s.get('step', { from: 'tools', tools });
            expect(resp[0]?.toolUsed).toBe('respondToUser');
            expect(resp[0]?.response).toBeDefined();
        });
    }
});
