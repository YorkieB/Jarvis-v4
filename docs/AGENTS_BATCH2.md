# Batch 2: Personal Finance Agents (with TrueLayer)

## Agents
- **FinanceAgent** (`src/agents/finance/index.ts`): sync accounts/transactions from TrueLayer.
- **AlertAgent** (`src/agents/alert/index.ts`): high-spend alerts on new transactions.

## Services
- **TrueLayerClient** (`src/services/truelayerClient.ts`): OAuth, token refresh, accounts, transactions, payments.
- **FinanceService** (`src/services/financeService.ts`): upsert accounts/transactions into Prisma.
- **PaymentService** (`src/services/paymentService.ts`): initiate payments, update status.

## Prisma Models (added)
- `BankConnection`: stores TL tokens per user.
- `Account`: linked to `BankConnection`, holds balances/meta.
- `Payment`: provider payment tracking.
- `Transaction`: now links to `Account`.

## API Endpoints
- `GET /api/truelayer/auth?userId=...` → returns auth URL (PKCE + state).
- `GET /api/truelayer/callback` → exchanges code, stores `BankConnection`.
- `POST /api/truelayer/sync` → `{ bankConnectionId, from?, to? }` syncs accounts+transactions.
- `POST /api/truelayer/payments` → `{ bankConnectionId, amount, currency, reference?, beneficiary:{name,iban|sortCode+accountNumber}}`.
- `GET /api/truelayer/payments/:id` → payment status.

## Environment Variables
- `TRUELAYER_CLIENT_ID`
- `TRUELAYER_CLIENT_SECRET`
- `TRUELAYER_REDIRECT_URI` (e.g., `http://localhost:3000/api/truelayer/callback`)
- `TRUELAYER_API_BASE` (optional override)
- `TRUELAYER_AUTH_BASE` (optional override)
- `ALERT_HIGH_SPEND_THRESHOLD` (optional, default 500)

## Flow
1) Call `/api/truelayer/auth` → redirect user to TL consent screen.
2) TL redirects to `/api/truelayer/callback` → tokens stored in `BankConnection`.
3) Call `/api/truelayer/sync` to import accounts/transactions.
4) Create payments via `/api/truelayer/payments` and poll `/payments/:id`.

## Notes
- Tokens refresh automatically when expiring (<60s).
- Webhooks not implemented; payment status uses polling on request.
- Privacy: tokens stored plaintext; add encryption at rest if required.
