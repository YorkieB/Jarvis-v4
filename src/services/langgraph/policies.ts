import { GraphDefinition } from './types';

export function assertNodeExists(def: GraphDefinition, node: string): void {
  if (!def.nodes[node]) {
    throw new Error(`Graph node not found: ${node}`);
  }
}

export function detectCycle(path: string[], next: string): boolean {
  return path.includes(next);
}
