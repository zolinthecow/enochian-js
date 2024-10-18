import { Title } from '@solidjs/meta';
import { For, Show, createMemo, createSignal } from 'solid-js';
import { Button } from '~/components/ui/button';
import {
    Tabs,
    TabsContent,
    TabsIndicator,
    TabsList,
    TabsTrigger,
} from '~/components/ui/tabs';

// Mock data
const mockPromptTypes = [
    'Docs Query',
    'Joke telling',
    'Code completion',
    'Story writing',
    'Data analysis',
];
const mockPrompts = [
    {
        id: 1,
        type: 'Docs Query',
        content: 'How do I use React hooks?',
        output: 'React hooks are...',
        timestamp: new Date('2023-05-01T10:00:00'),
        tokensUsed: 150,
    },
    {
        id: 2,
        type: 'Joke telling',
        content: 'Tell me a joke about programming',
        output: 'Why do programmers prefer dark mode? Because light attracts bugs!',
        timestamp: new Date('2023-05-02T11:30:00'),
        tokensUsed: 80,
    },
    {
        id: 3,
        type: 'Code completion',
        content: 'Complete this function: def fibonacci(n):',
        output: 'def fibonacci(n):\n    if n <= 1:\n        return n\n    else:\n        return fibonacci(n-1) + fibonacci(n-2)',
        timestamp: new Date('2023-05-03T14:15:00'),
        tokensUsed: 200,
    },
];

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

type Prompt = {
    id: number;
    type: string;
    content: string;
    output: string;
    timestamp: Date;
    tokensUsed: number;
};
type PromptListProps = {
    prompts: Prompt[];
    onSelectPrompt: (id: number) => void;
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
                            {prompt.content.substring(0, 50)}...
                        </p>
                        <p class="text-sm text-muted-foreground">
                            {prompt.timestamp.toLocaleString()}
                        </p>
                    </Button>
                )}
            </For>
        </div>
    );
}

type PromptDetailsProps = {
    prompt: Prompt;
};
function PromptDetails(props: PromptDetailsProps) {
    const prompt = props.prompt;

    return (
        <div class="p-4 border rounded">
            <h3 class="text-lg font-semibold mb-2">Prompt Details</h3>
            <p>
                <strong>Content:</strong> {prompt.content}
            </p>
            <p>
                <strong>Output:</strong> {prompt.output}
            </p>
            <p>
                <strong>Timestamp:</strong> {prompt.timestamp.toLocaleString()}
            </p>
            <p>
                <strong>Tokens Used:</strong> {prompt.tokensUsed}
            </p>
        </div>
    );
}

export default function Home() {
    const [selectedType, setSelectedType] = createSignal<string>(
        mockPromptTypes[0],
    );
    const [selectedPrompt, setSelectedPrompt] = createSignal<Prompt | null>(
        null,
    );
    const [selectedTab, setSelectedTab] = createSignal<'prompts' | 'details'>(
        'prompts',
    );

    const onSelectType = (type: string): void => {
        console.log('SELECT TYPE', type);
        setSelectedType(type);
    };

    const onSelectPrompt = (id: number): void => {
        setSelectedPrompt(mockPrompts.find((p) => p.id === id) ?? null);
        setSelectedTab('details');
    };

    const filteredPrompts = createMemo(() =>
        mockPrompts.filter((p) => p.type === selectedType()),
    );

    return (
        <main>
            <Title>Prompt Studio</Title>
            <div class="container p-4">
                <h1 class="text-2xl font-bold mb-4">Prompt Studio</h1>
                <div class="flex gap-4">
                    <PromptTypeList
                        promptTypes={mockPromptTypes}
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
