import { BaseAgent } from '../base-agent';
import OpenAI from 'openai';

export class DialogueAgent extends BaseAgent {
  protected agentType = 'dialogue';
  protected permissions = ['read:conversations', 'write:conversations'];

  private openai: OpenAI;
  private conversationHistory: Map<string, any[]> = new Map();

  constructor() {
    super();
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async generateResponse(input: string, sessionId: string): Promise<string> {
    // Get conversation history
    const history = this.conversationHistory.get(sessionId) || [];

    // Add user message
    history.push({ role: 'user', content: input });

    // RULE 2: Grounding in context (conversation history)
    const response = await this.callLLM(input, {
      context: history,
    });

    // Call OpenAI with full context
    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are Jarvis, a helpful AI assistant.' },
        ...history,
      ],
    });

    const assistantMessage = completion.choices[0].message.content!;

    // Update history
    history.push({ role: 'assistant', content: assistantMessage });
    this.conversationHistory.set(sessionId, history);

    // TODO: Store in database

    return assistantMessage;
  }
}
