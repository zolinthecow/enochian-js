// DBOS Durable Agent
import {
    type HandlerContext,
    PostApi,
    Step,
    type StepContext,
    Workflow,
    type WorkflowContext,
} from '@dbos-inc/dbos-sdk';
import ProgramState, { createTools } from 'enochian-js';
import { z } from 'zod';

const ProcessRefundArgsSchema = z.object({
    userName: z.string(),
    itemID: z.number(),
    _reason: z.string().optional(),
});

// biome-ignore lint/complexity/noStaticOnlyClass: DBOS requires this
export class RefundAgent {
    @Step()
    static async processRefund(
        ctx: StepContext,
        args: z.infer<typeof ProcessRefundArgsSchema>,
    ) {
        const reason = args._reason ?? 'NOT SPECIFIED';
        console.log(
            `[mock] Refunding ${args.userName} for item ${args.itemID}, because ${reason}...`,
        );
        for (let i = 1; i <= 6; i++) {
            RefundAgent.refundStep(i);
            await new Promise((resolve) =>
                setTimeout(() => resolve('done'), 1000),
            );
        }
        return 'Success!';
    }

    static async refundStep(stepID: number) {
        console.log(
            `[mock] Processing refund step ${stepID}... Press Control + C to quit`,
        );
        return 'Processed';
    }

    @Step()
    static async applyDiscount(ctx: StepContext) {
        console.log('[mock] Applying discount...');
        return 'Applied discount of 11%';
    }

    @Workflow()
    static async RefundWorkflow(
        ctx: WorkflowContext,
        userName: string,
        userRequest: string,
    ) {
        const s = new ProgramState().fromOpenAI({ modelName: 'gpt-4o-mini' });

        const tools = createTools([
            {
                function: (args: z.infer<typeof ProcessRefundArgsSchema>) =>
                    ctx.invoke(RefundAgent).processRefund(args),
                name: 'processRefund',
                description: 'Processes a refund request',
                params: ProcessRefundArgsSchema,
            },
            {
                function: () => ctx.invoke(RefundAgent).applyDiscount(),
                name: 'applyDiscount',
                description:
                    'Provides a coupon for an 11% discount on their next order',
            },
        ]);

        s.add(
            s.system`${
                'You are a helpful agent currently helping a customer process a refund. Additionally, If the reason is that it was too expensive,' +
                'also offer the user a discount code along with the refund. Always process the refund.'
            }`,
        ).add(s.user`From ${userName}: ${userRequest}`);

        let iterations = 0;
        while (iterations < 10) {
            iterations += 1;
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
            const responseToUser = action.find(
                (a) => a.toolUsed === 'respondToUser',
            );
            if (responseToUser) {
                const resp = responseToUser.response ?? '';
                console.log(resp);
                return resp;
            }
            for (const toolUsed of action) {
                s.add(
                    s.user`${toolUsed.toolUsed} Result: ${JSON.stringify(toolUsed.response)}`,
                );
            }
        }
        return 'Failed to apply discount';
    }

    @PostApi('/refund')
    static async startRefund(ctx: HandlerContext) {
        const userName = 'Max';
        const userRequest =
            "I want to refund item 99 because it's too expensive and I don't " +
            'like its color! I want to proceed with the refund and also get a discount ' +
            'for my next purchase!';
        const resp = await ctx
            .startWorkflow(RefundAgent)
            .RefundWorkflow(userName, userRequest);
        return 'Success';
    }
}
