import ProgramState from '../src/programState.js';

export async function run() {
    const s = new ProgramState();

    await s.setModel('http://localhost:30000');
    const gen = s
        .add(s.system`You are a helpful assistant.`)
        .add(s.user`Tell me a joke`)
        .add(
            s.assistant`${s.gen('answer1', { stream: true, sampling_params: {} })}`,
        );
    for await (const chunk of gen) {
        console.log(chunk.content);
    }
    console.log(s.get('answer1'));
}

(async () => {
    await run();
})();
