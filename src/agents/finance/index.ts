import { BaseAgent } from '../base-agent';
import { PrismaClient } from '../../generated/prisma';
import { getPrismaClient } from '../../lib/prisma';

export class FinanceAgent extends BaseAgent {
  protected agentType = 'finance';
  protected permissions = ['read:transactions', 'write:transactions', 'read:budgets', 'write:budgets'];
  
  private prisma: PrismaClient;
  
  constructor() {
    super();
    this.prisma = getPrismaClient();
  }
  
  async addTransaction(data: {
    userId: string;
    amount: number;
    description: string;
    category?: string;
    date: Date;
  }): Promise<any> {
    // RULE 6: Check permissions before accessing resource
    return await this.accessResource('transactions', 'write', async () => {
      // Auto-categorize if no category provided
      const category = data.category || await this.categorizeTransaction(data.description);
      
      const transaction = await this.prisma.transaction.create({
        data: {
          userId: data.userId,
          amount: data.amount,
          description: data.description,
          category,
          date: data.date
        }
      });
      
      // Check if this affects budget thresholds
      await this.checkBudgetThresholds(data.userId, category, data.amount);
      
      return transaction;
    });
  }
  
  async createBudget(data: {
    userId: string;
    category: string;
    amount: number;
    period: 'monthly' | 'weekly' | 'yearly';
  }): Promise<any> {
    return await this.accessResource('budgets', 'write', async () => {
      return await this.prisma.budget.create({
        data: {
          userId: data.userId,
          category: data.category,
          amount: data.amount,
          period: data.period,
          spent: 0
        }
      });
    });
  }
  
  async getSpendingByCategory(userId: string, startDate: Date, endDate: Date): Promise<any[]> {
    return await this.accessResource('transactions', 'read', async () => {
      const transactions = await this.prisma.transaction.groupBy({
        by: ['category'],
        where: {
          userId,
          date: {
            gte: startDate,
            lte: endDate
          }
        },
        _sum: {
          amount: true
        },
        _count: true
      });
      
      return transactions;
    });
  }
  
  private async categorizeTransaction(description: string): Promise<string> {
    // Simple keyword-based categorization
    const keywords: Record<string, string[]> = {
      'groceries': ['grocery', 'supermarket', 'whole foods', 'trader joes'],
      'dining': ['restaurant', 'cafe', 'coffee', 'starbucks', 'mcdonald'],
      'transportation': ['uber', 'lyft', 'gas', 'parking', 'metro'],
      'entertainment': ['movie', 'spotify', 'netflix', 'theater'],
      'utilities': ['electric', 'water', 'internet', 'phone'],
      'shopping': ['amazon', 'target', 'walmart', 'mall']
    };
    
    const lowerDesc = description.toLowerCase();
    
    for (const [category, words] of Object.entries(keywords)) {
      if (words.some(word => lowerDesc.includes(word))) {
        return category;
      }
    }
    
    return 'other';
  }
  
  private async checkBudgetThresholds(userId: string, category: string, amount: number): Promise<void> {
    const budget = await this.prisma.budget.findFirst({
      where: { userId, category }
    });
    
    if (!budget) return;
    
    const newSpent = budget.spent + amount;
    const percentUsed = (newSpent / budget.amount) * 100;
    
    // Update budget
    await this.prisma.budget.update({
      where: { id: budget.id },
      data: { spent: newSpent }
    });
    
    // Trigger alerts if threshold exceeded
    if (percentUsed >= 80) {
      // TODO: Send alert via Alert Agent
      console.log(`⚠️ Budget warning: ${category} is at ${percentUsed.toFixed(0)}%`);
    }
  }
}
