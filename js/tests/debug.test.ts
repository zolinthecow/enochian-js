import type { PromptPostBody } from 'enochian-studio';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import ProgramState from '../src/index.js';

const IP = process.env.SGL_IP;
const port = process.env.SGL_PORT;
const url = `http://${IP}:${port}`;

let capturedRequestBodies: PromptPostBody[] = [];

// Set up the mock server
const server = setupServer(
    http.post('http://localhost:56765/api/prompt', async ({ request }) => {
        const body = await request.json();
        console.log(JSON.stringify(body));
        capturedRequestBodies.push(body);
        return HttpResponse.json({ id: 'abc123' }, { status: 200 });
    }),
);

// Start server before all tests
beforeAll(() => server.listen());

// Reset handlers and clear captured request after each test
afterEach(() => {
    server.resetHandlers();
    capturedRequestBodies = [];
});

// Close server after all tests
afterAll(() => server.close());

const requestMetadata = {
    debug: {
        baseUrl: 'http://localhost',
        port: 56765,
        debugName: 'test',
        debugPromptID: 'TEMP',
    },
    sampling_params: {
        max_new_tokens: 1024,
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
    rid: 'TEMP',
};
const response = {
    type: 'test',
    id: '01JARQGWSH4ACV35JE443R7H7B',
    requests: [
        {
            id: '01JARQGWSJQ8GSVGG6CS0ZS9XH',
            responseContent:
                "Here's one:\n\nWhy couldn't the bicycle stand up by itself?\n\n(Wait for it...)\n\nBecause it was two-tired!\n\nHope that made you smile! Do you want to hear another one?",
            responseMetadata: {
                prompt_tokens: 25,
                completion_tokens: 41,
                completion_tokens_wo_jump_forward: 41,
                finish_reason: { type: 'stop', matched: 128009 },
                id: 'TEMP',
            },
            responseTimestamp: '2024-10-21T23:45:16.611Z',
        },
    ],
};

describe('enochian-studio integration', () => {
    it('sends correct data in POST request', async () => {
        const s = await new ProgramState().fromSGL(url);
        s.beginDebugRegion({ debugName: 'test' });
        await s
            .add(s.system`You are a helpful assistant.`)
            .add(s.user`Tell me a joke`)
            .add(
                s.assistant`${s.gen('answer1', { sampling_params: { temperature: 0 } })}`,
            );

        expect(capturedRequestBodies[0].type).toBe('test');
        expect(capturedRequestBodies[0].requests[0].requestPrompt).toBe(
            '<|start_header_id|>system<|end_header_id|>\n\nYou are a helpful assistant.<|eot_id|><|start_header_id|>user<|end_header_id|>\n\nTell me a joke<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n',
        );
        expect({
            ...capturedRequestBodies[0].requests[0].requestMetadata,
            debug: {
                ...capturedRequestBodies[0].requests[0].requestMetadata.debug,
                debugPromptID: 'TEMP',
            },
            rid: 'TEMP',
        }).toStrictEqual(requestMetadata);
        expect(capturedRequestBodies[1].type).toBe('test');
        expect(capturedRequestBodies[1].requests[0].responseContent).toBe(
            response.requests[0]?.responseContent,
        );
        expect({
            ...capturedRequestBodies[1].requests[0].responseMetadata,
            id: 'TEMP',
        }).toStrictEqual(response.requests[0]?.responseMetadata);
    });
});
