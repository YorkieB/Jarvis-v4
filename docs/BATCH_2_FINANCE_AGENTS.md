# Personal Finance Agents (Batch 2)

This document provides an overview of the 5 personal finance agents implemented in Batch 2.

## 🏦 Finance Agent

**Location:** `src/agents/finance/index.ts`

**Responsibilities:**
- Transaction tracking and categorization
- Budget creation and monitoring
- Spending analysis
- Budget threshold alerts

**Key Features:**
- **Auto-categorization:** Automatically categorizes transactions based on keywords (groceries, dining, transportation, etc.)
- **Budget Management:** Create and track budgets by category (monthly, weekly, yearly)
- **Spending Analysis:** Get spending breakdown by category over any date range
- **Threshold Alerts:** Automatically triggers warnings when budgets reach 80%+ usage

**Example Usage:**
```typescript
const financeAgent = new FinanceAgent();

// Add a transaction
await financeAgent.addTransaction({
  userId: 'user123',
  amount: -50.00,
  description: 'Whole Foods Market',
  date: new Date()
});
// Automatically categorized as 'groceries'

// Create a budget
await financeAgent.createBudget({
  userId: 'user123',
  category: 'groceries',
  amount: 500,
  period: 'monthly'
});

// Get spending by category
const spending = await financeAgent.getSpendingByCategory(
  'user123',
  startDate,
  endDate
);
```

---

## 💰 Savings Agent

**Location:** `src/agents/savings/index.ts`

**Responsibilities:**
- Savings goal tracking
- Safe monthly amount calculation
- Savings opportunity detection
- Goal progress monitoring

**Key Features:**
- **Goal Creation:** Set savings goals with target amounts and dates
- **Safe Amount Calculation:** Calculates a safe monthly savings amount (70% of surplus)
- **Opportunity Detection:** Identifies when you're spending less than usual
- **Progress Tracking:** Monitors goal completion with projected dates

**Example Usage:**
```typescript
const savingsAgent = new SavingsAgent();

// Create a savings goal
await savingsAgent.createGoal({
  userId: 'user123',
  name: 'Vacation Fund',
  targetAmount: 2000,
  targetDate: new Date('2026-07-01'),
  priority: 'high'
});

// Calculate safe monthly savings amount
const safeAmount = await savingsAgent.calculateSafeMonthlyAmount('user123');
console.log(`You can safely save $${safeAmount.toFixed(2)} per month`);

// Detect savings opportunities
const opportunity = await savingsAgent.detectSavingsOpportunity('user123');
if (opportunity.hasOpportunity) {
  console.log(`💡 ${opportunity.reason}`);
  console.log(`You could save an extra $${opportunity.amount.toFixed(2)}`);
}

// Track goal progress
const progress = await savingsAgent.getGoalProgress(goalId);
console.log(`${progress.percentComplete.toFixed(0)}% complete`);
console.log(`On track: ${progress.onTrack}`);
```

---

## 📊 Insights Agent

**Location:** `src/agents/insights/index.ts`

**Responsibilities:**
- Spending pattern analysis
- Recurring expense detection
- Spending spike identification
- Category trend analysis

**Key Features:**
- **Recurring Expenses:** Detects expenses that occur 3+ times in 6 months
- **Spending Spikes:** Identifies months with unusually high spending (1.5σ above average)
- **Trend Analysis:** Tracks category spending increases over time (20%+ changes)
- **Actionable Recommendations:** Provides specific suggestions for each insight

**Example Usage:**
```typescript
const insightsAgent = new InsightsAgent();

// Analyze spending patterns
const insights = await insightsAgent.analyzeSpendingPatterns('user123');

for (const insight of insights) {
  console.log(`📈 ${insight.title}`);
  console.log(`   ${insight.description}`);
  if (insight.actionable) {
    console.log(`   💡 ${insight.recommendation}`);
  }
}
```

**Sample Output:**
```
📈 Recurring Expense Detected
   You spend about $12.99 on "Netflix" regularly (6 times in 6 months = $77.94 total)
   💡 Consider setting up a budget category for this recurring expense

📈 dining Spending Increasing
   Your dining spending has increased 35% over the past few months
   💡 Consider reviewing your dining expenses for optimization opportunities
```

---

## 🔔 Alert Agent

**Location:** `src/agents/alert/index.ts`

**Responsibilities:**
- Proactive notifications
- Budget threshold warnings
- Unusual activity detection
- Goal milestone celebrations

**Key Features:**
- **Budget Alerts:** Warns at 90% budget usage, critical alert at 100%+
- **Large Transaction Detection:** Flags transactions over $500
- **Goal Milestones:** Celebrates 25%, 50%, 75%, and 100% goal completion
- **Periodic Monitoring:** Checks all alerts every hour

