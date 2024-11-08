import ProgramState, { createTools } from 'enochian-js';
import { z } from 'zod';

const calculateParams = z.object({
    z: z.number(),
});

function calculate({ z }) {
    return 5 * z + 3;
}

const tools = createTools([
    {
        function: calculate,
        name: 'calculate',
        params: calculateParams,
        description: 'Calculates the value of 5z + 3',
    },
]);

(async () => {
    const z = Number.parseFloat(process.argv[2]);
    const s = await new ProgramState().fromSGL('http://localhost:30000');
    await s
        .add(s.system`You are a helpful assistant.`)
        .add(s.user`Calculate the value of 5 * ${z} + 3.`)
        .add(s.assistant`${s.gen('answer', { tools })}`);

    const action = s.get('answer', { from: 'tools', tools });
    if (action && action[0].toolUsed === 'calculate') {
        console.log(action[0].response);
    }
})();
