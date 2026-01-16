export type GraphState = Record<string, unknown>;

export interface NodeResult {
  state: GraphState;
  next?: string;
  done?: boolean;
}

export type GraphNode = (input: GraphState) => Promise<NodeResult>;

export interface GraphDefinition {
  start: string;
  nodes: Record<string, GraphNode>;
}

export interface GraphPolicies {
  maxHops: number;
  timeoutMs: number;
  allowCycles: boolean;
}

export interface TraceEntry {
  node: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  error?: string;
}

export interface RunResult {
  state: GraphState;
  trace: TraceEntry[];
  hops: number;
}
