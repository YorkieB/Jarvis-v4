/**
 * Integration tests for Personal Finance Agents (Batch 2)
 * Tests Finance and Savings agents
 */

import { FinanceAgent } from '../../src/agents/finance';
import { SavingsAgent } from '../../src/agents/savings';
import { getPrismaClient } from '../../src/lib/prisma';
import { PrismaClient } from '../../src/generated/prisma';

describe('Finance Agent', () => {
  let financeAgent: FinanceAgent;
  let prisma: PrismaClient;
  let testUserId: string;

  beforeEach(async () => {
    financeAgent = new FinanceAgent();
    prisma = getPrismaClient();
    
    // Create test user
    const user = await prisma.user.create({
      data: {
        email: `test-${Date.now()}@example.com`,
        name: 'Test User'
      }
    });
    testUserId = user.id;
  });

  afterEach(async () => {
    // Cleanup
    await prisma.transaction.deleteMany({ where: { userId: testUserId } });
    await prisma.budget.deleteMany({ where: { userId: testUserId } });
    await prisma.user.delete({ where: { id: testUserId } });
  });

  it('should categorize transactions automatically', async () => {
    const tx = await financeAgent.addTransaction({
      userId: testUserId,
      amount: -50,
      description: 'Whole Foods Market',
      date: new Date()
    });
    
    expect(tx.category).toBe('groceries');
  });

  it('should categorize unknown transactions as "other"', async () => {
    const tx = await financeAgent.addTransaction({
      userId: testUserId,
      amount: -25,
      description: 'Random Store XYZ',
      date: new Date()
    });
    
    expect(tx.category).toBe('other');
  });

  it('should create a budget', async () => {
    const budget = await financeAgent.createBudget({
      userId: testUserId,
      category: 'groceries',
      amount: 500,
      period: 'monthly'
    });
    
    expect(budget.category).toBe('groceries');
    expect(budget.amount).toBe(500);
    expect(budget.spent).toBe(0);
  });

  it('should get spending by category', async () => {
    // Add some transactions
    await financeAgent.addTransaction({
      userId: testUserId,
      amount: -50,
      description: 'Grocery Store',
      category: 'groceries',
      date: new Date()
    });
    
    await financeAgent.addTransaction({
      userId: testUserId,
      amount: -30,
      description: 'Another Grocery Store',
      category: 'groceries',
      date: new Date()
    });

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 1);
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 1);

    const spending = await financeAgent.getSpendingByCategory(
      testUserId,
      startDate,
      endDate
    );
    
    expect(spending.length).toBeGreaterThan(0);
    const groceries = spending.find(s => s.category === 'groceries');
    expect(groceries).toBeDefined();
    expect(groceries?._sum.amount).toBe(-80);
  });
});

describe('Savings Agent', () => {
  let savingsAgent: SavingsAgent;
  let prisma: PrismaClient;
  let testUserId: string;

  beforeEach(async () => {
    savingsAgent = new SavingsAgent();
    prisma = getPrismaClient();
    
    // Create test user
    const user = await prisma.user.create({
      data: {
        email: `test-${Date.now()}@example.com`,
        name: 'Test User'
      }
    });
    testUserId = user.id;
  });

  afterEach(async () => {
    // Cleanup
    await prisma.transaction.deleteMany({ where: { userId: testUserId } });
    await prisma.savingsGoal.deleteMany({ where: { userId: testUserId } });
    await prisma.user.delete({ where: { id: testUserId } });
  });

  it('should create a savings goal', async () => {
    const targetDate = new Date();
    targetDate.setMonth(targetDate.getMonth() + 6);

    const goal = await savingsAgent.createGoal({
      userId: testUserId,
      name: 'Vacation Fund',
      targetAmount: 2000,
      targetDate,
      priority: 'high'
    });
    
    expect(goal.name).toBe('Vacation Fund');
    expect(goal.targetAmount).toBe(2000);
    expect(goal.currentAmount).toBe(0);
  });

  it('should calculate safe monthly savings amount', async () => {
    // Add some historical transactions
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    // Income
    await prisma.transaction.create({
      data: {
        userId: testUserId,
        amount: 3000,
        description: 'Salary',
        category: 'income',
        date: threeMonthsAgo
      }
    });

    // Expenses
    await prisma.transaction.create({
      data: {
        userId: testUserId,
        amount: -2000,
        description: 'Rent',
        category: 'housing',
        date: threeMonthsAgo
      }
    });

    const safeAmount = await savingsAgent.calculateSafeMonthlyAmount(testUserId);
    
    expect(safeAmount).toBeGreaterThanOrEqual(0);
  });

  it('should get goal progress', async () => {
    const targetDate = new Date();
    targetDate.setMonth(targetDate.getMonth() + 6);

    const goal = await savingsAgent.createGoal({
      userId: testUserId,
      name: 'Emergency Fund',
      targetAmount: 1000,
      targetDate,
      priority: 'high'
    });

    // Update current amount
    await prisma.savingsGoal.update({
      where: { id: goal.id },
      data: { currentAmount: 500 }
    });

    const progress = await savingsAgent.getGoalProgress(goal.id);
    
    expect(progress.percentComplete).toBe(50);
    expect(progress.goal.id).toBe(goal.id);
  });
});
