import { z } from 'zod';
import type { PromptType } from '~/lib/db';
import db, { PromptTypeSchema } from '~/lib/db';
import { ee, publicProcedure } from '../../utils';

export const listenPromptTypes = publicProcedure.subscription(
    async function* (opts) {
        const iterable = ee.toIterable('newPromptType', {
            signal: opts.signal,
        });

        const getPromptTypes = async (): Promise<PromptType[]> => {
            let promptTypes: PromptType[] = [];
            try {
                const promptTypeRows = await db.execute(
                    'SELECT * FROM PromptType',
                );
                promptTypes = z
                    .array(PromptTypeSchema)
                    .parse(promptTypeRows.rows);
            } catch (e) {
                console.error('FAILED TO GET PROMPT TYPES', e);
            }

            return promptTypes;
        };
        yield getPromptTypes();

        for await (const _ of iterable) {
            yield getPromptTypes();
        }
    },
);
