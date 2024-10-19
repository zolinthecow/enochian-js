import { Title } from '@solidjs/meta';
import {
    For,
    Show,
    createEffect,
    createMemo,
    createSignal,
    onCleanup,
} from 'solid-js';
import { Button } from '~/components/ui/button';
import {
    Tabs,
    TabsContent,
    TabsIndicator,
    TabsList,
    TabsTrigger,
} from '~/components/ui/tabs';
import { trpc } from '~/lib/api';
import type { ParsedPrompt } from '~/lib/db';

type PromptTypeListProps = {
    promptTypes: string[];
    onSelectType: (type: string) => void;
};
function PromptTypeList(props: PromptTypeListProps) {
    return (
        <div class="h-full w-48 rounded-md border p-4">
            <h3 class="mb-4 text-lg font-semibold">Prompt Types</h3>
            <For each={props.promptTypes}>
                {(type) => (
                    <Button
                        variant="ghost"
                        class="block w-full text-left px-2 py-1"
                        on:click={() => props.onSelectType(type)}
                    >
                        {type}
                    </Button>
                )}
            </For>
        </div>
    );
}

type PromptListProps = {
    prompts: ParsedPrompt[];
    onSelectPrompt: (id: string) => void;
};
function PromptList(props: PromptListProps) {
    return (
        <div class="h-full w-full rounded-md border flex flex-col">
            <For each={props.prompts}>
                {(prompt) => (
                    <Button
                        variant="ghost"
                        class="h-16 p-2 mb-2 flex flex-col align-start justify-start text-start"
                        on:click={() => props.onSelectPrompt(prompt.id)}
                    >
                        <p class="font-semibold">
                            {prompt.requests[0]?.requestPrompt.substring(
                                0,
                                50,
                            ) ?? ''}
                            ...
                        </p>
                        <p class="text-sm text-muted-foreground">
                            {new Date(prompt.createdAt).toLocaleString()}
                        </p>
                    </Button>
                )}
            </For>
        </div>
    );
}

type PromptDetailsProps = {
    prompt: ParsedPrompt;
};
function PromptDetails(props: PromptDetailsProps) {
    console.log(props.prompt);
    return (
        <div class="p-4 border rounded text-wrap max-w-full">
            <h3 class="text-lg font-semibold mb-2">Prompt Details</h3>
            <For each={props.prompt.requests}>
                {(request) => (
                    <div class="p-2 border rounded my-2 text-wrap break-words overflow-hidden">
                        <p>
                            <strong class="underline">Request Prompt</strong>
                            <br />
                            {request.requestPrompt}
                        </p>
                        <p>
                            <strong class="underline">Request Metadata</strong>
                            <br />
                            {JSON.stringify(request.requestMetadata)}
                        </p>
                        <p>
                            <strong>Timestamp:</strong>{' '}
                            {new Date(
                                request.requestTimestamp,
                            ).toLocaleString()}
                        </p>
                        <div class="h-4" />
                        <Show
                            when={
                                request.responseContent !== undefined &&
                                request.responseMetadata !== undefined &&
                                request.responseTimestamp !== undefined
                            }
                        >
                            <p>
                                <strong class="underline">
                                    Response Content
                                </strong>
                                <br />
                                {request.responseContent}
                            </p>
                            <p>
                                <strong class="underline">
                                    Response Metadata
                                </strong>
                                <br />
                                {JSON.stringify(request.responseMetadata)}
                            </p>
                            <p>
                                <strong>Timestamp:</strong>{' '}
                                {new Date(
                                    request.responseTimestamp as string,
                                ).toLocaleString()}
                            </p>
                        </Show>
                    </div>
                )}
            </For>
        </div>
    );
}

export default function Home() {
    const [allPromptTypes, setAllPromptTypes] = createSignal<string[]>([]);
    const [allPrompts, setAllPrompts] = createSignal<ParsedPrompt[]>([]);
    createEffect(() => {
        const promptsSubscription = trpc.prompt.listenPrompts.subscribe(
            undefined,
            {
                onData: (newPrompts) => {
                    setAllPrompts(newPrompts);
                },
                onError: (err) => {
                    console.error('Error in prompts subscription:', err);
                },
            },
        );
        const promptTypesSubscription = trpc.prompt.listenPromptTypes.subscribe(
            undefined,
            {
                onData: (newPromptTypes) => {
                    setAllPromptTypes(newPromptTypes.map((pt) => pt.type));
                },
                onError: (err) => {
                    console.error('Error in promptTypes subscription:', err);
                },
            },
        );
        onCleanup(() => {
            promptTypesSubscription.unsubscribe();
            promptsSubscription.unsubscribe();
        });
    });

    const [selectedType, setSelectedType] = createSignal<string | null>(null);
    const [selectedPrompt, setSelectedPrompt] =
        createSignal<ParsedPrompt | null>(null);
    const [selectedTab, setSelectedTab] = createSignal<'prompts' | 'details'>(
        'prompts',
    );

    const onSelectType = (type: string): void => {
        if (type !== selectedType()) {
            setSelectedTab('prompts');
        }
        setSelectedType(type);
    };

    const onSelectPrompt = (id: string): void => {
        setSelectedPrompt(allPrompts().find((p) => p.id === id) ?? null);
        setSelectedTab('details');
    };

    const filteredPrompts = createMemo(() =>
        allPrompts().filter((p) => p.type === selectedType()),
    );

    return (
        <main>
            <Title>Prompt Studio</Title>
            <div class="container p-4">
                <h1 class="text-2xl font-bold mb-4">Prompt Studio</h1>
                <div class="grid grid-cols-[220px_minmax(0,1fr)] gap-4">
                    <PromptTypeList
                        promptTypes={allPromptTypes()}
                        onSelectType={onSelectType}
                    />
                    <div class="flex-1">
                        <Tabs
                            value={selectedTab()}
                            onChange={setSelectedTab}
                            class="w-full"
                        >
                            <TabsList class="gap-2">
                                <TabsTrigger value="prompts">
                                    Prompts
                                </TabsTrigger>
                                <TabsTrigger value="details">
                                    Details
                                </TabsTrigger>
                                <TabsIndicator />
                            </TabsList>
                            <TabsContent value="prompts">
                                <PromptList
                                    prompts={filteredPrompts()}
                                    onSelectPrompt={onSelectPrompt}
                                />
                            </TabsContent>
                            <TabsContent value="details">
                                <Show
                                    when={selectedPrompt()}
                                    fallback={
                                        <p>Select a prompt to view details</p>
                                    }
                                >
                                    {(prompt) => (
                                        <PromptDetails prompt={prompt()} />
                                    )}
                                </Show>
                            </TabsContent>
                        </Tabs>
                    </div>
                </div>
            </div>
        </main>
    );
}
