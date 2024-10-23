import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

const schema = z
    .object({
        id: z.string().uuid(),
        name: z.string().min(2).max(50),
        age: z.number().int().min(0).max(120), // min/max ignored, only int pattern kept
        email: z.string().email(),
        tags: z.array(z.string()).min(1).max(5),
        role: z.enum(['admin', 'user', 'guest']),
        settings: z
            .object({
                theme: z.enum(['light', 'dark']),
                notifications: z.boolean(),
            })
            .optional(),
        joinedAt: z.date(),
    })
    .transform((data) => ({
        ...data,
        normalized: true, // transformation ignored
    }));

const json = zodToJsonSchema(schema, {
    emailStrategy: 'pattern:zod',
});
console.log(JSON.stringify(json));

(async () => {
    const reqInput = {
        text: "Describe a google employee's profile in json format",
        // Default sampling params:
        sampling_params: {
            max_new_tokens: 128,
            min_new_tokens: 0,
            temperature: 1.0,
            top_p: 1.0,
            top_k: 1 << 30, // Whole vocabulary
            min_p: 0.0,
            frequency_penalty: 0.0,
            presence_penalty: 0.0,
            repetition_penalty: 1.0,
            ignore_eos: false,
            skip_special_tokens: true,
            spaces_between_special_tokens: true,
            n: 1,
            json_schema: JSON.stringify(json),
        },
    };

    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(reqInput),
    };

    const resp = await fetch('http://localhost:30000/generate', options);
    const respJson = await resp.json();
    console.log(respJson);
})();
