import crypto from 'crypto';
import logger from '../utils/logger';
import { URLSearchParams } from 'url';

export interface TLToken {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
}

export interface TLAccount {
  account_id: string;
  account_type?: string;
  display_name?: string;
  currency: string;
  balance?: number;
  iban?: string;
  sort_code?: string;
  account_number?: string;
  provider?: {
    display_name?: string;
    provider_id?: string;
  };
  meta?: Record<string, unknown>;
}

export interface TLTransaction {
  transaction_id: string;
  timestamp: string;
  description: string;
  amount: number;
  currency: string;
  merchant_name?: string;
  transaction_category?: string;
  running_balance?: { currency: string; amount: number };
  meta?: Record<string, unknown>;
}

export interface TLPaymentCreateResponse {
  id: string;
  status: string;
  resource_token?: string;
}

export interface TLPaymentStatus {
  id: string;
  status: string;
}

export class TrueLayerClient {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;
  private apiBase: string;
  private authBase: string;

  constructor() {
    this.clientId = process.env.TRUELAYER_CLIENT_ID || '';
    this.clientSecret = process.env.TRUELAYER_CLIENT_SECRET || '';
    this.redirectUri =
      process.env.TRUELAYER_REDIRECT_URI ||
      'http://localhost:3000/api/truelayer/callback';
    this.apiBase =
      process.env.TRUELAYER_API_BASE || 'https://api.truelayer.com';
    this.authBase =
      process.env.TRUELAYER_AUTH_BASE || 'https://auth.truelayer.com';
  }

  buildAuthorizeUrl(
    state: string,
    scope?: string,
    codeChallenge?: string,
  ): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope:
        scope ||
        'accounts balance transactions payments beneficiaries offline_access',
      state,
    });

    if (codeChallenge) {
      params.append('code_challenge_method', 'S256');
      params.append('code_challenge', codeChallenge);
    }

    return `${this.authBase}/?${params.toString()}`;
  }

  generatePKCE(): { verifier: string; challenge: string } {
    const verifier = crypto.randomBytes(32).toString('hex');
    const challenge = this.pkceChallenge(verifier);
    return { verifier, challenge };
  }

  private pkceChallenge(verifier: string): string {
    return crypto
      .createHash('sha256')
      .update(verifier)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  async exchangeCode(code: string, codeVerifier?: string): Promise<TLToken> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: this.redirectUri,
      code,
    });
    if (codeVerifier) {
      body.append('code_verifier', codeVerifier);
    }

    return this.tokenRequest(body);
  }

  async refreshToken(refreshToken: string): Promise<TLToken> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });
    return this.tokenRequest(body);
  }

  private async tokenRequest(body: URLSearchParams): Promise<TLToken> {
    const res = await fetch(`${this.authBase}/connect/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!res.ok) {
      const text = await res.text();
      logger.error('TrueLayer token request failed', {
        status: res.status,
        body: text,
      });
      throw new Error('TrueLayer token request failed');
    }

    return (await res.json()) as TLToken;
  }

  private async authorizedGet<T>(accessToken: string, url: string): Promise<T> {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const text = await res.text();
      logger.warn('TrueLayer GET failed', {
        status: res.status,
        body: text,
        url,
      });
      throw new Error('TrueLayer request failed');
    }
    return (await res.json()) as T;
  }

  async getAccounts(accessToken: string): Promise<TLAccount[]> {
    const data = await this.authorizedGet<{ results: TLAccount[] }>(
      accessToken,
      `${this.apiBase}/data/v1/accounts`,
    );
    return data.results || [];
  }

  async getBalance(
    accessToken: string,
    accountId: string,
  ): Promise<number | null> {
    const data = await this.authorizedGet<{
      results: Array<{ currency: string; available: number }>;
    }>(accessToken, `${this.apiBase}/data/v1/accounts/${accountId}/balance`);
    const first = data.results?.[0];
    return first ? first.available : null;
  }

  async getTransactions(
    accessToken: string,
    accountId: string,
    from?: string,
    to?: string,
  ): Promise<TLTransaction[]> {
    const params = new URLSearchParams();
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const data = await this.authorizedGet<{ results: TLTransaction[] }>(
      accessToken,
      `${this.apiBase}/data/v1/accounts/${accountId}/transactions${qs}`,
    );
    return data.results || [];
  }

  async createPayment(
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
  ): Promise<TLPaymentCreateResponse> {
    const body = {
      amount_in_minor: Math.round(amount * 100),
      currency,
      reference,
      beneficiary: {
        type: 'external',
        name: beneficiary.name,
        iban: beneficiary.iban,
        sort_code: beneficiary.sortCode,
        account_number: beneficiary.accountNumber,
      },
    };

    const res = await fetch(`${this.apiBase}/payments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      logger.error('TrueLayer payment create failed', {
        status: res.status,
        body: text,
      });
      throw new Error('TrueLayer payment create failed');
    }

    return (await res.json()) as TLPaymentCreateResponse;
  }

  async getPaymentStatus(
    accessToken: string,
    paymentId: string,
  ): Promise<TLPaymentStatus> {
    const data = await this.authorizedGet<{ results: TLPaymentStatus[] }>(
      accessToken,
      `${this.apiBase}/payments/${paymentId}`,
    );
    const first = data.results?.[0];
    if (!first) {
      throw new Error('Payment status not found');
    }
    return first;
  }
}
