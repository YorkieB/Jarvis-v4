import type { PrismaClient, Transaction, Account, BankConnection } from '@prisma/client';
import logger from '../utils/logger';
import { TrueLayerClient, TLAccount, TLTransaction } from './truelayerClient';
import { prisma as globalPrisma } from '../utils/prisma';

interface SyncOptions {
  from?: string; // ISO date
  to?: string;   // ISO date
}

export class FinanceService {
  private prisma: PrismaClient;
  private tl: TrueLayerClient;

  constructor(prismaClient?: PrismaClient, tlClient?: TrueLayerClient) {
    this.prisma = prismaClient || globalPrisma;
    this.tl = tlClient || new TrueLayerClient();
  }

  async getBankConnection(id: string): Promise<BankConnection | null> {
    return this.prisma.bankConnection.findUnique({ where: { id } });
  }

  async syncTrueLayer(
    userId: string,
    connection: BankConnection,
    accessToken: string,
    opts: SyncOptions = {},
  ): Promise<{ accounts: Account[]; transactions: Transaction[] }> {
    const accounts = await this.tl.getAccounts(accessToken);
    const accountMap = await this.upsertAccounts(userId, connection, accounts);

    const allTx: Transaction[] = [];
    for (const acc of accounts) {
      const accountId = accountMap.get(acc.account_id);
      if (!accountId) continue;
      const txs = await this.tl.getTransactions(accessToken, acc.account_id, opts.from, opts.to);
      const inserted = await this.upsertTransactions(userId, accountId, txs);
      allTx.push(...inserted);
    }

    return {
      accounts: Array.from(accountMap.values()).map((id) => ({ id } as Account)),
      transactions: allTx,
    };
  }

  private async upsertAccounts(
    userId: string,
    connection: BankConnection,
    accounts: TLAccount[],
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    for (const acc of accounts) {
      const record = await this.prisma.account.upsert({
        where: {
          bankConnectionId_providerAccountId: {
            bankConnectionId: connection.id,
            providerAccountId: acc.account_id,
          },
        },
        update: {
          name: acc.display_name,
          currency: acc.currency,
          balance: acc.balance ?? undefined,
          iban: acc.iban,
          sortCode: acc.sort_code,
          accountNumber: acc.account_number,
          meta: acc.meta ?? {},
        },
        create: {
          userId,
          bankConnectionId: connection.id,
          providerAccountId: acc.account_id,
          name: acc.display_name,
          currency: acc.currency,
          balance: acc.balance ?? 0,
          iban: acc.iban,
          sortCode: acc.sort_code,
          accountNumber: acc.account_number,
          meta: acc.meta ?? {},
        },
      });
      map.set(acc.account_id, record.id);
    }
    return map;
  }

  private async upsertTransactions(
    userId: string,
    accountId: string,
    txs: TLTransaction[],
  ): Promise<Transaction[]> {
    const results: Transaction[] = [];
    for (const tx of txs) {
      try {
        const record = await this.prisma.transaction.upsert({
          where: {
            // No natural unique; use composite surrogate
            // Create a synthetic id if not existing:
            id: `${accountId}-${tx.transaction_id}`,
          },
          update: {
            amount: tx.amount,
            description: tx.description,
            category: tx.transaction_category || tx.merchant_name || 'uncategorized',
            date: new Date(tx.timestamp),
            accountId,
          },
          create: {
            id: `${accountId}-${tx.transaction_id}`,
            userId,
            amount: tx.amount,
            description: tx.description,
            category: tx.transaction_category || tx.merchant_name || 'uncategorized',
            date: new Date(tx.timestamp),
            accountId,
          },
        });
        results.push(record);
      } catch (error) {
        logger.warn('Failed to upsert transaction', { accountId, txId: tx.transaction_id, error });
      }
    }
    return results;
  }
}

