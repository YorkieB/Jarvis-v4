import { BaseAgent } from '../base-agent';
import { PrismaClient } from '../../generated/prisma';
import { getPrismaClient } from '../../lib/prisma';
import crypto from 'crypto';

export class PrivacyAgent extends BaseAgent {
  protected agentType = 'privacy';
  protected permissions = ['read:*', 'write:privacy_settings', 'delete:user_data'];
  
  private prisma: PrismaClient;
  private encryptionKey: Buffer;
  
  constructor() {
    super();
    this.prisma = getPrismaClient();
    
    // Encryption key from environment (32 bytes for AES-256)
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
      throw new Error('ENCRYPTION_KEY environment variable is required for PrivacyAgent');
    }
    this.encryptionKey = Buffer.from(key, 'hex');
  }
  
  encryptData(data: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Return IV + encrypted data
    return iv.toString('hex') + ':' + encrypted;
  }
  
  decryptData(encryptedData: string): string {
    const parts = encryptedData.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, iv);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
  
  async exportUserData(userId: string): Promise<any> {
    // GDPR Article 20: Right to data portability
    
    const userData: any = {
      user: await this.prisma.user.findUnique({ where: { id: userId } }),
      transactions: await this.prisma.transaction.findMany({ where: { userId } }),
      budgets: await this.prisma.budget.findMany({ where: { userId } }),
      goals: await this.prisma.savingsGoal.findMany({ where: { userId } }),
      conversations: await this.prisma.conversation.findMany({ 
        where: { userId },
        include: { messages: true }
      }),
      alerts: await this.prisma.alert.findMany({ where: { userId } })
    };
    
    return userData;
  }
  
  async deleteUserData(userId: string, confirmation: string): Promise<void> {
    // GDPR Article 17: Right to erasure
    
    if (confirmation !== `DELETE_${userId}`) {
      throw new Error('Invalid confirmation token');
    }
    
    // Destructive action - requires audit logging
    await this.prisma.destructiveAction.create({
      data: {
        userId,
        action: 'delete_all_user_data',
        performedAt: new Date(),
        performedBy: userId
      }
    });
    
    // Delete all user data
    await this.prisma.transaction.deleteMany({ where: { userId } });
    await this.prisma.budget.deleteMany({ where: { userId } });
    await this.prisma.savingsGoal.deleteMany({ where: { userId } });
    await this.prisma.message.deleteMany({ 
      where: { conversation: { userId } } 
    });
    await this.prisma.conversation.deleteMany({ where: { userId } });
    await this.prisma.alert.deleteMany({ where: { userId } });
    await this.prisma.session.deleteMany({ where: { userId } });
    await this.prisma.user.delete({ where: { id: userId } });
    
    console.log(`🗑️ All data deleted for user ${userId}`);
  }
  
  async updatePrivacySettings(userId: string, settings: {
    dataRetentionDays?: number;
    allowAnalytics?: boolean;
    allowPersonalization?: boolean;
  }): Promise<void> {
    await this.prisma.privacySettings.upsert({
      where: { userId },
      create: {
        userId,
        ...settings
      },
      update: settings
    });
  }
  
  async getAuditLog(userId: string, startDate: Date, endDate: Date): Promise<any[]> {
    return await this.prisma.auditLog.findMany({
      where: {
        userId,
        timestamp: {
          gte: startDate,
          lte: endDate
        }
      },
      orderBy: { timestamp: 'desc' }
    });
  }
}
