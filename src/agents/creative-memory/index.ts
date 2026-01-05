import { BaseAgent } from '../base-agent';
import { PrismaClient } from '@prisma/client';

export class CreativeMemoryAgent extends BaseAgent {
  protected agentType = 'creative-memory';
  protected permissions = ['read:creative_preferences', 'write:creative_preferences'];
  
  private prisma: PrismaClient;
  
  constructor() {
    super();
    this.prisma = new PrismaClient();
  }
  
  async recordFeedback(userId: string, contentType: string, contentId: string, feedback: {
    rating?: number;
    liked?: boolean;
    comments?: string;
    adjustments?: string[];
  }): Promise<void> {
    // Store feedback
    await this.prisma.creativeFeedback.create({
      data: {
        userId,
        contentType,
        contentId,
        rating: feedback.rating,
        liked: feedback.liked,
        comments: feedback.comments,
        adjustments: JSON.stringify(feedback.adjustments || [])
      }
    });
    
    // Update user preferences based on feedback
    await this.updatePreferences(userId, contentType, feedback);
  }
  
  private async updatePreferences(userId: string, contentType: string, feedback: any): Promise<void> {
    const existingPrefs = await this.prisma.creativePreferences.findFirst({
      where: { userId, contentType }
    });
    
    if (!existingPrefs) {
      // Create new preferences
      await this.prisma.creativePreferences.create({
        data: {
          userId,
          contentType,
          preferences: JSON.stringify(this.extractPreferences(feedback))
        }
      });
    } else {
      // Merge with existing preferences
      const existing = JSON.parse(existingPrefs.preferences);
      const updated = this.mergePreferences(existing, feedback);
      
      await this.prisma.creativePreferences.update({
        where: { id: existingPrefs.id },
        data: { preferences: JSON.stringify(updated) }
      });
    }
  }
  
  private extractPreferences(feedback: any): any {
    const prefs: any = {};
    
    if (feedback.adjustments) {
      for (const adjustment of feedback.adjustments) {
        // Parse adjustments like "more acoustic", "darker lighting", "faster tempo"
        const match = adjustment.match(/(more|less|darker|lighter|faster|slower)\s+(\w+)/i);
        
        if (match) {
          const direction = match[1].toLowerCase();
          const attribute = match[2].toLowerCase();
          
          prefs[attribute] = direction === 'more' || direction === 'darker' || direction === 'faster' ? 1 : -1;
        }
      }
    }
    
    return prefs;
  }
  
  private mergePreferences(existing: any, feedback: any): any {
    const newPrefs = this.extractPreferences(feedback);
    
    // Weighted merge: 70% existing, 30% new feedback
    const merged: any = { ...existing };
    
    for (const [key, value] of Object.entries(newPrefs)) {
      if (existing[key]) {
        merged[key] = existing[key] * 0.7 + (value as number) * 0.3;
      } else {
        merged[key] = value;
      }
    }
    
    return merged;
  }
  
  async getRecommendedParameters(userId: string, contentType: string): Promise<any> {
    const prefs = await this.prisma.creativePreferences.findFirst({
      where: { userId, contentType }
    });
    
    if (!prefs) {
      // Return default parameters
      return this.getDefaultParameters(contentType);
    }
    
    // Convert preferences to generation parameters
    return this.preferencesToParameters(contentType, JSON.parse(prefs.preferences));
  }
  
  private getDefaultParameters(contentType: string): any {
    const defaults: Record<string, any> = {
      music: {
        genre: 'pop',
        tempo: 120,
        energy: 0.7
      },
      image: {
        style: 'photorealistic',
        lighting: 'natural',
        composition: 'balanced'
      },
      podcast: {
        pace: 'moderate',
        tone: 'conversational'
      }
    };
    
    return defaults[contentType] || {};
  }
  
  private preferencesToParameters(contentType: string, preferences: any): any {
    const params = this.getDefaultParameters(contentType);
    
    // Apply learned preferences
    for (const [key, value] of Object.entries(preferences)) {
      if (typeof value === 'number') {
        // Adjust parameter based on preference weight
        if (params[key] !== undefined) {
          params[key] = params[key] * (1 + value * 0.2); // 20% adjustment per preference unit
        }
      }
    }
    
    return params;
  }
  
  async getCreativeProfile(userId: string): Promise<any> {
    const allPreferences = await this.prisma.creativePreferences.findMany({
      where: { userId }
    });
    
    const allFeedback = await this.prisma.creativeFeedback.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    
    return {
      preferences: allPreferences.map(p => ({
        ...p,
        preferences: JSON.parse(p.preferences)
      })),
      recentFeedback: allFeedback.map(f => ({
        ...f,
        adjustments: JSON.parse(f.adjustments)
      })),
      favoriteStyles: this.analyzeFavoriteStyles(allFeedback),
      creationStats: await this.getCreationStats(userId)
    };
  }
  
  private analyzeFavoriteStyles(feedback: any[]): any {
    const styleCounts: Record<string, number> = {};
    
    for (const fb of feedback) {
      if (fb.liked) {
        const adjustments = JSON.parse(fb.adjustments);
        for (const adj of adjustments) {
          styleCounts[adj] = (styleCounts[adj] || 0) + 1;
        }
      }
    }
    
    return Object.entries(styleCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([style, count]) => ({ style, count }));
  }
  
  private async getCreationStats(userId: string): Promise<any> {
    const musicCount = await this.prisma.musicTrack.count({ where: { userId } });
    const imageCount = await this.prisma.generatedImage.count({ where: { userId } });
    const podcastCount = await this.prisma.podcastEpisode.count({ where: { userId } });
    
    return {
      totalMusic: musicCount,
      totalImages: imageCount,
      totalPodcasts: podcastCount,
      total: musicCount + imageCount + podcastCount
    };
  }
}
