import ProgramState from '../src/programState.js';

export async function run() {
    const s = new ProgramState();
    await s.setModel('http://localhost:30000');

    s.add(s.system`You are a helpful assistant.`)
        .add(s.user`How can I stay healthy?`)
        .add(s.assistant`Here are two tips for staying healthy:
            1. Balanced Diet. 2. Regular Exercise.\n\n`);

    const forks = s.fork(2);
    await Promise.all(
        forks.map((f, i) =>
            f
                .add(
                    f.user`Now, expand tip ${(i + 1).toString()} into a paragraph.`,
                )
                .add(
                    f.assistant`${f.gen('detailed_tip', { sampling_params: { max_new_tokens: 256 } })}`,
                ),
        ),
    );

    await s
        .add(s.user`Please expand.`)
        .add(s.assistant`Tip 1: ${forks[0]?.get('detailed_tip') ?? ''}
            Tip 2: ${forks[1]?.get('detailed_tip') ?? ''}
            In summary, ${s.gen('summary')}`);

    console.log(s.get('summary'));
}

(async () => {
    await run();
})();
