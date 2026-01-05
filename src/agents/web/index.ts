import { BaseAgent } from '../base-agent';

export class WebAgent extends BaseAgent {
  protected agentType = 'web';
  protected permissions = ['read:web'];
  
  async search(query: string, limit: number = 5): Promise<any[]> {
    const url = new URL('https://api.bing.microsoft.com/v7.0/search');
    url.searchParams.append('q', query);
    url.searchParams.append('count', limit.toString());
    
    const response = await fetch(url.toString(), {
      headers: {
        'Ocp-Apim-Subscription-Key': process.env.BING_API_KEY!
      }
    });
    
    const data: any = await response.json();
    
    return data.webPages?.value || [];
  }
  
  async scrapeUrl(url: string): Promise<string> {
    const response = await fetch(url);
    const html = await response.text();
    
    // TODO: Parse HTML and extract text content
    return html;
  }
}
