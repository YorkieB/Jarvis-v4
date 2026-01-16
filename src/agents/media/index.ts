import { BaseAgent } from '../base-agent';
import { ImageService, ImageGenerateOptions, ImageEditOptions } from '../../services/imageService';
import { VideoService, VideoGenerateOptions, VideoJob } from '../../services/videoService';
import { VideoEditService, VideoEditOptions } from '../../services/videoEditService';
import { AssetStorage, StoredAsset } from '../../services/assetStorage';

export class MediaAgent extends BaseAgent {
  protected agentType = 'media';
  protected permissions = ['write:media', 'read:media'];

  private images: ImageService;
  private videos: VideoService;
  private videoEditor: VideoEditService;
  private storage: AssetStorage;

  constructor(images: ImageService, videos: VideoService, videoEditor: VideoEditService, storage: AssetStorage) {
    super();
    this.images = images;
    this.videos = videos;
    this.videoEditor = videoEditor;
    this.storage = storage;
  }

  async generateImage(
    userId: string | undefined,
    action: 'generate' | 'variation' | 'inpaint' | 'outpaint' | 'upscale',
    genOpts: ImageGenerateOptions,
    editOpts: ImageEditOptions,
  ): Promise<StoredAsset> {
    let result;
    if (action === 'generate') {
      result = await this.images.generate(genOpts);
    } else if (action === 'variation') {
      result = await this.images.variation(editOpts);
    } else if (action === 'inpaint') {
      result = await this.images.inpaint(editOpts);
    } else if (action === 'outpaint') {
      result = await this.images.outpaint(editOpts);
    } else {
      result = await this.images.upscale(editOpts);
    }

    return (
      this.storage.update(
        result.id,
        {
          url: result.url,
          thumbnailUrl: result.thumbnailUrl,
          provider: result.provider,
          metadata: result.metadata,
          status: 'succeeded',
          userId,
        },
      ) ||
      this.storage.create({
        id: result.id,
        type: 'image',
        prompt: genOpts.prompt || editOpts.prompt || '',
        style: genOpts.style || editOpts.style,
        userId,
        status: 'succeeded',
        url: result.url,
        thumbnailUrl: result.thumbnailUrl,
        provider: result.provider,
        metadata: result.metadata,
      })
    );
  }

  async generateVideo(userId: string | undefined, opts: VideoGenerateOptions): Promise<StoredAsset> {
    const job = await this.videos.generate(opts);
    return this.storage.create({
      id: job.id,
      type: 'video',
      prompt: opts.prompt,
      style: opts.style,
      userId,
      status: job.status,
      url: job.videoUrl,
      thumbnailUrl: job.thumbnailUrl,
      provider: 'stability',
      metadata: job.metadata,
    });
  }

  async editVideo(userId: string | undefined, opts: VideoEditOptions): Promise<StoredAsset> {
    const result = await this.videoEditor.edit(opts);
    return this.storage.create({
      id: result.id,
      type: 'video',
      prompt: opts.prompt || '',
      style: opts.style,
      userId,
      status: result.status,
      url: result.videoUrl,
      thumbnailUrl: result.thumbnailUrl,
      provider: 'editor',
      metadata: { ...result.metadata, action: opts.action },
      sourceAssetIds: opts.sources,
      action: opts.action,
    });
  }

  async refreshVideo(id: string): Promise<StoredAsset | null> {
    const status = await this.videos.getStatus(id);
    return this.storage.update(id, {
      status: status.status,
      url: status.videoUrl,
      thumbnailUrl: status.thumbnailUrl,
      metadata: status.metadata,
    });
  }
}
