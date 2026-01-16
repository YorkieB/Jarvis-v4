import { prisma as globalPrisma } from '../../utils/prisma';

type RTuningDataset = Awaited<ReturnType<typeof globalPrisma.rTuningDataset.findFirstOrThrow>>;

export interface TrainingMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface TrainingExample {
  messages: TrainingMessage[];
}

export type TrainingData = TrainingExample[];

export interface TrainingOptions {
  modelName?: string;
  learningRate?: number;
  batchSize?: number;
  epochs?: number;
  loraRank?: number;
  loraAlpha?: number;
  targetModules?: string[];
}

export interface TrainingConfig {
  modelName: string;
  learningRate: number;
  batchSize: number;
  epochs: number;
  loraRank: number;
  loraAlpha: number;
  targetModules: string[];
}

/**
 * RefusalTrainer prepares training data/config for R-Tuning.
 * Actual fine-tuning is expected to run externally (OpenAI or local GPU).
 */
export class RefusalTrainer {
  /**
   * Convert dataset entries into conversation-style training examples.
   */
  prepareTrainingData(dataset: RTuningDataset[]): TrainingData {
    const systemPrompt =
      "You are a helpful AI assistant. If a question cannot be answered, respond with a clear refusal such as \"I don't know.\"";

    return dataset.map<TrainingExample>((item) => ({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: item.question },
        { role: 'assistant', content: item.expectedResponse },
      ],
    }));
  }

  /**
   * Default LoRA-friendly training config, mergeable via options.
   */
  generateTrainingConfig(options: TrainingOptions = {}): TrainingConfig {
    return {
      modelName: options.modelName ?? 'gpt-3.5-turbo',
      learningRate: options.learningRate ?? 3e-4,
      batchSize: options.batchSize ?? 8,
      epochs: options.epochs ?? 3,
      loraRank: options.loraRank ?? 16,
      loraAlpha: options.loraAlpha ?? 32,
      targetModules: options.targetModules ?? ['attention.q_proj', 'attention.v_proj'],
    };
  }

  /**
   * Export dataset to OpenAI fine-tuning JSONL format (string).
   */
  exportForOpenAIFineTuning(dataset: RTuningDataset[]): string {
    const data = this.prepareTrainingData(dataset);
    return data
      .map((example) => JSON.stringify({ messages: example.messages }))
      .join('\n');
  }

  /**
   * Export dataset to a JSON array for local/HF pipelines.
   */
  exportForLocalTraining(dataset: RTuningDataset[]): string {
    const data = this.prepareTrainingData(dataset);
    return JSON.stringify(data, null, 2);
  }

  /**
   * Basic validation to ensure each example contains a refusal.
   */
  validateTrainingData(data: TrainingData): { valid: boolean; issues: string[] } {
    const issues: string[] = [];
    data.forEach((example, idx) => {
      const assistant = example.messages.find((m) => m.role === 'assistant');
      if (!assistant) {
        issues.push(`Example ${idx} missing assistant message`);
        return;
      }
      const text = assistant.content.toLowerCase();
      if (
        !(
          text.includes("i don't know") ||
          text.includes('cannot answer') ||
          text.includes('cannot help')
        )
      ) {
        issues.push(`Example ${idx} assistant message is not a refusal`);
      }
    });

    return { valid: issues.length === 0, issues };
  }
}
