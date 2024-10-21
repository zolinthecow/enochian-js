import { expect, test } from 'vitest';

import ProgramState, { OpenAIBackend } from '../src/index.js';

const IP = process.env.SGL_IP;
const port = process.env.SGL_PORT;
const url = `http://${IP}:${port}`;

test('multiturn question', async () => {
    const s = new ProgramState();

    await s.setModel(url);
    await s
        .add(s.system`You are a helpful assistant.`)
        .add(s.user`Tell me a joke`)
        .add(
            s.assistant`${s.gen('answer1', { sampling_params: { temperature: 0 } })}`,
        );
    await s
        .add(s.user`Tell me a better one`)
        .add(
            s.assistant`No problem! ${s.gen('answer2', { sampling_params: { temperature: 0 } })}`,
        );

    const answers = [
        "Here's one:\n" +
            '\n' +
            "Why couldn't the bicycle stand up by itself?\n" +
            '\n' +
            '(Wait for it...)\n' +
            '\n' +
            'Because it was two-tired!\n' +
            '\n' +
            'Hope that made you smile! Do you want to hear another one?',
        " Here's another one:\n" +
            '\n' +
            "Why don't scientists trust atoms?\n" +
            '\n' +
            '(Think about it for a sec...)\n' +
            '\n' +
            'Because they make up everything!\n' +
            '\n' +
            'Hope that one was more to your liking! Do you want to hear another one?',
    ];

    expect(s.get('answer1')).toBe(answers[0]);
    expect(s.get('answer2')).toBe(answers[1]);
});

test('backend swapping', async () => {
    const s = new ProgramState();

    await s.setModel(url);
    await s
        .add(s.system`You are a helpful assistant.`)
        .add(s.user`Tell me a joke`)
        .add(
            s.assistant`${s.gen('answer1', { sampling_params: { temperature: 0 } })}`,
        );

    s.setBackend(
        new OpenAIBackend({ apiKey: process.env.OPENAI_KEY }),
    ).setModel({ modelName: 'gpt-4o' });

    await s
        .add(s.user`Tell me a better one`)
        .add(s.assistant`No problem! ${s.gen('answer2')}`);

    const answer1 =
        "Here's one:\n" +
        '\n' +
        "Why couldn't the bicycle stand up by itself?\n" +
        '\n' +
        '(Wait for it...)\n' +
        '\n' +
        'Because it was two-tired!\n' +
        '\n' +
        'Hope that made you smile! Do you want to hear another one?';
    expect(s.get('answer1')).toBe(answer1);
    // Can't really control openai deterministically, so as long as it didn't crash I'm fine with it
    expect(s.get('answer2')).toBeDefined();
});

test('choices', async () => {
    const s = new ProgramState();

    await s.setModel(url);
    await s
        .add(s.system`You are an animal.`)
        .add(s.user`What are you?`)
        .add(
            s.assistant`I am a ${s.gen('answer', { choices: ['hippopotamus', 'giraffe'] })}`,
        );

    expect(s.get('answer')).toBe('giraffe');
});

test('forking', async () => {
    const s = new ProgramState();
    await s.setModel(url);

    s.add(s.system`You are a helpful assistant.`)
        .add(s.user`How can I stay healthy?`)
        .add(s.assistant`Here are two tips for staying healthy:
            1. Balanced Diet. 2. Regular Exercise.\n\n`);

    const forks = s.fork(2);
    await Promise.all(
        forks.map((f, i) =>
            f
                .add(
                    f.user`Now, expand tip ${(i + 1).toString()} into a paragraph.`,
                )
                .add(
                    f.assistant`${f.gen('detailed_tip', { sampling_params: { max_new_tokens: 256, temperature: 0 } })}`,
                ),
        ),
    );

    await s
        .add(s.user`Please expand.`)
        .add(s.assistant`Tip 1: ${forks[0]?.get('detailed_tip') ?? ''}
            Tip 2: ${forks[1]?.get('detailed_tip') ?? ''}
            In summary, ${s.gen('summary', { sampling_params: { temperature: 0 } })}`);

    const answers = [
        "A balanced diet is essential for maintaining overall health and well-being. Eating a variety of nutrient-rich foods, including fruits, vegetables, whole grains, lean proteins, and healthy fats, can help support your body's functions and reduce the risk of chronic diseases. Aim to include a rainbow of colors on your plate to ensure you're getting a range of vitamins and minerals. Focus on whole, unprocessed foods as much as possible, and limit your intake of sugary drinks, refined carbohydrates, and saturated fats. Additionally, stay hydrated by drinking plenty of water throughout the day. A balanced diet can also help support a healthy weight, boost your energy levels, and even improve your mood. By making informed food choices, you can take a significant step towards maintaining your overall health and well-being.",
        "Regular Exercise! Engaging in regular physical activity is one of the most effective ways to maintain overall health and well-being. Exercise not only helps to burn calories and manage weight, but it also strengthens your heart and lungs, improves sleep quality, and boosts your mood. Aim for at least 150 minutes of moderate-intensity aerobic exercise, or 75 minutes of vigorous-intensity aerobic exercise, or a combination of both, per week. You can also incorporate strength-training exercises into your routine, targeting all major muscle groups at least two times a week. Additionally, consider incorporating high-intensity interval training (HIIT) for an extra calorie-burning boost. Remember to listen to your body and start slowly, especially if you're new to exercise. It's also essential to find activities you enjoy, whether it's walking, running, swimming, cycling, or dancing, so you'll be more likely to stick with it.",
        '1. Eat a balanced diet with a variety of nutrient-rich foods, and 2. Engage in regular exercise, such as aerobic exercise, strength-training, and high-intensity interval training.',
    ];

    expect(forks[0]?.get('detailed_tip')).toBe(answers[0]);
    expect(forks[1]?.get('detailed_tip')).toBe(answers[1]);
    expect(s?.get('summary')).toBe(answers[2]);
});

test('streaming', async () => {
    const s = new ProgramState();

    await s.setModel(url);
    const gen = s
        .add(s.system`You are a helpful assistant.`)
        .add(s.user`Tell me a joke`)
        .add(
            s.assistant`${s.gen('answer1', { stream: true, sampling_params: { temperature: 0 } })}`,
        );
    for await (const chunk of gen) {
        expect(typeof chunk.content).toBe('string');
    }

    const answer1 =
        "Here's one:\n" +
        '\n' +
        "Why couldn't the bicycle stand up by itself?\n" +
        '\n' +
        '(Wait for it...)\n' +
        '\n' +
        'Because it was two-tired!\n' +
        '\n' +
        'Hope that made you smile! Do you want to hear another one?';
    expect(s.get('answer1')).toBe(answer1);
});
