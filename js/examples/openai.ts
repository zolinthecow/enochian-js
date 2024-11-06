import OpenAIBackend from '../src/backends/openai.js';
import ProgramState from '../src/programState.js';

export async function run() {
    const s = new ProgramState().fromOpenAI({ modelName: 'gpt-4o-mini' });
    await s
        .add(s.system`You are a helpful assistant.`)
        .add(s.user`Tell me a joke.`)
        .add(s.assistant`${s.gen('joke')}`);
    console.log(s.get('joke'));
}

(async () => {
    await run();
})();
