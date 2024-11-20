import type { Message } from './api.js';
import type ProgramState from './programState.js';

type TrimFunctionArgs = {
    threshold: number;
    numReservedForOutputTokens?: number;
};

// I will test this at some point in time but it is possible that it is unreasonably inefficient to retokenize every single
// time instead of tokenizing per message, then popping messages until it is under the threshold.

export async function isUnderTokenThreshold(
    messages: Message[],
    s: ProgramState,
    args: TrimFunctionArgs,
) {
    const tokenCount = await s.getTokenCount(messages);
    const reservedOutputTokens = !args.numReservedForOutputTokens
        ? 0
        : args.numReservedForOutputTokens;
    return tokenCount + reservedOutputTokens <= args.threshold;
}

export async function trimByRelativePriority(
    messages: Message[],
    s: ProgramState,
    args: TrimFunctionArgs,
) {
    const indexesToRemove = Array.from(
        { length: messages.length },
        (_, i) => i,
    ).sort((a, b) => (messages[a]?.prel ?? 0) - (messages[b]?.prel ?? 0));
    const newMessages = messages;
    let i = 0;
    while (
        newMessages.length &&
        !(await isUnderTokenThreshold(newMessages, s, args))
    ) {
        const indexToRemove = indexesToRemove[i];
        if (indexToRemove === undefined) {
            console.error('The impossible happened');
            return messages;
        }
        newMessages.splice(indexToRemove, 1);
        i++;
    }
    return newMessages;
}

export async function trimFromMiddle(
    messages: Message[],
    s: ProgramState,
    args: TrimFunctionArgs,
) {
    const newMessages = messages;
    while (
        newMessages.length &&
        !(await isUnderTokenThreshold(newMessages, s, args))
    ) {
        newMessages.splice(Math.floor(newMessages.length / 2), 1);
    }
    return newMessages;
}

export async function trimFromOldMessages(
    messages: Message[],
    s: ProgramState,
    args: TrimFunctionArgs,
) {
    const newMessages = messages;
    while (
        newMessages.length &&
        !(await isUnderTokenThreshold(messages, s, args))
    ) {
        newMessages.shift();
    }
    return newMessages;
}
