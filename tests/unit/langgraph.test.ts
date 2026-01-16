import { LangGraphEngine } from '../../src/services/langgraph/engine';
import { GraphDefinition } from '../../src/services/langgraph/types';

describe('LangGraphEngine', () => {
  it('runs linear graph within hop limit', async () => {
    const definition: GraphDefinition = {
      start: 'a',
      nodes: {
        a: async (state) => ({ state: { ...state, a: true }, next: 'b' }),
        b: async (state) => ({ state: { ...state, b: true }, done: true }),
      },
    };
    const engine = new LangGraphEngine(definition, {
      maxHops: 5,
      timeoutMs: 1000,
    });
    const result = await engine.run({});
    expect(result.state.a).toBe(true);
    expect(result.state.b).toBe(true);
    expect(result.hops).toBe(2);
  });

  it('throws on cycle when not allowed', async () => {
    const definition: GraphDefinition = {
      start: 'loop',
      nodes: {
        loop: async (state) => ({ state, next: 'loop' }),
      },
    };
    const engine = new LangGraphEngine(definition, {
      maxHops: 3,
      allowCycles: false,
      timeoutMs: 500,
    });
    await expect(engine.run({})).rejects.toThrow(/cycle/);
  });

  it('respects timeout per node', async () => {
    const definition: GraphDefinition = {
      start: 'slow',
      nodes: {
        slow: async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return { state: {}, done: true };
        },
      },
    };
    const engine = new LangGraphEngine(definition, { timeoutMs: 10 });
    await expect(engine.run({})).rejects.toThrow(/timeout/);
  });

  it('allows cycles when enabled but still enforces max hops', async () => {
    const definition: GraphDefinition = {
      start: 'loop',
      nodes: {
        loop: async (state) => ({
          state: {
            ...state,
            count: (state.count as number | undefined) ?? 0 + 1,
          },
          next: 'loop',
        }),
      },
    };
    const engine = new LangGraphEngine(definition, {
      maxHops: 3,
      allowCycles: true,
      timeoutMs: 500,
    });
    await expect(engine.run({})).rejects.toThrow(/max hops/);
  });

  it('returns trace entries for each hop before completion', async () => {
    const definition: GraphDefinition = {
      start: 'a',
      nodes: {
        a: async (state) => ({ state: { ...state, a: true }, next: 'b' }),
        b: async (state) => ({ state: { ...state, b: true }, done: true }),
      },
    };
    const engine = new LangGraphEngine(definition, {
      maxHops: 5,
      timeoutMs: 1000,
    });
    const result = await engine.run({});
    expect(result.trace).toHaveLength(2);
    expect(result.trace[0].node).toBe('a');
    expect(result.trace[1].node).toBe('b');
  });
});
