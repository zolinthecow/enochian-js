import { z } from "zod";

type Message = { role: "user" | "assistant" | "system"; content: string };

// Special wrapper to carry both the generator function and its type information
type GeneratorWithSchema<K extends string, S> = {
  generator: (
    messages: Message[],
  ) => Promise<string> | AsyncGenerator<string, void, unknown>;
  _schemaType: S; // This is never used at runtime, only for type information
  key: K;
};

type KeySchemaPair<K extends string, S> = { key: K; _schemaType: S };

type MessageWithSchema<
  Gens extends readonly GeneratorWithSchema<string, any>[],
> = {
  message: Message;
  schemas: { [G in Gens[number] as G["key"]]: G["_schemaType"] };
};

type ExtractSchemaTypes<
  Gens extends readonly GeneratorWithSchema<string, any>[],
> = {
  [G in Gens[number] as G["key"]]: G["_schemaType"];
};

class ProgramState<T extends Record<string, any> = {}> {
  private state: T = {} as T;

  // Modified gen to return our wrapper type
  gen<const K extends string, S extends z.ZodType>(
    answerKey: K,
    genInput: { sampling_params: { zod_schema: S } },
  ): GeneratorWithSchema<K, z.infer<S>> {
    return {
      generator: async (messages: Message[]) => {
        // Your actual implementation here
        return "generated content";
      },
      _schemaType: {} as z.infer<S>, // Type-only, not used at runtime
      key: answerKey,
    };
  }

  user(strings: TemplateStringsArray, ...values: any[]): string {
    return String.raw({ raw: strings }, ...values);
  }

  // Modified assistant to work with our wrapper type
  assistant<const Gens extends readonly GeneratorWithSchema<string, any>[]>(
    strings: TemplateStringsArray,
    ...values: [...Gens]
  ): Promise<
    MessageWithSchema<Gens>
    //     ProgramState<
    //   T & {
    //     [G in Gens[number] as G['key']]: G['_schemaType']
    //   }
    // >
  > {
    // Implementation here
    return Promise.resolve(this as any);
  }

  // Type-safe get
  get<K extends keyof T>(key: K): T[K] {
    return this.state[key];
  }

  async add<const Gens extends readonly GeneratorWithSchema<string, any>[]>(
    message: Promise<MessageWithSchema<Gens>>,
  ): Promise<ProgramState<T & ExtractSchemaTypes<Gens>>> {
    return this;
  }
}

// Example usage showing type flow
async function example() {
  const schema = z.object({
    name: z.string(),
    age: z.number(),
  });

  const s = new ProgramState();

  const s2 = await s.add(
    s.assistant`${s.gen("person", {
      sampling_params: { zod_schema: schema },
    })} hi ${s.gen("urmom", { sampling_params: { zod_schema: z.number() } })}`,
  );

  const person = s2.get("person");
  const urmom = s2.get("urmom");
}
