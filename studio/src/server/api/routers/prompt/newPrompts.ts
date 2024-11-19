import { z } from 'zod';
import type { Prompt } from '~/lib/db';
import db, { PromptSchema } from '~/lib/db';
import { ee, publicProcedure } from '../../utils';

export const listenPrompts = publicProcedure.subscription(
    async function* (opts) {
        const iterable = ee.toIterable('newPrompt', {
            signal: opts.signal,
        });

        const getPrompts = async (): Promise<Prompt[]> => {
            let prompts: Prompt[] = [];
            try {
                const promptRows = (await db.execute('SELECT * FROM Prompt'))
                    .rows;
                let i = 0;
                for (const pr of promptRows) {
                    i++;
                    PromptSchema.parse(pr);
                }
                prompts = z.array(PromptSchema).parse(promptRows);
            } catch (e) {
                console.error('FAILED TO GET PROMPTS', e);
            }
            return prompts;
        };
        yield await getPrompts();

        for await (const _ of iterable) {
            yield await getPrompts();
        }
    },
);
