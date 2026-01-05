import { BaseAgent } from '../base-agent';
import { PrismaClient } from '../../generated/prisma';
import { getPrismaClient } from '../../lib/prisma';

export class AlertAgent extends BaseAgent {
  protected agentType = 'alert';
  protected permissions = ['read:transactions', 'read:budgets', 'read:goals', 'write:alerts'];
  
  private prisma: PrismaClient;
  
  constructor() {
    super();
    this.prisma = getPrismaClient();
  }
  
  async startMonitoring(userId: string): Promise<void> {
    // Check alerts every hour
    setInterval(async () => {
      await this.checkAllAlerts(userId);
    }, 60 * 60 * 1000);
  }
  
  private async checkAllAlerts(userId: string): Promise<void> {
    const alerts: any[] = [];
    
    // Check budget thresholds
    const budgetAlerts = await this.checkBudgetThresholds(userId);
    alerts.push(...budgetAlerts);
    
    // Check unusual spending
    const unusualAlerts = await this.checkUnusualActivity(userId);
    alerts.push(...unusualAlerts);
    
    // Check goal milestones
    const goalAlerts = await this.checkGoalMilestones(userId);
    alerts.push(...goalAlerts);
    
    // Send alerts
    for (const alert of alerts) {
      await this.sendAlert(userId, alert);
    }
  }
  
  private async checkBudgetThresholds(userId: string): Promise<any[]> {
    const budgets = await this.prisma.budget.findMany({
      where: { userId }
    });
    
    const alerts: any[] = [];
    
    for (const budget of budgets) {
      const percentUsed = (budget.spent / budget.amount) * 100;
      
      if (percentUsed >= 90 && percentUsed < 100) {
        alerts.push({
          type: 'budget_warning',
          severity: 'high',
          title: `Budget Alert: ${budget.category}`,
          message: `You've used ${percentUsed.toFixed(0)}% of your ${budget.category} budget ($${budget.spent.toFixed(2)} / $${budget.amount.toFixed(2)})`
        });
      } else if (percentUsed >= 100) {
        alerts.push({
          type: 'budget_exceeded',
          severity: 'critical',
          title: `Budget Exceeded: ${budget.category}`,
          message: `You've exceeded your ${budget.category} budget by $${(budget.spent - budget.amount).toFixed(2)}`
        });
      }
    }
    
    return alerts;
  }
  
  private async checkUnusualActivity(userId: string): Promise<any[]> {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const recentTransactions = await this.prisma.transaction.findMany({
      where: {
        userId,
        date: { gte: yesterday }
      }
    });
    
    const alerts: any[] = [];
    
    // Check for large transactions (>$500)
    const largeTransactions = recentTransactions.filter(t => Math.abs(t.amount) > 500);
    
    for (const tx of largeTransactions) {
      alerts.push({
        type: 'large_transaction',
        severity: 'medium',
        title: 'Large Transaction Detected',
        message: `$${Math.abs(tx.amount).toFixed(2)} transaction: ${tx.description}`
      });
    }
    
    return alerts;
  }
  
  private async checkGoalMilestones(userId: string): Promise<any[]> {
    const goals = await this.prisma.savingsGoal.findMany({
      where: { userId }
    });
    
    const alerts: any[] = [];
    
    for (const goal of goals) {
      const percentComplete = (goal.currentAmount / goal.targetAmount) * 100;
      
      // Celebrate milestones: 25%, 50%, 75%, 100%
      const milestones = [25, 50, 75, 100];
      
      // Parse milestonesReached from JSON string
      let milestonesReached: number[] = [];
      try {
        milestonesReached = JSON.parse(goal.milestonesReached);
      } catch {
        milestonesReached = [];
      }
      
      for (const milestone of milestones) {
        if (percentComplete >= milestone && !milestonesReached.includes(milestone)) {
          alerts.push({
            type: 'goal_milestone',
            severity: 'low',
            title: `Goal Milestone: ${goal.name}`,
            message: `🎉 You've reached ${milestone}% of your ${goal.name} goal! ($${goal.currentAmount.toFixed(2)} / $${goal.targetAmount.toFixed(2)})`
          });
          
          // Mark milestone as reached
          milestonesReached.push(milestone);
          await this.prisma.savingsGoal.update({
            where: { id: goal.id },
            data: {
              milestonesReached: JSON.stringify(milestonesReached)
            }
          });
        }
      }
    }
    
    return alerts;
  }
  
  private async sendAlert(userId: string, alert: any): Promise<void> {
    // Store alert in database
    await this.prisma.alert.create({
      data: {
        userId,
        type: alert.type,
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
        read: false
      }
    });
    
    // TODO: Send push notification, email, or SMS
    console.log(`📢 Alert for ${userId}:`, alert.title);
  }
}
