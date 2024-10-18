import type { APIEvent } from '@solidjs/start/server';
import { ulid } from 'ulid';
import { z } from 'zod';

import db, { type Prompt, type PromptType } from '~/lib/db';
import { ee } from '~/server/api/utils';

const PostBodySchema = z.object({
    type: z.string(),
    id: z.string().ulid().optional(),
    prompt: z.string(),
    // Any JSON
    metadata: z.any().optional(),
});

export async function POST(event: APIEvent) {
    const rawBody = await event.request.json();
    const body = PostBodySchema.parse(rawBody);

    let didCreateNewPromptType = false;
    let didCreateNewPrompt = false;
    try {
        db.prepare('BEGIN TRANSACTION').run();

        try {
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
            let promptID = body.id;
            if (!promptID) {
                promptID = ulid();
            }

            const existingPrompt = db
                .prepare(
                    'SELECT id, prompts, metadata FROM Prompt WHERE id = ?',
                )
                .get(promptID) as Prompt | null;

            if (existingPrompt) {
                // Update existing prompt
                const updatedPrompts = JSON.parse(
                    existingPrompt.prompts,
                ) as string[];
                updatedPrompts.push(body.prompt);

                const updatedMetadata = JSON.parse(
                    existingPrompt.metadata,
                ) as unknown[];
                updatedMetadata.push(body.metadata || {});

                db.prepare(`
              UPDATE Prompt
              SET prompts = ?, metadata = ?, updatedAt = datetime('now')
              WHERE id = ?
            `).run(
                    JSON.stringify(updatedPrompts),
                    JSON.stringify(updatedMetadata),
                    promptID,
                );
            } else {
                // Create new prompt
                db.prepare(`
              INSERT INTO Prompt (id, type, prompts, metadata)
              VALUES (?, ?, ?, ?)
            `).run(
                    promptID,
                    body.type,
                    JSON.stringify([body.prompt]),
                    JSON.stringify([body.metadata || {}]),
                );
                didCreateNewPrompt = true;
            }

            db.prepare('COMMIT').run();

            if (didCreateNewPromptType) {
                ee.emit('newPromptType');
            }
            if (didCreateNewPrompt) {
                ee.emit('newPrompt');
            }

            return {
                id: promptID,
            };
        } catch (error) {
            db.prepare('ROLLBACK').run();
            throw error;
        }
    } catch (error) {
        console.error('Error processing request:', error);
        throw error;
    }
}
