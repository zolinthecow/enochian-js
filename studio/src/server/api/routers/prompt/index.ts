import { createTRPCRouter } from '~/server/api/utils';
import { listenPromptTypes } from './listenPromptTypes';
import { listenPrompts } from './newPrompts';

export const promptRouter = createTRPCRouter({
    listenPromptTypes,
    listenPrompts,
});
