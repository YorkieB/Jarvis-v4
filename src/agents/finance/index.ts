import { BaseAgent } from '../base-agent';
import type { PrismaClient } from '@prisma/client';
import logger from '../../utils/logger';
import { prisma as globalPrisma } from '../../utils/prisma';
import { FinanceService } from '../../services/financeService';
import { TrueLayerClient } from '../../services/truelayerClient';

interface SyncRequest {
  bankConnectionId: string;
  from?: string;
  to?: string;
}

export class FinanceAgent extends BaseAgent {
  protected agentType = 'finance';
  protected permissions = ['read:finance', 'write:finance'];

  private prisma: PrismaClient;
  private financeService: FinanceService;
  private tl: TrueLayerClient;

  constructor(prismaClient?: PrismaClient) {
    super();
    this.prisma = prismaClient || globalPrisma;
    this.financeService = new FinanceService(this.prisma);
    this.tl = new TrueLayerClient();
  }

  /**
   * Sync accounts and transactions from TrueLayer for a given bank connection.
   */
  async syncTrueLayer(request: SyncRequest): Promise<void> {
    const { bankConnectionId, from, to } = request;
    const connection = await this.prisma.bankConnection.findUnique({
      where: { id: bankConnectionId },
    });
    if (!connection) {
      throw new Error('Bank connection not found');
    }

    // Ensure token is fresh
    let accessToken = connection.accessToken;
    if (connection.expiresAt.getTime() - Date.now() < 60_000) {
      try {
        const token = await this.tl.refreshToken(connection.refreshToken);
        accessToken = token.access_token;
        await this.prisma.bankConnection.update({
          where: { id: bankConnectionId },
          data: {
            accessToken: token.access_token,
            refreshToken: token.refresh_token || connection.refreshToken,
            scope: token.scope,
            expiresAt: new Date(Date.now() + token.expires_in * 1000),
          },
        });
      } catch (error) {
        logger.error('Failed to refresh TrueLayer token', {
          bankConnectionId,
          error,
        });
        throw error;
      }
    }

    await this.financeService.syncTrueLayer(
      connection.userId,
      connection,
      accessToken,
      { from, to },
    );

    logger.info('TrueLayer sync completed', { bankConnectionId, from, to });
  }
}
