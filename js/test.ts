import ProgramState from './programState.js';

(async () => {
    const s = new ProgramState();
    s.setModel('http://10.10.0.164:30000');
    await s.add(s.system`Complete the sentence: `);
    await s.add(s.user`Once upon`);
    await s.add(s.assistant` a time ${s.gen('answer')}`);
    console.log(s.get('answer'));
})();
