import type { ParsedPrompt, Prompt } from '~/lib/db';
import db, { parsePrompt } from '~/lib/db';
import { ee, publicProcedure } from '../../utils';

export const listenPrompts = publicProcedure.subscription(
    async function* (opts) {
        const iterable = ee.toIterable('newPrompt', {
            signal: opts.signal,
        });

        const getPrompts = (): ParsedPrompt[] => {
            const prompts = db
                .prepare('SELECT * FROM Prompt')
                .all() as Prompt[];
            return prompts.map((p) => parsePrompt(p));
        };
        yield getPrompts();

        for await (const _ of iterable) {
            yield getPrompts();
        }
    },
);
