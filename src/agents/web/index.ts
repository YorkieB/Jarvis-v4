import { BaseAgent } from '../base-agent';

interface BingWebPage {
  id: string;
  name: string;
  url: string;
  snippet: string;
  [key: string]: unknown;
}

interface BingSearchResponse {
  webPages?: {
    value: BingWebPage[];
  };
}

export class WebAgent extends BaseAgent {
  protected agentType = 'web';
  protected permissions = ['read:web'];

  async search(query: string, limit: number = 5): Promise<BingWebPage[]> {
    const url = new URL('https://api.bing.microsoft.com/v7.0/search');
    url.searchParams.append('q', query);
    url.searchParams.append('count', limit.toString());

    const response = await fetch(url.toString(), {
      headers: {
        'Ocp-Apim-Subscription-Key': process.env.BING_API_KEY!,
      },
    });

    const data = (await response.json()) as BingSearchResponse;

    return data.webPages?.value || [];
  }

  async scrapeUrl(url: string): Promise<string> {
    const response = await fetch(url);
    const html = await response.text();

    return this.extractTextContent(html);
  }

  private extractTextContent(html: string): string {
    // Remove scripts and styles to avoid noise
    const withoutScripts = html.replaceAll(/<script[\s\S]*?<\/script>/gi, ' ');
    const withoutStyles = withoutScripts.replaceAll(/<style[\s\S]*?<\/style>/gi, ' ');

    // Strip remaining tags
    const withoutTags = withoutStyles.replaceAll(/<[^>]+>/g, ' ');

    // Decode common entities
    const decoded = withoutTags
      .replaceAll(/&nbsp;/gi, ' ')
      .replaceAll(/&amp;/gi, '&')
      .replaceAll(/&lt;/gi, '<')
      .replaceAll(/&gt;/gi, '>')
      .replaceAll(/&quot;/gi, '"')
      .replaceAll(/&#39;/gi, "'");

    // Collapse whitespace
    return decoded.replaceAll(/\s+/g, ' ').trim();
  }
}