**Example Usage:**
```typescript
const alertAgent = new AlertAgent();

// Start monitoring for a user
await alertAgent.startMonitoring('user123');
```

**Alert Types:**
- `budget_warning` (Severity: high) - 90%+ budget usage
- `budget_exceeded` (Severity: critical) - Over budget
- `large_transaction` (Severity: medium) - Transaction > $500
- `goal_milestone` (Severity: low) - Savings goal milestone reached

---

## 🔒 Privacy Agent

**Location:** `src/agents/privacy/index.ts`

**Responsibilities:**
- PII encryption for financial data
- Data export (GDPR compliance)
- Data deletion (right to erasure)
- Privacy settings management
- Audit log access

**Key Features:**
- **Data Encryption:** AES-256-CBC encryption for sensitive data
- **GDPR Article 20:** Right to data portability - export all user data
- **GDPR Article 17:** Right to erasure - complete data deletion
- **Privacy Settings:** Configurable data retention, analytics, and personalization
- **Audit Trail:** Complete audit log for data access and destructive actions

**Example Usage:**
```typescript
const privacyAgent = new PrivacyAgent();

// Encrypt sensitive data
const encrypted = privacyAgent.encryptData('4111-1111-1111-1111');
// Decrypt when needed
const decrypted = privacyAgent.decryptData(encrypted);

// Export all user data (GDPR Article 20)
const userData = await privacyAgent.exportUserData('user123');
// Returns: { user, transactions, budgets, goals, conversations, alerts }

// Delete all user data (GDPR Article 17)
await privacyAgent.deleteUserData('user123', 'DELETE_user123');
// Requires confirmation token to prevent accidental deletion

// Update privacy settings
await privacyAgent.updatePrivacySettings('user123', {
  dataRetentionDays: 365,
  allowAnalytics: false,
  allowPersonalization: true
});

// Get audit log
const logs = await privacyAgent.getAuditLog(
  'user123',
  startDate,
  endDate
);
```

---

## 🗄️ Database Schema

All agents use Prisma ORM with SQLite (can be switched to PostgreSQL in production).

**Models:**
- `User` - User accounts
- `Transaction` - Financial transactions
- `Budget` - Budget allocations
- `SavingsGoal` - Savings goals
- `Alert` - User alerts
- `PrivacySettings` - Privacy preferences
- `DestructiveAction` - Audit trail for deletions
- `AuditLog` - Complete action history
- `Conversation` - Chat history
- `Message` - Individual messages
- `Session` - User sessions

**Database Commands:**
```bash
# Generate Prisma client
npm run db:generate

# Push schema to database
npm run db:push

# Create migration
npm run db:migrate

# Open Prisma Studio
npm run db:studio
```

---

## 🧪 Testing

**Integration Tests:** `tests/integration/finance.test.ts`

```bash
# Run all tests
npm test

# Run integration tests only
npm run test:integration

# Run full test suite (type-check + lint + tests)
npm run test:all
```

**Test Coverage:**
- ✅ Transaction auto-categorization
- ✅ Budget creation and tracking
- ✅ Spending by category queries
- ✅ Savings goal creation
- ✅ Safe monthly amount calculation
- ✅ Goal progress tracking

---

## 🚀 Deployment

**PM2 Configuration:** `ecosystem.config.cjs`

```bash
# Start all finance agents
pm2 start ecosystem.config.cjs

# Monitor agents
pm2 status

# View logs
pm2 logs finance-agent
pm2 logs savings-agent
pm2 logs insights-agent
pm2 logs alert-agent
pm2 logs privacy-agent

# Restart all
pm2 restart all

# Stop all
pm2 stop all
```

---

## 🔐 Security

All agents follow **AI_RULES_MANDATORY.md**:
- ✅ Extend `BaseAgent` class
- ✅ Declare permissions explicitly (least privilege)
- ✅ Use `accessResource()` for data access
- ✅ Audit logging for all operations
- ✅ Rules acknowledgment before any action

**Encryption:**
- AES-256-CBC for sensitive data
- Encryption key from `process.env.ENCRYPTION_KEY`
- Random IV for each encryption

**Privacy:**
- GDPR compliant
- Data portability
- Right to erasure
- Audit trail for destructive actions

---

## 📝 Next Steps

**Batch 3: Computer Control (5 agents)**
- Windows Control - System automation
- Browser Control - Web automation  
- Document Control - Word processing
- Email Control - Gmail/Outlook
- Calendar Control - Google Calendar

**Batch 4: Creative Media (4 agents)**
- Music Generation - AI music creation
- Image Generation - SDXL images
- Podcast Generation - Multi-voice podcasts
- Creative Memory - Personalization
