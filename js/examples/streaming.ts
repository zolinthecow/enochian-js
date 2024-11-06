import ProgramState from '../src/programState.js';

export async function run() {
    const s = await new ProgramState().fromSGL('http://localhost:30000');

    const gen = s
        .add(s.system`You are a helpful assistant.`)
        .add(s.user`Tell me a joke`)
        .add(s.assistant`${s.gen('answer1', { stream: true })}`);
    for await (const chunk of gen) {
        console.log(chunk.content);
    }
    console.log(s.get('answer1'), s.getMetaInfo('answer1'));
}

(async () => {
    await run();
})();
