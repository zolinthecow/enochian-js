import { z } from 'zod';
import ProgramState from '../src/programState.js';

const schema = z.object({
    id: z.string().uuid(),
    name: z.string().min(2).max(50),
    age: z.number().int().min(0).max(120),
    email: z.string().email(),
    tags: z.array(z.string()).min(1).max(5),
    role: z.enum(['admin', 'user', 'guest']),
    settings: z
        .object({
            theme: z.enum(['light', 'dark']),
            notifications: z.boolean(),
        })
        .optional(),
    // You can't use z.date() since the LLM will generate a datestring, not a Date
    joinedAt: z.string().date(),
});

export async function run() {
    const s = new ProgramState();

    await s.setModel('http://localhost:30000');
    await s
        .add(s.user`Describe a google employee's profile in json format`)
        .add(
            s.assistant`${s.gen('answer', { sampling_params: { zod_schema: schema } })}`,
        );
    // If anyone knows how to make the type automatically inferred without passing in the schema again
    // please let me know
    const profile = s.get('answer', { from: 'zod', schema });
    console.log(profile);
}

(async () => {
    await run();
})();
