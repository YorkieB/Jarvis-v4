import { BaseAgent } from '../base-agent';
import { PrismaClient } from '../../generated/prisma';
import { getPrismaClient } from '../../lib/prisma';

export class SavingsAgent extends BaseAgent {
  protected agentType = 'savings';
  protected permissions = ['read:transactions', 'read:budgets', 'read:goals', 'write:goals'];
  
  private prisma: PrismaClient;
  
  constructor() {
    super();
    this.prisma = getPrismaClient();
  }
  
  async createGoal(data: {
    userId: string;
    name: string;
    targetAmount: number;
    targetDate: Date;
    priority: 'low' | 'medium' | 'high';
  }): Promise<any> {
    return await this.accessResource('goals', 'write', async () => {
      return await this.prisma.savingsGoal.create({
        data: {
          userId: data.userId,
          name: data.name,
          targetAmount: data.targetAmount,
          currentAmount: 0,
          targetDate: data.targetDate,
          priority: data.priority
        }
      });
    });
  }
  
  async calculateSafeMonthlyAmount(userId: string): Promise<number> {
    // Get last 3 months of income and expenses
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    
    const transactions = await this.prisma.transaction.findMany({
      where: {
        userId,
        date: { gte: threeMonthsAgo }
      }
    });
    
    // Separate income and expenses
    const income = transactions.filter(t => t.amount > 0);
    const expenses = transactions.filter(t => t.amount < 0);
    
    // Calculate the actual number of months with data
    const now = new Date();
    const monthsWithData = Math.min(3, 
      (now.getTime() - threeMonthsAgo.getTime()) / (1000 * 60 * 60 * 24 * 30)
    );
    
    // Guard against division by zero for new users
    if (monthsWithData === 0) return 0;
    
    const avgMonthlyIncome = income.reduce((sum, t) => sum + t.amount, 0) / monthsWithData;
    const avgMonthlyExpenses = Math.abs(expenses.reduce((sum, t) => sum + t.amount, 0) / monthsWithData);
    
    // Safe amount: 70% of surplus (conservative)
    const monthlySurplus = avgMonthlyIncome - avgMonthlyExpenses;
    const safeAmount = monthlySurplus * 0.7;
    
    return Math.max(0, safeAmount);
  }
  
  async detectSavingsOpportunity(userId: string): Promise<{
    hasOpportunity: boolean;
    amount: number;
    reason: string;
  }> {
    const currentMonth = new Date();
    currentMonth.setDate(1);
    
    const nextMonth = new Date(currentMonth);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    
    // Get this month's spending
    const transactions = await this.prisma.transaction.findMany({
      where: {
        userId,
        date: {
          gte: currentMonth,
          lt: nextMonth
        },
        amount: { lt: 0 }
      }
    });
    
    const totalSpent = Math.abs(transactions.reduce((sum, t) => sum + t.amount, 0));
    
    // Get average spending from last 3 months
    const threeMonthsAgo = new Date(currentMonth);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    
    const historicalTransactions = await this.prisma.transaction.findMany({
      where: {
        userId,
        date: {
          gte: threeMonthsAgo,
          lt: currentMonth
        },
        amount: { lt: 0 }
      }
    });
    
    const avgMonthlySpending = Math.abs(historicalTransactions.reduce((sum, t) => sum + t.amount, 0) / 3);
    
    // Opportunity: spending less than usual
    if (totalSpent < avgMonthlySpending * 0.9) {
      const savingsAmount = avgMonthlySpending - totalSpent;
      return {
        hasOpportunity: true,
        amount: savingsAmount,
        reason: `You're spending ${((1 - totalSpent / avgMonthlySpending) * 100).toFixed(0)}% less than usual this month!`
      };
    }
    
    return { hasOpportunity: false, amount: 0, reason: '' };
  }
  
  async getGoalProgress(goalId: string): Promise<{
    goal: any;
    percentComplete: number;
    projectedCompletion: Date | null;
    onTrack: boolean;
  }> {
    const goal = await this.prisma.savingsGoal.findUnique({
      where: { id: goalId }
    });
    
    if (!goal) throw new Error('Goal not found');
    
    const percentComplete = (goal.currentAmount / goal.targetAmount) * 100;
    const daysUntilTarget = Math.ceil((goal.targetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    
    // Calculate if on track
    const expectedProgress = ((Date.now() - goal.createdAt.getTime()) / (goal.targetDate.getTime() - goal.createdAt.getTime())) * 100;
    const onTrack = percentComplete >= expectedProgress * 0.9;
    
    // Project completion date based on current rate
    let projectedCompletion: Date | null = null;
    if (goal.currentAmount > 0) {
      const daysElapsed = (Date.now() - goal.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      const ratePerDay = goal.currentAmount / daysElapsed;
      const daysToCompletion = (goal.targetAmount - goal.currentAmount) / ratePerDay;
      projectedCompletion = new Date(Date.now() + daysToCompletion * 24 * 60 * 60 * 1000);
    }
    
    return {
      goal,
      percentComplete,
      projectedCompletion,
      onTrack
    };
  }
}
