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
        .set('b', s.user`Tell me a short story`, {
            deleteMessagesAfter: true,
        })
        .add(s.assistant`${s.gen('story')}`, { id: 'd' });
    console.log(s.get('story'), s.get('d'));
})();
