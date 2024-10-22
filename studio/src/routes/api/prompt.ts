import type { APIEvent } from '@solidjs/start/server';
import { ulid } from 'ulid';
import { z } from 'zod';
import db, {
    PromptRequestSchema,
    type Prompt,
    type PromptType,
    type PromptRequest,
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

    try {
        db.prepare('BEGIN TRANSACTION').run();

        // Ensure PromptType exists
        const promptType = db
            .prepare('SELECT type FROM PromptType WHERE type = ?')
            .get(body.type) as PromptType | null;
        if (!promptType) {
            db.prepare('INSERT INTO PromptType (type) VALUES (?)').run(
                body.type,
            );
            didCreateNewPromptType = true;
        }

        // Get or create Prompt
        const promptID = body.id || ulid();
        const existingPrompt = db
            .prepare('SELECT id, requests FROM Prompt WHERE id = ?')
            .get(promptID) as Prompt | null;

        let updatedRequests: PromptRequest[];
        if (existingPrompt) {
            // Update existing prompt
            updatedRequests = JSON.parse(
                existingPrompt.requests,
            ) as PromptRequest[];

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
        db.prepare(`
            INSERT INTO Prompt (id, type, requests, updatedAt)
            VALUES (?, ?, ?, datetime('now'))
            ON CONFLICT(id) DO UPDATE SET
            type = excluded.type,
            requests = excluded.requests,
            updatedAt = excluded.updatedAt
        `).run(promptID, body.type, JSON.stringify(updatedRequests));

        db.prepare('COMMIT').run();

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
        db.prepare('ROLLBACK').run();
        console.error('Error processing request:', error);
        throw error;
    }
}

function isPromptRequest(request: PostBodyRequest): request is PromptRequest {
    console.log(request);
    return 'requestPrompt' in request;
}
