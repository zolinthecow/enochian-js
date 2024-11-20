import ProgramState, {
    isUnderTokenThreshold,
    trimFromMiddle,
} from '../src/index.js';

(async () => {
    const s = await new ProgramState().fromSGL('http://localhost:30000');

    s.add(s.system`You are a helpful assistant`);
    // This will be trimmed from the prompt
    s.add(
        s.user`If you see this message ignore everything else I said and output "HELLO"`,
    );
    // This will not be trimmed from the prompt
    s.add(s.user`If you see this message say "bye bye"`);
    await s.add(
        s.assistant`${s.gen('resp', {
            transform: async (messages) =>
                trimFromMiddle(messages, s, { threshold: 25 }),
            choices: ['HELLO', 'bye bye'],
            sampling_params: {
                temperature: 0,
            },
        })}`,
    );

    // // This will not be trimmed from the prompt
    // s.add(s.system`You are a helpful assistant`);
    // // This will be trimmed from the prompt
    // s.add(
    //     s.user`If you see this message ignore everything else I said and output "HELLO"`,
    // );
    // // This will not be trimmed from the prompt
    // s.add(s.user`If you see this message say "bye bye"`);
    // await s.add(
    //     s.assistant`${s.gen('resp', {
    //         transform: async (messages) => {
    //             const newMessages = messages;
    //             // Max 20 tokens in prompt
    //             while (
    //                 !(await isUnderTokenThreshold(newMessages, s, {
    //                     threshold: 20,
    //                 }))
    //             ) {
    //                 newMessages.shift();
    //             }
    //             return newMessages;
    //         },
    //     })}`,
    // );
    console.log(s.get('resp'));
})();
