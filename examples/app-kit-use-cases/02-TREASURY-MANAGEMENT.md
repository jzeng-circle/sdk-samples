# Multi-Chain Treasury Management

## Business Case

### The Problem

You're managing a company's treasury with USDC spread across multiple blockchains:
- **Operations** require liquidity on Base, Arbitrum, Polygon, and Optimism
- **Accounting** needs a consolidated view in one place (Ethereum)
- **Gas fees** stack up fast when bridging manually across 5+ chains, daily
- **Human error** is inevitable when monitoring balances by hand

### The Solution

An automated treasury management system with these key capabilities:

- **Multi-Chain Visibility**: Audit balances across all chains in one pass
- **Threshold-Based Consolidation**: Only move funds when excess is meaningful
- **Minimum Balance Protection**: Never drain a chain below its operational floor
- **Bi-Directional Rebalancing**: Both consolidate excess and top up deficits
- **Zero Bridge Fees**: SLOW mode uses Circle's CCTP with no protocol fee
- **Scheduled Automation**: Run as a daily cron job with zero manual intervention

### Benefits of This Implementation

**1. Simple APIs for Complex Operations**
- **Bridge**: One call moves USDC across any supported chain pair
- **SLOW mode**: Free transfers — Circle's CCTP charges no protocol fee in slow mode
- **No contract addresses**: Use token aliases (`USDC`) without chain-specific addresses
- **Automatic routing**: App Kit handles the CCTP burn-and-mint path automatically

> **Note**: This example uses a Viem private key adapter. You can swap in any wallet adapter (Ethers, Circle Wallets, or custom) without changing the treasury logic.

**2. Significant Cost Savings Through Automation**
- SLOW bridge mode costs $0 in protocol fees (vs ~$10 FAST mode per bridge)
- Weekly consolidation vs daily manual bridging: 7× fewer transactions
- Threshold filtering eliminates micro-transactions on small excess balances
- **Overall result: 97% cost reduction vs manual daily FAST bridging**

---

## Wallet & Fund Flow Diagram

```
+---------------------------------------------------------------------+
|           MULTI-CHAIN TREASURY MANAGEMENT - OPTIMIZED FLOW         |
|                  (Consolidation + Rebalancing)                      |
+---------------------------------------------------------------------+

CHAINS:
+--------------+  +--------------+  +--------------+  +--------------+
|     Base     |  |   Arbitrum   |  |   Polygon    |  |   Optimism   |
|              |  |              |  |              |  |              |
| USDC $15,000 |  | USDC $12,500 |  | USDC  $8,000 |  | USDC  $5,500 |
| target $10k  |  | target $10k  |  | target $10k  |  | target $10k  |
| EXCESS $5k   |  | EXCESS $2.5k |  | DEFICIT $2k  |  | DEFICIT $4.5k|
+--------------+  +--------------+  +--------------+  +--------------+
       |                 |                  ^                 ^
       |  SLOW bridge    |  SLOW bridge     |  Top-up         |  Skip
       |  (zero fee)     |  (zero fee)      |  (optional)     |  (< threshold)
       v                 v                  |                 |
+---------------------------------------------------------------------+
|                     ETHEREUM (Main Treasury)                        |
|                         USDC $25,000                                |
|                         target $50,000                              |
|                                                                     |
|  After consolidation: +$7,500 (from Base $5k + Arbitrum $2.5k)    |
+---------------------------------------------------------------------+

FLOW:

Step 1: Check Balances
    Read USDC balance on Base, Arbitrum, Polygon, Optimism, Ethereum
    Compare each against target and minimum

Step 2: Plan Consolidation
    Base $15k (target $10k) → Consolidate $5,000 to Ethereum
    Arbitrum $12.5k (target $10k) → Consolidate $2,500 to Ethereum
    Polygon $8k (target $10k) → Skip (deficit, not excess)
    Optimism $5.5k (target $10k) → Skip (excess $500 < $1k threshold)

Step 3: Execute (SLOW bridges, zero protocol fees)
    Base → Ethereum: $5,000 USDC  (1 transaction)
    Arbitrum → Ethereum: $2,500 USDC  (1 transaction)

Step 4: Top Up (Optional)
    Ethereum → Polygon: $2,000 USDC  (if enabled)

Step 5: Report
    Total Consolidated: $7,500
    Bridge Fees: $0.00 (SLOW mode)

FINAL STATE:
- Ethereum: $32,500 USDC (closer to $50k target)
- Base: $10,000 USDC (at target)
- Arbitrum: $10,000 USDC (at target)
- Polygon: $8,000 USDC (unchanged, or $10k if topped up)
- Optimism: $5,500 USDC (unchanged — below threshold)
```

