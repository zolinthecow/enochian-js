# EnochianJS

TS/JS library for programming LLM interactions.

## Usage

This is very heavily inspired from [SGLang's](https://github.com/sgl-project/sglang/tree/main) frontend language. I just didn't like their graph execution programming style. This library is intended to allow programmers to code just like how they normally would while giving more control over LLM generations.

To get started you will need an SGLang server running. You can start one on port 30000 like this:

```bash
python -m sglang.launch_server --model-path meta-llama/Meta-Llama-3-8B-Instruct --port 30000
```

To use Enochian, first initialize a `ProgramState`.

```ts
const s = new ProgramState()
```

Then, you can use normal JS control flow to "program" your LLM.

```ts
async function multiTurnQuestion(s: ProgramState, question1: string, question2: string): Promise<[string, string]> {
    await s.setModel('http://localhost:30000');
    await s.add(s.system`You are a helpful assistant.`);
    await s.add(s.user`${question1}`);
    await s.add(s.assistant`${s.gen('answer1')}`);
    await s.add(s.user`${question2}`);
    await s.add(s.assistant`No problem! ${s.gen('answer2')}`);
    return [s.get('answer1'), s.get('answer2')];
}

console.log(await multiTurnQuestion(s, 'Tell me a joke', 'Tell me a better one'));
```
