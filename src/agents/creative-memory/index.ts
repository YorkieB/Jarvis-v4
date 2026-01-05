import { BaseAgent } from '../base-agent';
import { PrismaClient } from '@prisma/client';

export class CreativeMemoryAgent extends BaseAgent {
  protected agentType = 'creative-memory';
  protected permissions = ['read:preferences', 'write:preferences'];
  
  private prisma: PrismaClient;
  
  constructor() {
    super();
    this.prisma = new PrismaClient();
  }
  
  async recordFeedback(params: {
    userId: string;
    contentType: 'music' | 'image' | 'podcast' | 'video';
    contentId: string;
    rating: number; // 1-5
    feedback?: string;
  }): Promise<void> {
    await this.prisma.creativeFeedback.create({
      data: {
        userId: params.userId,
        contentType: params.contentType,
        contentId: params.contentId,
        rating: params.rating,
        feedback: params.feedback,
        timestamp: new Date()
      }
    });
    
    // Update preferences based on feedback
    await this.updatePreferences(params.userId, params.contentType, params.rating, params.contentId);
    
    console.log(`📝 Feedback recorded: ${params.rating}/5 for ${params.contentType}`);
  }
  
  private async updatePreferences(
    userId: string,
    contentType: string,
    rating: number,
    contentId: string
  ): Promise<void> {
    // Get current preferences
    let prefs = await this.prisma.creativePreferences.findUnique({
      where: { userId }
    });
    
    if (!prefs) {
      prefs = await this.prisma.creativePreferences.create({
        data: {
          userId,
          preferences: {}
        }
      });
    }
    
    // Analyze the content that was rated
    let contentDetails: any = {};
    
    if (contentType === 'music') {
      const track = await this.prisma.musicTrack.findUnique({ where: { id: contentId } });
      contentDetails = { genre: track?.genre, hasVocals: track?.hasVocals };
    } else if (contentType === 'image') {
      const image = await this.prisma.generatedImage.findUnique({ where: { id: contentId } });
      contentDetails = { style: image?.style };
    }
    
    // Update preferences based on rating (positive feedback = increase weight)
    const currentPrefs = prefs.preferences as any;
    
    if (rating >= 4) {
      // Positive feedback - increase preference for these attributes
      for (const [key, value] of Object.entries(contentDetails)) {
        if (!currentPrefs[contentType]) currentPrefs[contentType] = {};
        if (!currentPrefs[contentType][key]) currentPrefs[contentType][key] = {};
        
        const currentWeight = currentPrefs[contentType][key][value as string] || 0;
        currentPrefs[contentType][key][value as string] = currentWeight + 1;
      }
    } else if (rating <= 2) {
      // Negative feedback - decrease preference
      for (const [key, value] of Object.entries(contentDetails)) {
        if (!currentPrefs[contentType]) currentPrefs[contentType] = {};
        if (!currentPrefs[contentType][key]) currentPrefs[contentType][key] = {};
        
        const currentWeight = currentPrefs[contentType][key][value as string] || 0;
        currentPrefs[contentType][key][value as string] = Math.max(0, currentWeight - 1);
      }
    }
    
    // Save updated preferences
    await this.prisma.creativePreferences.update({
      where: { userId },
      data: { preferences: currentPrefs }
    });
  }
  
  async getRecommendedParameters(userId: string, contentType: string): Promise<any> {
    const prefs = await this.prisma.creativePreferences.findUnique({
      where: { userId }
    });
    
    if (!prefs) return {};
    
    const contentPrefs = (prefs.preferences as any)[contentType] || {};
    const recommendations: any = {};
    
    // Find highest-weighted preferences
    for (const [attribute, values] of Object.entries(contentPrefs)) {
      const valuesMap = values as Record<string, number>;
      const topValue = Object.entries(valuesMap)
        .sort(([, a], [, b]) => (b as number) - (a as number))[0];
      
      if (topValue) {
        recommendations[attribute] = topValue[0];
      }
    }
    
    return recommendations;
  }
  
  async getStyleEvolution(userId: string, contentType: string): Promise<any[]> {
    const feedback = await this.prisma.creativeFeedback.findMany({
      where: {
        userId,
        contentType
      },
      orderBy: { timestamp: 'asc' },
      take: 50
    });
    
    // Group by month and calculate average rating
    const evolution = new Map<string, { totalRating: number; count: number }>();
    
    for (const item of feedback) {
      const monthKey = `${item.timestamp.getFullYear()}-${item.timestamp.getMonth() + 1}`;
      const current = evolution.get(monthKey) || { totalRating: 0, count: 0 };
      
      evolution.set(monthKey, {
        totalRating: current.totalRating + item.rating,
        count: current.count + 1
      });
    }
    
    return Array.from(evolution.entries()).map(([month, data]) => ({
      month,
      averageRating: data.totalRating / data.count
    }));
  }
}
