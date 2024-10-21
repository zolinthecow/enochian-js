import ProgramState from '../src/programState.js';

export async function run() {
    const s = new ProgramState();

    async function multiTurnQuestion(
        s: ProgramState,
        question1: string,
        question2: string,
    ): Promise<[string | undefined, string | undefined]> {
        await s.setModel('http://localhost:30000');

        // The requests sent inside the debug region will be logged and grouped under the debugName provided
        s.beginDebugRegion({ debugName: 'multiTurnQuestion' });
        await s
            .add(s.system`You are a helpful assistant.`)
            .add(s.user`${question1}`)
            .add(s.assistant`${s.gen('answer1')}`);
        await s
            .add(s.user`${question2}`)
            .add(s.assistant`No problem! ${s.gen('answer2')}`);
        s.endDebugRegion();

        return [s.get('answer1'), s.get('answer2')];
    }

    console.log(
        await multiTurnQuestion(s, 'Tell me a joke', 'Tell me a better one'),
    );
}

(async () => {
    await run();
})();
