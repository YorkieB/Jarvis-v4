import { BaseAgent } from '../base-agent';
import { SunoService, SunoGenerateOptions, SunoTrack } from '../../services/sunoService';
import { MusicStorage, StoredTrack } from '../../services/musicStorage';

export class MusicAgent extends BaseAgent {
  protected agentType = 'music';
  protected permissions = ['write:music', 'read:music'];

  private suno: SunoService;
  private storage: MusicStorage;

  constructor(sunoService: SunoService, storage: MusicStorage) {
    super();
    this.suno = sunoService;
    this.storage = storage;
  }

  async generate(
    userId: string | undefined,
    options: SunoGenerateOptions,
  ): Promise<{ track: StoredTrack; provider: SunoTrack }> {
    const created = this.storage.create({
      userId,
      prompt: options.prompt,
      style: options.style,
      duration: options.duration || 'full',
      stemsRequested: options.stems ?? false,
      status: 'processing',
    });

    const providerTrack = await this.suno.generate(options);

    const updated = this.storage.update(created.id, {
      status: providerTrack.status,
      audioUrl: providerTrack.audioUrl,
      stems: providerTrack.stems,
      metadata: providerTrack.metadata,
    });

    return { track: updated || created, provider: providerTrack };
  }

  async refreshStatus(trackId: string): Promise<StoredTrack | null> {
    const providerTrack = await this.suno.getStatus(trackId);
    return this.storage.update(trackId, {
      status: providerTrack.status,
      audioUrl: providerTrack.audioUrl,
      stems: providerTrack.stems,
      metadata: providerTrack.metadata,
    });
  }
}
