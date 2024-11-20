import ProgramState from '../src/index.js';

(async () => {
    const s = await new ProgramState().fromSGL('http://localhost:30000');
    await s
        .add(s.system`You are a helpful assistant`, { id: 'a' })
        .add(s.user`Tell me a joke`, { id: 'b' })
        .add(s.assistant`${s.gen('joke')}`, { id: 'c' });
    // LLM Response
    console.log(s.get('joke'));
    // Full message object
    console.log(s.get('a'));
    // Reset
    await s
        .update('b', s.user`Tell me a short story`, undefined, {
            deleteMessagesAfter: true,
        })
        .add(
            s.assistant`${s.gen('story', { sampling_params: { max_new_tokens: 24 } })}`,
            { id: 'd' },
        );
    console.log('---RESET---\n', s.get('story'), s.get('d'));
})();
