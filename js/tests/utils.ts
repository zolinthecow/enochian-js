import ProgramState from '../src/index.js';

const IP = process.env.SGL_IP;
const port = process.env.SGL_PORT;
const url = `http://${IP}:${port}`;

export async function getPSSweep() {
    return [
        async () => await new ProgramState().fromSGL(url),
        async () => new ProgramState().fromOpenAI({ modelName: 'gpt-4o-mini' }),
    ];
}