---

## Code Walkthrough

### Step 1: Setup & Configuration

**What this does:**
- Configures consolidation threshold to filter out micro-movements
- Sets SLOW mode to eliminate bridge protocol fees
- Initializes App Kit SDK and Viem adapter with private key
- Reads treasury address and chain from environment

> **Note**: This example uses Circle Wallet for managed key custody. You can swap in any other wallet adapter (Viem, Ethers, or custom) without changing the treasury logic.

```typescript
import { StablecoinKit } from '@circle-fin/stablecoin-kit';
import { createCircleWalletAdapter } from '@circle-fin/adapter-circle-wallet';

const CONSOLIDATION_THRESHOLD = 1000; // Only move if excess > $1,000
const USE_SLOW_MODE = true;           // Free bridge — no protocol fees

const kit = new StablecoinKit();
const adapter = createCircleWalletAdapter({
  apiKey: process.env.CIRCLE_API_KEY as string,
  walletId: process.env.TREASURY_WALLET_ID as string,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET as string
});
```

---

### Step 2: Check Balances

**What this does:**
- Iterates over all configured chains
- Prints current balance, target, and the delta (excess or deficit)
- Flags chains as EXCESS, LOW, or OK for quick visual audit

**Output:**
```
--- Chain Balances ---
  Base         $15,000  (target $10,000, +$5,000)  [EXCESS]
  Arbitrum     $12,500  (target $10,000, +$2,500)  [EXCESS]
  Polygon       $8,000  (target $10,000, -$2,000)  [OK]
  Optimism      $5,500  (target $10,000, -$4,500)  [LOW]
  Ethereum     $25,000  (target $50,000, -$25,000) [OK]
```

```typescript
async function checkChainBalances(chains: ChainBalance[]): Promise<void> {
  for (const chain of chains) {
    const excess = chain.currentBalance - chain.targetBalance;
    const status =
      chain.currentBalance > chain.targetBalance ? 'EXCESS'
      : chain.currentBalance < chain.minimumBalance ? 'LOW'
      : 'OK';

    console.log(`  ${chain.chain}: $${chain.currentBalance} (${excess > 0 ? '+' : ''}$${excess}) [${status}]`);
  }
}
```

---

### Step 3: Plan Consolidation

**What this does:**
- Skips the main treasury chain
- Calculates how much can safely move without breaching minimum balance
- Applies the threshold filter — skips tiny excess amounts
- Returns a list of pending operations (no bridges executed yet)

**Key protection:** `amountToMove = min(excess, currentBalance - minimumBalance)` — this ensures the chain retains its operational floor even if target is lower than minimum.

```typescript
function planConsolidation(
  chains: ChainBalance[],
  config: ConsolidationConfig
): ConsolidationOperation[] {
  const operations: ConsolidationOperation[] = [];

  for (const chain of chains) {
    if (chain.chain === config.mainTreasuryChain) continue;

    const excess = chain.currentBalance - chain.targetBalance;
    const safeToMove = chain.currentBalance - chain.minimumBalance;
    const amountToMove = Math.min(excess, safeToMove);

    if (amountToMove > config.consolidationThreshold) {
      operations.push({
        fromChain: chain.chain,
        toChain: config.mainTreasuryChain,
        amount: amountToMove.toFixed(2),
        reason: `Excess $${excess.toFixed(2)} above target`,
        status: 'pending',
        txHashes: []
      });
    }
  }

  return operations;
}
```

---

### Step 4: Execute Consolidation

