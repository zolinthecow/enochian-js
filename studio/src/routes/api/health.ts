import type { APIEvent } from '@solidjs/start/server';

export async function POST(event: APIEvent) {
    return {
        status: 'ALIVE',
    };
}
