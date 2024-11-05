// DBOS Durable Agent
import { Step, type StepContext } from '@dbos-inc/dbos-sdk';
import { z } from 'zod';
import { OpenAIBackend } from '../src/index.js';
import ProgramState from '../src/programState.js';

class RefundAgent {
    static processRefund(userName: string, itemID: number, _reason?: string) {
        const reason = _reason ?? 'NOT SPECIFIED';
        console.log(
            `[mock] Refunding ${userName} for item ${itemID}, because ${reason}...`,
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

    static async run() {
        const s = new ProgramState();
        await s.setModel('http://localhost:30000');

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

        const tools = [
            {
                function: RefundAgent.applyDiscount,
                description: 'Provide a discount of 11% on their next order',
            },
            {
                function: RefundAgent.processRefund,
                params: z.object({
                    userName: z.string(),
                    itemID: z.number(),
                    _reason: z.string().optional(),
                }),
                description: 'Process a refund request',
            },
        ];

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
    }

    foo() {
        return 'bar';
    }
}

(async () => {
    await RefundAgent.run();
})();
