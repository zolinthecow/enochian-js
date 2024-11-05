// DBOS Durable Agent
import { Step, type StepContext } from '@dbos-inc/dbos-sdk';
import { z } from 'zod';
import ProgramState, { OpenAIBackend, createTools } from '../src/index.js';

const ProcessRefundArgsSchema = z.object({
    userName: z.string(),
    itemID: z.number(),
    _reason: z.string().optional(),
});

class RefundAgent {
    static processRefund(args: z.infer<typeof ProcessRefundArgsSchema>) {
        const reason = args._reason ?? 'NOT SPECIFIED';
        console.log(
            `[mock] Refunding ${args.userName} for item ${args.itemID}, because ${reason}...`,
        );
        for (let i = 1; i <= 6; i++) {
            RefundAgent.refundStep(i);
        }
        return 'Success!';
    }

    static async refundStep(stepID: number) {
        console.log(
            `[mock] Processing refund step ${stepID}... Press Control + C to quit`,
        );
        return 'Processed';
    }

    // @Step()
    static applyDiscount() {
        console.log('[mock] Applying discount...');
        return 'Applied discount of 11%';
    }

    foo() {
        return 'bar';
    }
}

(async () => {
    const s = new ProgramState();
    await s.setModel('http://localhost:30000');

    const tools = createTools([
        {
            function: RefundAgent.applyDiscount,
            name: 'applyDiscount',
            description: 'Provide a discount of 11% on their next order',
        },
        {
            function: RefundAgent.processRefund,
            name: 'processRefund',
            params: ProcessRefundArgsSchema,
            description: 'Process a refund request',
        },
    ]);

    s.add(
        s.system`${
            'You are a helpful agent currently helping a customer process a refund. Additionally, If the reason is that it was too expensive,' +
            'also offer the user a discount code along with the refund. Always process the refund.'
        }`,
    ).add(
        s.user`${
            "From Max: I want to refund item 99 because it's too expensive and I don't " +
            'like its color! I want to proceed with the refund and also get a discount ' +
            'for my next purchase!'
        }`,
    );

    while (true) {
        await s.add(
            s.assistant`${s.gen('action', {
                tools,
            })}`,
        );
        const action = s.get('action', { from: 'tools', tools });
        if (!action) {
            console.error(`No tool was used: ${action}`);
            return;
        }
        if (action.toolUsed === 'respondToUser') {
            console.log(action.response);
            break;
        }
        s.add(
            s.user`${action.toolUsed} Result: ${JSON.stringify(action.response)}`,
        );
    }
})();
