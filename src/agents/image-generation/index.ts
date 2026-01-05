import { BaseAgent } from '../base-agent';
import { PrismaClient } from '@prisma/client';

export class ImageGenerationAgent extends BaseAgent {
  protected agentType = 'image-generation';
  protected permissions = ['write:images', 'read:images'];
  
  private prisma: PrismaClient;
  
  constructor() {
    super();
    this.prisma = new PrismaClient();
  }
  
  async generateImage(params: {
    userId: string;
    prompt: string;
    negativePrompt?: string;
    style?: string;
    width?: number;
    height?: number;
    numImages?: number;
  }): Promise<any[]> {
    // RULE 2: Grounding - load style preferences
    const userPrefs = await this.prisma.creativePreferences.findUnique({
      where: { userId: params.userId }
    });
    
    const context = { prompt: params.prompt, preferences: userPrefs };
    await this.callLLM(params.prompt, { context });
    
    // Apply user's default style if not specified
    const prefsData = userPrefs?.preferences as any;
    const style = params.style || prefsData?.defaultImageStyle || 'photorealistic';
    
    console.log(`🎨 Generating ${params.numImages || 1} image(s): "${params.prompt}" (${style})`);
    
    // TODO: Call Stability AI SDXL API
    // For now, placeholder
    const images = [];
    
    for (let i = 0; i < (params.numImages || 1); i++) {
      const image = await this.prisma.generatedImage.create({
        data: {
          userId: params.userId,
          prompt: params.prompt,
          negativePrompt: params.negativePrompt,
          style,
          width: params.width || 1024,
          height: params.height || 1024,
          filePath: `./generated-images/img-${Date.now()}-${i}.png`,
          seed: Math.floor(Math.random() * 1000000)
        }
      });
      
      images.push(image);
    }
    
    console.log(`✅ Generated ${images.length} image(s)`);
    return images;
  }
  
  async generateVariations(imageId: string, count: number): Promise<any[]> {
    const originalImage = await this.prisma.generatedImage.findUnique({
      where: { id: imageId }
    });
    
    if (!originalImage) throw new Error('Image not found');
    
    console.log(`🔄 Generating ${count} variations of image ${imageId}`);
    
    // Use same prompt with different seeds
    const variations = [];
    
    for (let i = 0; i < count; i++) {
      const variation = await this.prisma.generatedImage.create({
        data: {
          userId: originalImage.userId,
          prompt: originalImage.prompt,
          negativePrompt: originalImage.negativePrompt,
          style: originalImage.style,
          width: originalImage.width,
          height: originalImage.height,
          filePath: `./generated-images/var-${Date.now()}-${i}.png`,
          seed: Math.floor(Math.random() * 1000000),
          parentImageId: imageId
        }
      });
      
      variations.push(variation);
    }
    
    return variations;
  }
  
  async refineImage(imageId: string, refinementPrompt: string): Promise<any> {
    const originalImage = await this.prisma.generatedImage.findUnique({
      where: { id: imageId }
    });
    
    if (!originalImage) throw new Error('Image not found');
    
    console.log(`✨ Refining image ${imageId}: "${refinementPrompt}"`);
    
    // Combine original prompt with refinement
    const enhancedPrompt = `${originalImage.prompt}, ${refinementPrompt}`;
    
    const refined = await this.prisma.generatedImage.create({
      data: {
        userId: originalImage.userId,
        prompt: enhancedPrompt,
        negativePrompt: originalImage.negativePrompt,
        style: originalImage.style,
        width: originalImage.width,
        height: originalImage.height,
        filePath: `./generated-images/refined-${Date.now()}.png`,
        seed: originalImage.seed,
        parentImageId: imageId
      }
    });
    
    return refined;
  }
  
  async applyStyle(imageId: string, styleName: string): Promise<any> {
    const originalImage = await this.prisma.generatedImage.findUnique({
      where: { id: imageId }
    });
    
    if (!originalImage) throw new Error('Image not found');
    
    console.log(`🎭 Applying ${styleName} style to image ${imageId}`);
    
    // TODO: Use ControlNet or IP-Adapter for style transfer
    
    const styled = await this.prisma.generatedImage.create({
      data: {
        userId: originalImage.userId,
        prompt: originalImage.prompt,
        negativePrompt: originalImage.negativePrompt,
        style: styleName,
        width: originalImage.width,
        height: originalImage.height,
        filePath: `./generated-images/styled-${Date.now()}.png`,
        seed: originalImage.seed,
        parentImageId: imageId
      }
    });
    
    return styled;
  }
}
