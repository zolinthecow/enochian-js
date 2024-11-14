import type { APIEvent } from '@solidjs/start/server';
import { ulid } from 'ulid';
import { z } from 'zod';
import db, {
    PromptRequestSchema,
    type PromptRequest,
    PromptTypeSchema,
    PromptSchema,
    type PromptType,
} from '~/lib/db';
import { ee } from '~/server/api/utils';

const PromptRequestUpdateSchema = z.object({
    id: z.string(),
    responseContent: z.string(),
    responseTimestamp: z.string(),
    responseMetadata: z.unknown(), // JSON object
});
type PostBodyRequestUpdate = z.infer<typeof PostBodyRequestSchema>;
const PostBodyRequestSchema = z.union([
    PromptRequestUpdateSchema,
    PromptRequestSchema,
]);
type PostBodyRequest = z.infer<typeof PostBodyRequestSchema>;

const PostBodySchema = z.object({
    type: z.string(),
    id: z.string().ulid().optional(),
    requests: PostBodyRequestSchema.array(),
});
export type PromptPostBody = z.infer<typeof PostBodySchema>;
export type PromptPostReturnType = Awaited<ReturnType<typeof POST>>;

export async function POST(event: APIEvent) {
    const rawBody = await event.request.json();
    const body = PostBodySchema.parse(rawBody);
    let didCreateNewPromptType = false;
    let didCreateOrEditPrompt = false;
    const tx = await db.transaction('write');
    try {
        // Ensure PromptType exists
        const promptTypeRow = (
            await tx.execute({
                sql: 'SELECT type FROM PromptType WHERE type = ?',
                args: [body.type],
            })
        ).rows[0];
        if (!promptTypeRow) {
            await tx.execute({
                sql: 'INSERT INTO PromptType (type) VALUES (?)',
                args: [body.type],
            });
            didCreateNewPromptType = true;
        }

        // Get or create Prompt
        const promptID = body.id || ulid();
        const existingPromptRow = (
            await tx.execute({
                sql: 'SELECT id, requests FROM Prompt WHERE id = ?',
                args: [promptID],
            })
        ).rows[0];
        const existingPrompt = existingPromptRow?.requests
            ? {
                  id: existingPromptRow.id,
                  requests: z
                      .array(PromptRequestSchema)
                      .parse(JSON.parse(existingPromptRow.requests as string)),
              }
            : undefined;

        let updatedRequests: PromptRequest[];
        if (existingPrompt) {
            // Update existing prompt
            updatedRequests = existingPrompt.requests;

            for (const newRequest of body.requests) {
                const existingIndex = updatedRequests.findIndex(
                    (r) => r.id === newRequest.id,
                );

                if (existingIndex !== -1) {
                    // Update existing request, I don't see how this can not be correct
                    updatedRequests[existingIndex] = {
                        ...updatedRequests[existingIndex],
                        ...(newRequest as PostBodyRequestUpdate),
                    } as PromptRequest;
                } else {
                    // Add new request
                    updatedRequests.push(newRequest as PromptRequest);
                }
            }
            didCreateOrEditPrompt = true;
        } else if (body.requests.every((r) => isPromptRequest(r))) {
            // Create new prompt
            updatedRequests = body.requests;
            didCreateOrEditPrompt = true;
        } else {
            throw new Error('Invalid update body');
        }

        // Upsert the prompt
        await tx.execute({
            sql: `
            INSERT INTO Prompt (id, type, requests, updatedAt)
            VALUES (?, ?, ?, datetime('now'))
            ON CONFLICT(id) DO UPDATE SET
            type = excluded.type,
            requests = excluded.requests,
            updatedAt = excluded.updatedAt
        `,
            args: [promptID, body.type, JSON.stringify(updatedRequests)],
        });

        await tx.commit();

        if (didCreateNewPromptType) {
            ee.emit('newPromptType');
        }
        if (didCreateOrEditPrompt) {
            ee.emit('newPrompt');
        }

        return {
            id: promptID,
        };
    } catch (error) {
        await tx.rollback();
        console.error('Error processing request:', error);
        throw error;
    }
}

function isPromptRequest(request: PostBodyRequest): request is PromptRequest {
    return 'requestPrompt' in request;
}
