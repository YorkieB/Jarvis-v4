import { PrismaClient, BankConnection, Payment } from '@prisma/client';
import logger from '../utils/logger';
import { TrueLayerClient } from './truelayerClient';

export class PaymentService {
  private prisma: PrismaClient;
  private tl: TrueLayerClient;

  constructor(prismaClient?: PrismaClient, tlClient?: TrueLayerClient) {
    this.prisma = prismaClient || new PrismaClient();
    this.tl = tlClient || new TrueLayerClient();
  }

  async createPayment(
    userId: string,
    bankConnection: BankConnection,
    accessToken: string,
    amount: number,
    currency: string,
    reference: string,
    beneficiary: {
      name: string;
      iban?: string;
      sortCode?: string;
      accountNumber?: string;
    },
  ): Promise<Payment> {
    const resp = await this.tl.createPayment(accessToken, amount, currency, reference, beneficiary);

    const payment = await this.prisma.payment.create({
      data: {
        userId,
        bankConnectionId: bankConnection.id,
        providerPaymentId: resp.id,
        amount,
        currency,
        status: resp.status,
        reference,
      },
    });

    return payment;
  }

  async updatePaymentStatus(
    paymentId: string,
    accessToken: string,
  ): Promise<Payment | null> {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) return null;

    const status = await this.tl.getPaymentStatus(accessToken, payment.providerPaymentId);
    return this.prisma.payment.update({
      where: { id: paymentId },
      data: { status: status.status },
    });
  }
}

