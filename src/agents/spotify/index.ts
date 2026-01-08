import { BaseAgent } from '../base-agent';

export class SpotifyAgent extends BaseAgent {
  protected agentType = 'spotify';
  protected permissions = ['read:spotify', 'write:spotify'];

  private accessToken: string | null = null;

  async play(trackUri?: string): Promise<void> {
    await this.ensureAccessToken();

    const body = trackUri ? { uris: [trackUri] } : {};

    await fetch('https://api.spotify.com/v1/me/player/play', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  }

  async pause(): Promise<void> {
    await this.ensureAccessToken();

    await fetch('https://api.spotify.com/v1/me/player/pause', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });
  }

  async search(query: string, type: string = 'track'): Promise<any[]> {
    await this.ensureAccessToken();

    const url = new URL('https://api.spotify.com/v1/search');
    url.searchParams.append('q', query);
    url.searchParams.append('type', type);
    url.searchParams.append('limit', '10');

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    const data: any = await response.json();
    return data.tracks?.items || [];
  }

  private async ensureAccessToken(): Promise<void> {
    if (this.accessToken) return;

    // TODO: Implement OAuth flow or use refresh token
    this.accessToken = process.env.SPOTIFY_ACCESS_TOKEN!;
  }
}
