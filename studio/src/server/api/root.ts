import { promptRouter } from './routers/prompt';
import { createTRPCRouter } from './utils';

export const appRouter = createTRPCRouter({
    prompt: promptRouter,
});

export type AppRouter = typeof appRouter;
