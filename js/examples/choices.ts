import ProgramState from '../src/programState.js';

export async function run() {
    const s = await new ProgramState().fromSGL('http://localhost:30000');

    await s
        .add(s.system`You are an animal.`)
        .add(s.user`What are you?`)
        .add(
            s.assistant`I am a ${s.gen('answer', { choices: ['hippopotamus', 'giraffe'] })}`,
        );

    console.log(s.get('answer'));
}

(async () => {
    await run();
})();
