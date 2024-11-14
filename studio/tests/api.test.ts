import type { APIEvent } from '@solidjs/start/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import db, {
    PromptSchema,
    PromptTypeSchema,
    type Prompt,
    type PromptType,
} from '~/lib/db';
import { POST } from '~/routes/api/prompt'; // Adjust import path as needed
import { applyMigrations } from '../migrate';

describe('POST /api/prompt', () => {
    // Clean up database before each test
    beforeEach(async () => {
        applyMigrations();
        await db.execute('DELETE FROM Prompt');
        await db.execute('DELETE FROM PromptType');
    });

    // Clean up database after each test
    afterEach(async () => {
        await db.execute('DELETE FROM Prompt');
        await db.execute('DELETE FROM PromptType');
    });

    it('should handle initial prompt creation and subsequent update', async () => {
        // Mock APIEvent for first request
        const initialRequest = {
            request: {
                json: () =>
                    Promise.resolve({
                        type: 'test',
                        id: '01JARSVVEJ7MTZXFDFKGDB9P5S',
                        requests: [
                            {
                                id: '01JARSVVEJHWW3HM13SR1ZS5PN',
                                requestPrompt:
                                    '<|start_header_id|>system<|end_header_id|>\n\nYou are a helpful assistant.<|eot_id|><|start_header_id|>user<|end_header_id|>\n\nTell me a joke<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n',
                                requestMetadata: {
                                    sampling_params: {
                                        max_new_tokens: 128,
                                        min_new_tokens: 0,
                                        temperature: 0,
                                        top_p: 1,
                                        top_k: 1073741824,
                                        min_p: 0,
                                        frequency_penalty: 0,
                                        presence_penalty: 0,
                                        repetition_penalty: 1,
                                        ignore_eos: false,
                                        skip_special_tokens: true,
                                        spaces_between_special_tokens: true,
                                        n: 1,
                                    },
                                    debug: {
                                        baseUrl: 'http://localhost',
                                        port: 56765,
                                        debugName: 'test',
                                        debugPromptID:
                                            '01JARSVVEJ7MTZXFDFKGDB9P5S',
                                    },
                                    rid: '01JARSVVEJHWW3HM13SR1ZS5PN',
                                },
                                requestTimestamp: '2024-10-22T00:26:10.259Z',
                            },
                        ],
                    }),
            },
        } as APIEvent;

        // First request - create prompt
        const initialResponse = await POST(initialRequest);
        expect(initialResponse).toEqual({
            id: '01JARSVVEJ7MTZXFDFKGDB9P5S',
        });

        // Verify database state after initial request
        const promptTypeAfterInit = PromptTypeSchema.parse(
            (
                await db.execute({
                    sql: 'SELECT * FROM PromptType WHERE type = ?',
                    args: ['test'],
                })
            ).rows[0],
        );
        expect(promptTypeAfterInit).toBeTruthy();
        expect(promptTypeAfterInit.type).toBe('test');

        const promptAfterInit = PromptSchema.parse(
            (
                await db.execute({
                    sql: 'SELECT * FROM Prompt WHERE id = ?',
                    args: ['01JARSVVEJ7MTZXFDFKGDB9P5S'],
                })
            ).rows[0],
        );
        expect(promptAfterInit).toBeTruthy();

        expect(promptAfterInit.requests).toHaveLength(1);
        expect(promptAfterInit.requests[0]?.requestPrompt).toBeDefined();
        expect(promptAfterInit.requests[0]?.responseContent).toBeUndefined();

        // Mock APIEvent for second request (update)
        const updateRequest = {
            request: {
                json: () =>
                    Promise.resolve({
                        type: 'test',
                        id: '01JARSVVEJ7MTZXFDFKGDB9P5S',
                        requests: [
                            {
                                id: '01JARSVVEJHWW3HM13SR1ZS5PN',
                                responseContent:
                                    "Here's one:\n\nWhy couldn't the bicycle stand up by itself?\n\n(Wait for it...)\n\nBecause it was two-tired!\n\nHope that made you smile! Do you want to hear another one?",
                                responseMetadata: {
                                    prompt_tokens: 25,
                                    completion_tokens: 41,
                                    completion_tokens_wo_jump_forward: 41,
                                    finish_reason: {
                                        type: 'stop',
                                        matched: 128009,
                                    },
                                    id: '01JARSVVEJHWW3HM13SR1ZS5PN',
                                },
                                responseTimestamp: '2024-10-22T00:26:12.729Z',
                            },
                        ],
                    }),
            },
        } as APIEvent;

        // Second request - update prompt
        const updateResponse = await POST(updateRequest);
        expect(updateResponse).toEqual({
            id: '01JARSVVEJ7MTZXFDFKGDB9P5S',
        });

        // Verify final database state
        const promptAfterUpdate = PromptSchema.parse(
            (
                await db.execute({
                    sql: 'SELECT * FROM Prompt WHERE id = ?',
                    args: ['01JARSVVEJ7MTZXFDFKGDB9P5S'],
                })
            ).rows[0],
        );
        expect(promptAfterUpdate).toBeTruthy();

        expect(promptAfterUpdate.requests).toHaveLength(1);
        expect(promptAfterUpdate.requests[0]?.requestPrompt).toBeDefined();
        expect(promptAfterUpdate.requests[0]?.responseContent).toBeDefined();
        expect(promptAfterUpdate.requests[0]?.responseContent).toContain(
            'two-tired',
        );
        expect(promptAfterUpdate.requests[0]?.responseTimestamp).toBe(
            '2024-10-22T00:26:12.729Z',
        );
    });
});
