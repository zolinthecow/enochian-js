# EnochianJS

TS/JS library for programming LLM interactions. Read the docs [here](https://zolinthecow.mintlify.app/introduction/introduction)!

## File Structure

```
docs/
js/
    src/
    examples/
studio/
sglang/
```

The `docs/` directory contains mintlify docs.
The `js/` directory contains the `enochian-js` library. You can find the source code in `js/src/` and examples of how to use it in `js/examples/`.
The `studio/` directory contains the `enochian-studio` library.
The `sglang/` directory is a submodule with the latest version of `sglang` Enochian is tested against.

## Usage

To get started you will either need an OpenAI server or an SGLang server. You can an SGLang server on port 30000 like this:

```bash
python -m sglang.launch_server --model-path meta-llama/Meta-Llama-3-8B-Instruct --port 30000
```

Then install Enochian.

```bash
pnpm i enochian-js enochian-studio
```

To use Enochian, first initialize a `ProgramState`.

```ts
const s = new ProgramState()
```

Then, you can use normal JS control flow to "program" your LLM.


```ts
async function multiTurnQuestion(s: ProgramState, question1: string, question2: string): Promise<[string, string]> {
    await s.setModel('http://localhost:30000');
    await s.add(s.system`You are a helpful assistant.`)
        .add(s.user`${question1}`);
        .add(s.assistant`${s.gen('answer1')}`);
    await s.add(s.user`${question2}`)
        .add(s.assistant`No problem! ${s.gen('answer2')}`)
    return [s.get('answer1'), s.get('answer2')];
}

console.log(await multiTurnQuestion(s, 'Tell me a joke', 'Tell me a better one'));
```
