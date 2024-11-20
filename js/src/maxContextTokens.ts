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
    const sortedMessages = messages.sort(
        (a, b) => (a.prel ?? 0) - (b.prel ?? 0),
    );
    while (!(await isUnderTokenThreshold(sortedMessages, s, args))) {
        sortedMessages.pop();
    }
    return sortedMessages;
}

export async function trimFromMiddle(
    messages: Message[],
    s: ProgramState,
    args: TrimFunctionArgs,
) {
    const newMessages = messages;
    while (!(await isUnderTokenThreshold(messages, s, args))) {
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
    while (!(await isUnderTokenThreshold(messages, s, args))) {
        newMessages.shift();
    }
    return newMessages;
}
