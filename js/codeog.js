import ProgramState from 'enochian-js';

function calculatorTool(z) {
    return 5 * z;
}

(async () => {
    const z = process.argv[2];
    const s = await new ProgramState().fromSGL('http://localhost:30000');
    await s
        .add(s.system`You are a helpful assistant.`)
        .add(
            s.user`Calculate the value of 5 * ${z} + 3 and provide only the numerical result.`,
        )
        .add(s.assistant`${s.gen('answer')}`);
    console.log(s.get('answer'));
})();
