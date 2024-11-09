import { spawn } from 'node:child_process';
import fs from 'node:fs';
import ProgramState, { createTools } from 'enochian-js/src/index.js';
import { z } from 'zod';

function getSystemPrompt() {
    let systemPrompt =
        'You are an expert prompt engineer and also an ' +
        'expert in using the new javascript/typescript library ' +
        'enochian. Here are the docs for enochian.\n\n' +
        '---BEGIN ENOCHIAN DOCS---\n';
    const introductionContent = fs.readFileSync(
        '../../../docs/introduction/introduction.mdx',
        'utf-8',
    );
    const quickstartContent = fs.readFileSync(
        '../../../docs/introduction/quickstart.mdx',
        'utf-8',
    );
    const examplesContent = fs.readFileSync(
        '../../../docs/introduction/examples.mdx',
        'utf-8',
    );
    const backendsContent = fs.readFileSync(
        '../../../docs/api-reference/backends.mdx',
        'utf-8',
    );
    const programStateContent = fs.readFileSync(
        '../../../docs/api-reference/program-state.mdx',
        'utf-8',
    );
    const requestTypesContent = fs.readFileSync(
        '../../../docs/api-reference/request-types.mdx',
        'utf-8',
    );
    systemPrompt +=
        `introduction/introduction:\n${introductionContent}\n\n` +
        `introduction/quickstart:\n${quickstartContent}\n\n` +
        `introduction/examples\n${examplesContent}\n\n` +
        `api-reference/program-state\n${programStateContent}\n\n` +
        `api-reference/backends\n${backendsContent}\n\n` +
        `api-reference/request-types\n${requestTypesContent}\n` +
        '---END ENOCHIAN DOCS---';

    systemPrompt +=
        'Since you are a prompt engineering and enochian expert, your ' +
        'colleague has asked you to help them write a javascript ' +
        'program that uses enochian to program an LLM workflow. ' +
        'You should use tools when you can since they are very powerful.';

    return systemPrompt;
}

function readJsFile() {
    return fs.readFileSync('code.js', 'utf-8');
}

const WriteJsFileSchema = z.object({
    newJSCode: z.string(),
});
function writeJsFile(args: z.infer<typeof WriteJsFileSchema>) {
    fs.writeFileSync('code.js', args.newJSCode);
    return 'wrote to file.';
}

const RunJsFileAndCaptureOutputSchema = z.object({
    args: z.string(),
});
async function runJsFileAndCaptureOutput(
    args: z.infer<typeof RunJsFileAndCaptureOutputSchema>,
) {
    const nodeProcess = spawn('node', ['code.js', args.args]);
    let output = '';
    for await (const chunk of nodeProcess.stdout) {
        output += chunk;
    }
    let errorOutput = '';
    for await (const chunk of nodeProcess.stderr) {
        errorOutput += chunk;
    }

    const exitCode = await new Promise((resolve) =>
        nodeProcess.on('close', resolve),
    );

    return {
        output,
        errorOutput,
    };
}

async function testFile() {
    const inputs = [1, 2, 3] as const;
    const answers = [8, 13, 18] as const;

    let success = true;
    const outputs = [];
    for (let i = 0; i < inputs.length; i++) {
        const res = await runJsFileAndCaptureOutput({
            // biome-ignore lint/style/noNonNullAssertion: whatevs
            args: inputs[i]!.toString(),
        });
        if (Number.parseInt(res.output) !== answers[i]) {
            success = false;
        }
        outputs.push(res);
    }
    if (success) {
        return { status: true };
    } else {
        return { status: false, outputs };
    }
}

const tools = createTools([
    {
        function: readJsFile,
        name: 'readJsFile',
        description: 'Read the contents of the JS file you are working on.',
    },
    {
        function: writeJsFile,
        name: 'writeJsFile',
        description:
            'Replace the contents of the JS file you are working on with new code. The code passed in will overwrite the contents of the file.',
        params: WriteJsFileSchema,
    },
    {
        function: runJsFileAndCaptureOutput,
        name: 'runJsFileAndCaptureOutput',
        description:
            'Run the JS file you are currently working on and capture the output. You can optionally pass in additional arguments to it that will be forwarded to the JS file as argv',
        params: RunJsFileAndCaptureOutputSchema,
    },
    {
        function: testFile,
        name: 'runTests',
        description:
            'Test your code for correctness. It will return status true if the code is correct. If the code is not correct, it will return status false and also the output.',
    },
]);

(async () => {
    const s = new ProgramState().fromOpenAI({ modelName: 'gpt-4o' });

    s.add(s.system`${getSystemPrompt()}`)
        .add(
            s.user`Please help me write a javascript file using enochian that creates an LLM workflow that can calculate the value of $5z+3$ for an arbitrary z.`,
        )
        .add(
            s.user`Here is the current state of my JS file. I haven't gotten very far unfortuanetly:\n---BEGIN JS FILE---\n${readJsFile()}\n---END JS FILE---\n`,
        )
        .add(
            s.user`Please help me write this file. Take as much time and as many tries as you need until the file is correct. I encourage you to use the functions available to you to test it out. The file is correct if and only if it passes the "runTests" tool. Let me know when you're done by saying "ACK"`,
        );
    let i = 0;
    while (true) {
        await s.add(
            s.assistant`${s.gen('action', { tools, sampling_params: { max_new_tokens: 1024, temperature: 0 } })}`,
        );
        const action = s.get('action', { from: 'tools', tools });
        if (!action) {
            console.error(`No tool was used: ${action}`);
            return;
        }
        console.log(`Step ${i}:`, action);
        i++;
        const responseToUser = action.find(
            (a) => a.toolUsed === 'respondToUser',
        );
        if (responseToUser) {
            console.log('FINISHED!');
            console.log(responseToUser.response);
            return;
        }
        for (const toolUsed of action) {
            s.add(
                s.user`${toolUsed.toolUsed} Result: ${JSON.stringify(toolUsed.response)}`,
            );
        }
    }
})();
