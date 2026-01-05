import { BaseAgent } from '../base-agent';
import { PrismaClient } from '@prisma/client';

export class ImageGenerationAgent extends BaseAgent {
  protected agentType = 'image-generation';
  protected permissions = ['read:images', 'write:images'];
  
  private prisma: PrismaClient;
  
  constructor() {
    super();
    this.prisma = new PrismaClient();
  }
  
  async generateImage(prompt: string, options: {
    style?: string;
    width?: number;
    height?: number;
    negativePrompt?: string;
    seed?: number;
    steps?: number;
  }): Promise<any> {
    console.log(`🖼️ Generating image: ${prompt}`);
    
    // TODO: Integrate with Stability AI SDXL API
    const imageRequest = {
      prompt,
      style: options.style || 'photorealistic',
      width: options.width || 1024,
      height: options.height || 1024,
      negative_prompt: options.negativePrompt || 'blurry, low quality',
      seed: options.seed,
      steps: options.steps || 30
    };
    
    // Store in database
    const dbImage = await this.prisma.generatedImage.create({
      data: {
        prompt,
        style: imageRequest.style,
        width: imageRequest.width,
        height: imageRequest.height,
        negativePrompt: imageRequest.negative_prompt,
        seed: imageRequest.seed,
        steps: imageRequest.steps,
        status: 'generating'
      }
    });
    
    // Placeholder: In production, call Stability AI API
    // const response = await fetch('https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image', {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': `Bearer ${process.env.STABILITY_API_KEY}`,
    //     'Content-Type': 'application/json'
    //   },
    //   body: JSON.stringify(imageRequest)
    // });
    
    return dbImage;
  }
  
  async generateVariations(imageId: string, count: number = 3): Promise<any[]> {
    // Get original image
    const original = await this.prisma.generatedImage.findUnique({
      where: { id: imageId }
    });
    
    if (!original) throw new Error('Original image not found');
    
    // Generate variations with slightly different seeds
    const variations: any[] = [];
    
    for (let i = 0; i < count; i++) {
      const variation = await this.generateImage(original.prompt, {
        style: original.style,
        width: original.width,
        height: original.height,
        negativePrompt: original.negativePrompt || undefined,
        seed: (original.seed || 0) + i + 1,
        steps: original.steps
      });
      
      variations.push(variation);
    }
    
    return variations;
  }
  
  async refineImage(imageId: string, refinementPrompt: string): Promise<any> {
    const original = await this.prisma.generatedImage.findUnique({
      where: { id: imageId }
    });
    
    if (!original) throw new Error('Original image not found');
    
    // Generate refined version with additional prompt
    const refinedPrompt = `${original.prompt}, ${refinementPrompt}`;
    
    return await this.generateImage(refinedPrompt, {
      style: original.style,
      width: original.width,
      height: original.height,
      negativePrompt: original.negativePrompt || undefined,
      seed: original.seed || undefined,
      steps: original.steps
    });
  }
  
  async applyStyle(imageId: string, styleName: string): Promise<any> {
    const original = await this.prisma.generatedImage.findUnique({
      where: { id: imageId }
    });
    
    if (!original) throw new Error('Original image not found');
    
    // Get style parameters
    const style = await this.prisma.imageStyle.findUnique({
      where: { name: styleName }
    });
    
    if (!style) throw new Error(`Style "${styleName}" not found`);
    
    // Apply style to prompt
    const styledPrompt = `${original.prompt}, ${style.promptModifier}`;
    
    return await this.generateImage(styledPrompt, {
      style: styleName,
      width: original.width,
      height: original.height,
      negativePrompt: style.negativePrompt || undefined,
      seed: original.seed || undefined,
      steps: original.steps
    });
  }
  
  async listImages(userId?: string): Promise<any[]> {
    return await this.prisma.generatedImage.findMany({
      where: userId ? { userId } : undefined,
      orderBy: { createdAt: 'desc' }
    });
  }
  
  async createCustomStyle(name: string, promptModifier: string, negativePrompt?: string): Promise<any> {
    return await this.prisma.imageStyle.create({
      data: {
        name,
        promptModifier,
        negativePrompt
      }
    });
  }
}
