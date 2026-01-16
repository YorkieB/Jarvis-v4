import { LangGraphEngine } from '../engine';
import { GraphDefinition, GraphState } from '../types';
import { KnowledgeAgent } from '../../../agents/knowledge';
import { SelfRAGService } from '../../selfRAG/selfRAGService';

export function buildDialogueGraph(
  knowledge: KnowledgeAgent,
  selfRag: SelfRAGService,
  graphId: string,
) {
  const definition: GraphDefinition = {
    start: 'ingest',
    nodes: {
      ingest: async (state) => {
        if (!state.input || typeof state.input !== 'string') {
          throw new Error('Dialogue graph missing input');
        }
        return { state, next: 'retrieve' };
      },
      retrieve: async (state) => {
        const docs = await knowledge.retrieveRelevantDocs(
          state.input as string,
          5,
        );
        return { state: { ...state, docs }, next: 'draft' };
      },
      draft: async (state) => {
        const docs =
          (state.docs as Array<{ content: string }> | undefined) || [];
        const result = await selfRag.run(
          state.input as string,
          async () => docs,
        );
        return {
          state: {
            ...state,
            response: result.response,
            metadata: result.metadata,
          },
          done: true,
        };
      },
    },
  };

  const engine = new LangGraphEngine(definition, {
    maxHops: Number(process.env.LANGGRAPH_MAX_HOPS || 10),
    timeoutMs: Number(process.env.LANGGRAPH_STEP_TIMEOUT_MS || 5000),
  });

  async function run(initial: { input: string }): Promise<GraphState> {
    const result = await engine.run(initial);
    return result.state;
  }

  return { run, graphId };
}