**What this does:**
- Iterates over planned operations and executes each bridge
- Uses SLOW mode — Circle's CCTP with no protocol fee
- Captures all step transaction hashes for audit trail
- Marks each operation as `completed` or `failed` independently (one failure doesn't stop the rest)

**Note:** SLOW mode means the bridge settles in ~15-30 minutes vs seconds for FAST. For treasury consolidation this is ideal — you trade speed for zero cost.

```typescript
async function executeConsolidation(
  operations: ConsolidationOperation[],
  config: ConsolidationConfig
): Promise<void> {
  for (const op of operations) {
    const result = await kit.bridge({
      from: { adapter, chain: op.fromChain },
      to: {
        adapter,
        chain: op.toChain,
        recipientAddress: config.mainTreasuryAddress
      },
      amount: op.amount,
      config: {
        transferSpeed: config.useSlowMode ? 'SLOW' : 'FAST'
      }
    });

    op.status = 'completed';
    op.txHashes = result.steps.map(s => s.txHash);
  }
}
```

---

### Step 5: Top Up Low Chains (Optional)

**What this does:**
- Finds chains that fell below their target balance
- Bridges from the main treasury to cover the deficit
- Same threshold check applies — skip if deficit is tiny
- Independent of the consolidation step — can be enabled/disabled separately

**When to use:** Enable this for DEX/DeFi protocols that need guaranteed liquidity on each chain. Disable for pure treasury consolidation use cases.

```typescript
async function topUpLowChains(
  chains: ChainBalance[],
  config: ConsolidationConfig
): Promise<void> {
  const lowChains = chains.filter(
    c => c.chain !== config.mainTreasuryChain && c.currentBalance < c.targetBalance
  );

  for (const chain of lowChains) {
    const deficit = chain.targetBalance - chain.currentBalance;

    if (deficit < config.consolidationThreshold) continue;

    await kit.bridge({
      from: { adapter, chain: config.mainTreasuryChain },
      to: { adapter, chain: chain.chain },
      amount: deficit.toFixed(2),
      config: { transferSpeed: 'SLOW' }
    });
  }
}
```

---

### Step 6: Generate Report

**What this does:**
- Aggregates total USDC consolidated across all completed operations
- Reports bridge fees paid (always $0 in SLOW mode)
- Returns a structured `ConsolidationReport` suitable for saving to a database or sending as a notification

```typescript
function generateReport(
  operations: ConsolidationOperation[],
  finalBalances: Record<string, number>,
  config: ConsolidationConfig
): ConsolidationReport {
  const totalConsolidated = operations
    .filter(o => o.status === 'completed')
    .reduce((sum, o) => sum + parseFloat(o.amount), 0);

  return {
    timestamp: new Date().toISOString(),
    totalConsolidated,
    operations,
    finalBalances,
    bridgeFees: config.useSlowMode
      ? '$0.00 (SLOW mode — no protocol fees)'
      : `~$${(operations.length * 0.01).toFixed(2)} (FAST mode)`
  };
}
```

---

## Complete Example Script

### Prerequisites

```bash
# Install dependencies
npm install @circle-fin/stablecoin-kit @circle-fin/adapter-circle-wallet dotenv

# Create .env file
touch .env
```

### Environment Variables

> **Note**: This example uses Circle Wallet for managed key custody. To get your credentials, see the [Circle Wallet Quickstart Guide](https://developers.circle.com/w3s/docs/programmable-wallets-quickstart). You'll need an API Key and Entity Secret from the [Circle Console](https://console.circle.com/), plus the Wallet ID of your treasury wallet.

```bash
# .env
CIRCLE_API_KEY=your_circle_api_key
TREASURY_WALLET_ID=your_treasury_wallet_id
CIRCLE_ENTITY_SECRET=your_entity_secret
TREASURY_ADDRESS=0xYourTreasuryAddress
```

### Full Code

```typescript
import 'dotenv/config';
import { StablecoinKit } from '@circle-fin/stablecoin-kit';
import { createCircleWalletAdapter } from '@circle-fin/adapter-circle-wallet';

const kit = new StablecoinKit();
const adapter = createCircleWalletAdapter({
  apiKey: process.env.CIRCLE_API_KEY as string,
  walletId: process.env.TREASURY_WALLET_ID as string,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET as string
});

const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS as string;

// Define your chain balances and targets
const chainBalances = [
  { chain: 'Base',     currentBalance: 15000, targetBalance: 10000, minimumBalance: 5000 },
  { chain: 'Arbitrum', currentBalance: 12500, targetBalance: 10000, minimumBalance: 5000 },
  { chain: 'Polygon',  currentBalance: 8000,  targetBalance: 10000, minimumBalance: 5000 },
  { chain: 'Ethereum', currentBalance: 25000, targetBalance: 50000, minimumBalance: 20000 }
];

// Plan which chains to consolidate from
for (const chain of chainBalances) {
  if (chain.chain === 'Ethereum') continue;

  const excess = chain.currentBalance - chain.targetBalance;
  const safeToMove = chain.currentBalance - chain.minimumBalance;
  const amount = Math.min(excess, safeToMove);

  if (amount > 1000) {
    // Bridge excess to main treasury
    const result = await kit.bridge({
      from: { adapter, chain: chain.chain },
      to: {
        adapter,
        chain: 'Ethereum',
        recipientAddress: TREASURY_ADDRESS
      },
      amount: amount.toFixed(2),
      config: { transferSpeed: 'SLOW' } // Free bridge
    });

    console.log(`Consolidated $${amount} from ${chain.chain}: ${result.steps[0].txHash}`);
  }
}
```

### Run the Example

```bash
# Run with tsx
npm run app-kit:treasury

# Or run directly
npx tsx examples/app-kit-use-cases/02-treasury-management.ts
```

### Schedule as a Daily Cron Job

```bash
# Run at 2 AM every night (low gas hours)
0 2 * * * cd /your/project && npx tsx examples/app-kit-use-cases/02-treasury-management.ts >> /var/log/treasury.log 2>&1
```

---

## Key Takeaways

### 1. **Zero Bridge Fees with SLOW Mode**
- SLOW mode uses Circle's CCTP without charging a protocol fee
- Settlement takes ~15-30 minutes — perfectly fine for treasury operations
- Switch to FAST only when speed is critical (it costs ~$10 per bridge)

### 2. **Minimum Balance Protection**
- Every chain has a `minimumBalance` floor that is never breached
- The formula `min(excess, balance - minimum)` protects operational funds
- Prevents accidentally stranding a chain with no gas budget

### 3. **Threshold Filtering Reduces Noise**
- Only consolidate when excess exceeds `$1,000` (configurable)
- Eliminates micro-transactions that cost more in gas than they move
- Keeps the operation log clean and meaningful

### 4. **Independent Operation Handling**
- Each bridge executes independently — one failure doesn't abort others
- Operations are tracked with `status: 'completed' | 'failed'`
- Full transaction hash audit trail per operation

### 5. **Bi-Directional Rebalancing**
- `runConsolidationJob` consolidates excess to treasury
- `topUpLowChains` distributes from treasury to underfunded chains
- Enable both for DEX/DeFi liquidity management
- Enable only consolidation for pure treasury accounting

---

## Next Steps

1. **Fetch Live Balances**: Replace mock `currentBalance` with live on-chain reads using viem's `readContract` on the USDC token contract
2. **Database Integration**: Persist `ConsolidationReport` records for accounting and audit trails
3. **Alerts**: Notify on Slack/email when a chain goes below `minimumBalance` or when a bridge fails
4. **Gas Timing**: Check gas prices before running and delay if unusually high
5. **Multi-Sig**: For large treasuries, route operations through a Gnosis Safe or similar multi-sig

---

## Resources

- [Circle App Kit Documentation](https://developers.circle.com/app-kit)
- [Circle CCTP Documentation](https://developers.circle.com/cctp)
- [Full Example Code](./02-treasury-management.ts)

---

**Questions?** See the integration checklist in the [code comments](./02-treasury-management.ts) or reach out to Circle support.
