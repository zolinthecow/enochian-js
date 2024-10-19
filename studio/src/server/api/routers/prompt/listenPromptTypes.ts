import type { PromptType } from '~/lib/db';
import db from '~/lib/db';
import { ee, publicProcedure } from '../../utils';

export const listenPromptTypes = publicProcedure.subscription(
    async function* (opts) {
        const iterable = ee.toIterable('newPromptType', {
            signal: opts.signal,
        });

        const getPromptTypes = (): PromptType[] => {
            const promptTypes = db
                .prepare('SELECT * FROM PromptType')
                .all() as PromptType[];
            return promptTypes;
        };
        yield getPromptTypes();

        for await (const _ of iterable) {
            yield getPromptTypes();
        }
    },
);
