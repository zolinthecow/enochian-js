import ProgramState from './programState.js';

(async () => {
    console.log('HELLO');
    const s = new ProgramState();
    s.setModel('http://10.10.0.164:30000');
    await s.add(s.system`Complete the sentence: `);
    await s.add(s.user`Once upon a time `);
    console.log('BEF GEN');
    await s.add(s.assistant`${s.gen('answer')}`);
    console.log(s.get('answer'));
})();
