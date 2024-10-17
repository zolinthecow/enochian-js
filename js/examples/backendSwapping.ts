import OpenAIBackend from '../src/backends/openai.js';
import ProgramState from '../src/programState.js';

export async function run() {
    const s = new ProgramState();

    await s.setModel('http://localhost:30000');
    await s
        .add(s.system`You are a helpful assistant.`)
        .add(s.user`Tell me a joke`)
        .add(s.assistant`${s.gen('answer1')}`);

    s.setBackend(
        new OpenAIBackend({ apiKey: process.env.OPENAI_KEY }),
    ).setModel({ modelName: 'gpt-4o' });

    await s
        .add(s.user`Tell me a better one`)
        .add(s.assistant`No problem! ${s.gen('answer2')}`);
    console.log(s.get('answer1'), '\n------\n', s.get('answer2'));
}

(async () => {
    await run();
})();