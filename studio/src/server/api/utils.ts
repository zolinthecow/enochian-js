import EventEmitter, { on } from 'node:events';
import { initTRPC } from '@trpc/server';

export const t = initTRPC.create();

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;

// Event emitter
export interface MyEvents {
    newPromptType: () => void;
    newPrompt: () => void;
}
class MyEventEmitter extends EventEmitter {
    override on<TEv extends keyof MyEvents>(
        event: TEv,
        listener: MyEvents[TEv],
    ): this {
        return super.on(event, listener);
    }

    override off<TEv extends keyof MyEvents>(
        event: TEv,
        listener: MyEvents[TEv],
    ): this {
        return super.off(event, listener);
    }

    override once<TEv extends keyof MyEvents>(
        event: TEv,
        listener: MyEvents[TEv],
    ): this {
        return super.once(event, listener);
    }

    override emit<TEv extends keyof MyEvents>(
        event: TEv,
        ...args: Parameters<MyEvents[TEv]>
    ): boolean {
        return super.emit(event, ...args);
    }

    public toIterable<TEv extends keyof MyEvents>(
        event: TEv,
        opts?: NonNullable<Parameters<typeof on>[2]>,
    ): AsyncIterable<Parameters<MyEvents[TEv]>> {
        return on(this, event, opts) as AsyncIterable<
            Parameters<MyEvents[TEv]>
        >;
    }
}

export const ee = new MyEventEmitter();
