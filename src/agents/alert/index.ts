import { BaseAgent } from '../base-agent';
import type { Alert, PrismaClient } from '@prisma/client';
import logger from '../../utils/logger';
import { prisma as globalPrisma } from '../../utils/prisma';

interface TransactionEvent {
  userId: string;
  amount: number;
  currency: string;
  description: string;
  date: Date;
}

export class AlertAgent extends BaseAgent {
  protected agentType = 'alert';
  protected permissions = ['read:alerts', 'write:alerts'];

  private prisma: PrismaClient;
  private highSpendThreshold: number;

  constructor(prismaClient?: PrismaClient) {
    super();
    this.prisma = prismaClient || globalPrisma;
    this.highSpendThreshold = Number(
      process.env.ALERT_HIGH_SPEND_THRESHOLD || '500',
    );
  }

  async handleTransactionEvent(event: TransactionEvent): Promise<Alert | null> {
    if (Math.abs(event.amount) < this.highSpendThreshold) {
      return null;
    }

    const alert = await this.prisma.alert.create({
      data: {
        userId: event.userId,
        type: 'transaction',
        severity: 'warning',
        title: 'High-value transaction detected',
        message: `${event.currency} ${event.amount.toFixed(
          2,
        )}: ${event.description}`,
      },
    });

    logger.warn('High spend alert created', {
      userId: event.userId,
      amount: event.amount,
      currency: event.currency,
    });

    return alert;
  }
}
