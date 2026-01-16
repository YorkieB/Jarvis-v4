import { assertNodeExists, detectCycle } from './policies';
import {
  GraphDefinition,
  GraphPolicies,
  GraphState,
  RunResult,
  TraceEntry,
  NodeResult,
} from './types';

const DEFAULT_POLICIES: GraphPolicies = {
  maxHops: Number(process.env.LANGGRAPH_MAX_HOPS || 25),
  timeoutMs: Number(process.env.LANGGRAPH_STEP_TIMEOUT_MS || 5000),
  allowCycles: false,
};

export class LangGraphEngine {
  private readonly definition: GraphDefinition;
  private readonly policies: GraphPolicies;

  constructor(definition: GraphDefinition, policies: Partial<GraphPolicies> = {}) {
    this.definition = definition;
    this.policies = { ...DEFAULT_POLICIES, ...policies };
    assertNodeExists(definition, definition.start);
  }

  async run(initialState: GraphState): Promise<RunResult> {
    let current = this.definition.start;
    let hops = 0;
    const state: GraphState = { ...initialState };
    const trace: TraceEntry[] = [];
    const visited: string[] = [];

    while (hops < this.policies.maxHops) {
      assertNodeExists(this.definition, current);
      if (!this.policies.allowCycles && detectCycle(visited, current)) {
        throw new Error(`LangGraph detected cycle at node ${current}`);
      }
      visited.push(current);
      hops += 1;

      const started = Date.now();
      try {
        const result = await this.runWithTimeout(this.definition.nodes[current], state, this.policies.timeoutMs);
        const ended = Date.now();
        trace.push({
          node: current,
          startedAt: new Date(started).toISOString(),
          endedAt: new Date(ended).toISOString(),
          durationMs: ended - started,
        });

        Object.assign(state, result.state);
        if (result.done) {
          return { state, trace, hops };
        }
        if (!result.next) {
          throw new Error(`Node ${current} did not specify next or done`);
        }
        current = result.next;
      } catch (error) {
        const ended = Date.now();
        trace.push({
          node: current,
          startedAt: new Date(started).toISOString(),
          endedAt: new Date(ended).toISOString(),
          durationMs: ended - started,
          error: (error as Error).message,
        });
        throw error;
      }
    }

    throw new Error(`LangGraph exceeded max hops (${this.policies.maxHops})`);
  }

  private runWithTimeout(
    node: GraphDefinition['nodes'][string],
    state: GraphState,
    timeoutMs: number,
  ): Promise<NodeResult> {
    return new Promise<NodeResult>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('LangGraph node timeout')), timeoutMs);
      node(state)
        .then((res) => {
          clearTimeout(timer);
          resolve(res);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }
}
