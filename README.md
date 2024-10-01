# SGLang JS

TS/JS frontend for SGLang.

## Usage

I got rid of the tensorflow-like graph execution since I think it's not really how programmers actually program. There's a reason why tensorflow lost. Instead, I envision this to be used in a very js function-like way, like how you would program anything.

First, initialize a `ProgramState`.

```ts
const s = new ProgramState()
```

Then, you can use normal JS control flow to "program" your LLM.

```ts
async function multiTurnQuestion(s: ProgramState, question1: string, question2: string): Promise<[string, string]> {
    s.setModel('http://localhost:8000', 'meta-llama/Llama-3.1-8B-Instruct')
    await s.system`You are a helpful assistant.`;
    await s.user`${question1}`;
    await s.assistant`${s.gen('answer1')}`;
    await s.user`${question2}`;
    await s.assistant`${s.gen('answer2')}`;
    return [s.get('answer1'), s.get('answer2')];
}

console.log(await multiTurnQuestion(s, 'Tell me a joke', 'Tell me a better one'));
```
