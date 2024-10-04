import ProgramState from './programState.js';

(async () => {
    const s = new ProgramState();
    await s.setModel('http://10.10.0.164:30000');
    await s.add(s.system`You are a helpful assistant.`);
    await s.add(s.user`Tell me a story`);
    await s.add(s.assistant`Once upon a time, ${s.gen('answer')}`);
    console.log(s.get('answer'));
})();
