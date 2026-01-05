import { BaseAgent } from '../base-agent';
import { PrismaClient } from '../../generated/prisma';
import { getPrismaClient } from '../../lib/prisma';

export class InsightsAgent extends BaseAgent {
  protected agentType = 'insights';
  protected permissions = ['read:transactions', 'read:budgets', 'write:insights'];
  
  private prisma: PrismaClient;
  
  constructor() {
    super();
    this.prisma = getPrismaClient();
  }
  
  async analyzeSpendingPatterns(userId: string): Promise<any[]> {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const transactions = await this.prisma.transaction.findMany({
      where: {
        userId,
        date: { gte: sixMonthsAgo },
        amount: { lt: 0 }
      },
      orderBy: { date: 'asc' }
    });
    
    const insights: any[] = [];
    
    // Pattern 1: Recurring expenses
    const recurringInsight = this.detectRecurringExpenses(transactions);
    if (recurringInsight) insights.push(recurringInsight);
    
    // Pattern 2: Spending spikes
    const spikesInsight = this.detectSpendingSpikes(transactions);
    if (spikesInsight) insights.push(spikesInsight);
    
    // Pattern 3: Category trends
    const trendsInsight = this.detectCategoryTrends(transactions);
    insights.push(...trendsInsight);
    
    return insights;
  }
  
  private detectRecurringExpenses(transactions: any[]): any | null {
    // Group by description
    const grouped = new Map<string, any[]>();
    
    for (const tx of transactions) {
      if (!grouped.has(tx.description)) {
        grouped.set(tx.description, []);
      }
      grouped.get(tx.description)!.push(tx);
    }
    
    // Find patterns that occur 3+ times
    const recurring: any[] = [];
    
    for (const [description, txs] of grouped.entries()) {
      if (txs.length >= 3) {
        const avgAmount = txs.reduce((sum, t) => sum + Math.abs(t.amount), 0) / txs.length;
        const totalAmount = txs.reduce((sum, t) => sum + Math.abs(t.amount), 0);
        
        recurring.push({
          description,
          frequency: txs.length,
          avgAmount,
          totalAmount
        });
      }
    }
    
    if (recurring.length === 0) return null;
    
    // Find top recurring expense
    const top = recurring.sort((a, b) => b.totalAmount - a.totalAmount)[0];
    
    return {
      type: 'recurring_expense',
      title: 'Recurring Expense Detected',
      description: `You spend about $${top.avgAmount.toFixed(2)} on "${top.description}" regularly (${top.frequency} times in 6 months = $${top.totalAmount.toFixed(2)} total)`,
      actionable: true,
      recommendation: 'Consider setting up a budget category for this recurring expense'
    };
  }
  
  private detectSpendingSpikes(transactions: any[]): any | null {
    // Calculate monthly spending
    const monthlySpending = new Map<string, number>();
    
    for (const tx of transactions) {
      const monthKey = `${tx.date.getFullYear()}-${tx.date.getMonth()}`;
      const current = monthlySpending.get(monthKey) || 0;
      monthlySpending.set(monthKey, current + Math.abs(tx.amount));
    }
    
    const amounts = Array.from(monthlySpending.values());
    const avgSpending = amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;
    const stdDev = Math.sqrt(amounts.reduce((sum, amt) => sum + Math.pow(amt - avgSpending, 2), 0) / amounts.length);
    
    // Find months with spending > 1.5 std deviations above average
    const spikes: any[] = [];
    
    for (const [month, amount] of monthlySpending.entries()) {
      if (amount > avgSpending + 1.5 * stdDev) {
        spikes.push({ month, amount, deviation: (amount - avgSpending) / stdDev });
      }
    }
    
    if (spikes.length === 0) return null;
    
    const latestSpike = spikes[spikes.length - 1];
    
    return {
      type: 'spending_spike',
      title: 'Unusual Spending Detected',
      description: `Your spending in ${latestSpike.month} was $${latestSpike.amount.toFixed(2)}, which is ${((latestSpike.amount / avgSpending - 1) * 100).toFixed(0)}% above your average`,
      actionable: true,
      recommendation: 'Review transactions from this month to identify the cause'
    };
  }
  
  private detectCategoryTrends(transactions: any[]): any[] {
    // Group by category and month
    const categoryMonthly = new Map<string, Map<string, number>>();
    
    for (const tx of transactions) {
      if (!categoryMonthly.has(tx.category)) {
        categoryMonthly.set(tx.category, new Map());
      }
      
      const monthKey = `${tx.date.getFullYear()}-${tx.date.getMonth()}`;
      const categoryMap = categoryMonthly.get(tx.category)!;
      const current = categoryMap.get(monthKey) || 0;
      categoryMap.set(monthKey, current + Math.abs(tx.amount));
    }
    
    const trends: any[] = [];
    
    // Detect increasing trends
    for (const [category, monthlyData] of categoryMonthly.entries()) {
      const months = Array.from(monthlyData.entries()).sort((a, b) => a[0].localeCompare(b[0]));
      
      if (months.length < 3) continue;
      
      // Simple linear regression to detect trend
      const recentMonths = months.slice(-3);
      const avgRecent = recentMonths.reduce((sum, [_, amt]) => sum + amt, 0) / recentMonths.length;
      const earlierMonths = months.slice(0, -3);
      const avgEarlier = earlierMonths.reduce((sum, [_, amt]) => sum + amt, 0) / earlierMonths.length;
      
      const percentChange = ((avgRecent - avgEarlier) / avgEarlier) * 100;
      
      if (percentChange > 20) {
        trends.push({
          type: 'category_trend_up',
          title: `${category} Spending Increasing`,
          description: `Your ${category} spending has increased ${percentChange.toFixed(0)}% over the past few months`,
          actionable: true,
          recommendation: `Consider reviewing your ${category} expenses for optimization opportunities`
        });
      }
    }
    
    return trends;
  }
}
