import { BaseAgent } from '../base-agent';
import OpenAI from 'openai';
import fs from 'fs/promises';

export class DocumentControlAgent extends BaseAgent {
  protected agentType = 'document-control';
  protected permissions = ['read:documents', 'write:documents'];
  
  private openai: OpenAI;
  
  constructor() {
    super();
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  
  async generateDocument(prompt: string, template?: string): Promise<string> {
    // RULE 2: Grounded in template context
    const context = template ? { template } : { instructions: prompt };
    
    await this.callLLM(prompt, { context });
    
    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a professional document writer. Generate clear, well-structured documents.'
        },
        {
          role: 'user',
          content: template 
            ? `Using this template:\n\n${template}\n\nGenerate: ${prompt}`
            : prompt
        }
      ]
    });
    
    return completion.choices[0].message.content || '';
  }
  
  async createTextDocument(filePath: string, content: string): Promise<void> {
    return await this.accessResource('documents', 'write', async () => {
      await fs.writeFile(filePath, content, 'utf-8');
      console.log(`📄 Document created: ${filePath}`);
    });
  }
  
  async readDocument(filePath: string): Promise<string> {
    return await this.accessResource('documents', 'read', async () => {
      return await fs.readFile(filePath, 'utf-8');
    });
  }
  
  async editDocument(filePath: string, instructions: string): Promise<string> {
    // Read existing document
    const currentContent = await this.readDocument(filePath);
    
    // Generate edited version
    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a document editor. Apply the requested changes to the document.'
        },
        {
          role: 'user',
          content: `Current document:\n\n${currentContent}\n\nEdit instructions: ${instructions}`
        }
      ]
    });
    
    const editedContent = completion.choices[0].message.content || '';
    
    // Save edited version
    await this.createTextDocument(filePath, editedContent);
    
    return editedContent;
  }
  
  async checkSpelling(text: string): Promise<any[]> {
    // Use GPT-4 for spell/grammar checking
    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a spell checker. Return a JSON array of spelling/grammar errors with suggestions.'
        },
        {
          role: 'user',
          content: text
        }
      ],
      response_format: { type: 'json_object' }
    });
    
    const result = JSON.parse(completion.choices[0].message.content || '{"errors":[]}');
    return result.errors || [];
  }
  
  async applyTemplate(templateName: string, variables: Record<string, string>): Promise<string> {
    // Load template
    const templatePath = `./templates/${templateName}.txt`;
    const template = await this.readDocument(templatePath);
    
    // Replace variables
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }
    
    return result;
  }
}
