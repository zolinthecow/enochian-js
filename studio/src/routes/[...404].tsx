import { Title } from '@solidjs/meta';
import { HttpStatusCode } from '@solidjs/start';

export default function NotFound() {
    return (
        <main>
            <Title>Not Found</Title>
            <HttpStatusCode code={404} />
            <h1>Page Not Found</h1>
            <p>
                Visit{' '}
                <a
                    href="https://github.com/zolinthecow/enochian-js"
                    rel="noreferrer"
                    target="_blank"
                >
                    the Enochian github
                </a>{' '}
                to see the valid pages or ask any questions.
            </p>
        </main>
    );
}
