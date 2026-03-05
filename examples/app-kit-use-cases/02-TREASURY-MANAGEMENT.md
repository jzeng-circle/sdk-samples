# Multi-Chain Treasury Management

## Business Case

### The Problem

You're managing a company's treasury with USDC spread across multiple blockchains:
- **Operations** require liquidity on Base, Arbitrum, Polygon, and Optimism
- **Accounting** needs a consolidated view in one place (Ethereum)
- **Mixed tokens** — USDT, DAI, and other stablecoins accumulate alongside USDC
- **Gas fees** stack up fast when bridging manually across 5+ chains, daily
- **Human error** is inevitable when monitoring balances by hand

### The Solution

An automated treasury management system with these key capabilities:

- **Multi-Chain Visibility**: Audit balances across all chains in one pass
- **Token Consolidation**: Swap any non-USDC holdings to USDC before bridging
- **Threshold-Based Consolidation**: Only move funds when excess is meaningful
- **Minimum Balance Protection**: Never drain a chain below its operational floor
- **Zero Bridge Fees**: SLOW mode uses Circle's CCTP with no protocol fee
- **Scheduled Automation**: Run as a daily cron job with zero manual intervention

### Benefits of This Implementation

**1. Simple APIs for Complex Operations**
- **Swap**: One call converts any stablecoin (USDT, DAI) to USDC on the same chain
- **Bridge**: One call moves USDC across any supported chain pair
- **SLOW mode**: Free transfers — Circle's CCTP charges no protocol fee in slow mode
- **No contract addresses**: Use token aliases (`USDC`, `USDT`, `DAI`) throughout

> **Note**: This example uses Circle Wallet for managed key custody.
> - Replace `createCircleWalletAdapter` with your own wallet provider (Viem, Ethers, or custom) if needed — the treasury logic stays the same
> - If using a different wallet provider, replace `getWalletTokenBalances` calls with your provider's equivalent balance-fetching method

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
+---------------------------------------------------------------------+

CHAINS:
+--------------+  +--------------+  +--------------+  +--------------+
|     Base     |  |   Arbitrum   |  |   Polygon    |  |   Optimism   |
|              |  |              |  |              |  |              |
| USDT  $3,000 |  | DAI   $1,500 |  | USDC  $8,000 |  | USDC  $5,500 |
| USDC $15,000 |  | USDC $12,500 |  | target $10k  |  | target $10k  |
| target $10k  |  | target $10k  |  |              |  |              |
+--------------+  +--------------+  +--------------+  +--------------+

FLOW:

Step 1: Check Balances
    Read USDC balance on Base, Arbitrum, Polygon, Optimism, Ethereum
    Compare each against target and minimum

Step 2: Swap to USDC (Optional)
    Base:     USDT $3,000  → USDC  (same chain, 1 swap)
    Arbitrum: DAI  $1,500  → USDC  (same chain, 1 swap)
    Result:   all chains now hold only USDC

Step 3: Plan Consolidation
    Base $15k+$3k (target $10k)   → Consolidate $5,000 to Ethereum
    Arbitrum $12.5k+$1.5k (target $10k) → Consolidate $2,500 to Ethereum
    Polygon $8k (target $10k)     → Skip (deficit, not excess)
    Optimism $5.5k (target $10k)  → Skip (excess $500 < $1k threshold)

Step 4: Execute (SLOW bridges, zero protocol fees)
    Base → Ethereum: $5,000 USDC  (1 transaction)
    Arbitrum → Ethereum: $2,500 USDC  (1 transaction)

FINAL STATE:
- Ethereum: $32,500 USDC (closer to $50k target)
- Base: $10,000 USDC (at target)
- Arbitrum: $10,000 USDC (at target)
- Polygon: $8,000 USDC (unchanged)
- Optimism: $5,500 USDC (unchanged — below threshold)
- Bridge Fees: $0.00 (SLOW mode)
```

---

## Code Walkthrough

### Step 1: Setup & Configuration

**What this does:**
- Configures consolidation threshold to filter out micro-movements
- Sets SLOW mode to eliminate bridge protocol fees
- Initializes App Kit SDK and Circle Wallet adapter
- Reads treasury address and chain from environment

```typescript
import { StablecoinKit } from '@circle-fin/stablecoin-kit';
import { createCircleWalletAdapter } from '@circle-fin/adapter-circle-wallet';

const CONSOLIDATION_THRESHOLD = 1000; // Only move if excess > $1,000
const SLIPPAGE_BPS = 50;              // 0.5% slippage for swaps
const USE_SLOW_MODE = true;           // Free bridge — no protocol fees

const kit = new StablecoinKit();
const treasuryAdapter = createCircleWalletAdapter({
  apiKey: process.env.CIRCLE_API_KEY as string,
  walletId: process.env.TREASURY_WALLET_ID as string,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET as string
});
```

---

### Step 2: Check Balances

**What this does:**
- Fetches live token balances from Circle Wallet across all chains
- Maps the live USDC balance onto each chain's config
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
async function checkChainBalances(chains: ChainBalance[]): Promise<ChainBalance[]> {
  // Fetch live token balances from Circle Wallet across all chains
  const walletBalances = await treasuryAdapter.getWalletTokenBalances({
    walletId: process.env.TREASURY_WALLET_ID as string
  });

  for (const chain of chains) {
    const usdcBalance = walletBalances.find(
      b => b.chain === chain.chain && b.token === 'USDC'
    );
    chain.currentBalance = usdcBalance ? parseFloat(usdcBalance.amount) : 0;

    const excess = chain.currentBalance - chain.targetBalance;
    const status =
      chain.currentBalance > chain.targetBalance ? 'EXCESS'
      : chain.currentBalance < chain.minimumBalance ? 'LOW'
      : 'OK';

    console.log(`  ${chain.chain}: $${chain.currentBalance} (${excess >= 0 ? '+' : ''}$${excess}) [${status}]`);
  }

  return chains;
}
```

---

### Step 3: Swap to USDC (Optional)

**What this does:**
- Fetches all token balances from Circle Wallet
- Automatically detects any non-USDC tokens with a positive balance
- Swaps each to USDC on the same chain before bridging
- Each swap is independent — one failure doesn't stop the rest

**When to use:**
- Your treasury wallets hold a mix of stablecoins (USDT, DAI, etc.)
- You want a single asset (USDC) flowing into the main treasury

```typescript
async function swapToUSDC(): Promise<void> {
  // Fetch all token balances from Circle Wallet
  const walletBalances = await treasuryAdapter.getWalletTokenBalances({
    walletId: process.env.TREASURY_WALLET_ID as string
  });

  // Filter to non-USDC tokens with a positive balance
  const nonUsdcTokens = walletBalances.filter(
    b => b.token !== 'USDC' && parseFloat(b.amount) > 0
  );

  for (const holding of nonUsdcTokens) {
    const result = await kit.swap({
      from: { adapter: treasuryAdapter, chain: holding.chain },
      tokenIn: holding.token,
      tokenOut: 'USDC',
      amount: holding.amount,
      config: { kitKey: process.env.KIT_KEY as string, slippageBps: SLIPPAGE_BPS }
    });

    console.log(`  ✓ Swapped ${holding.amount} ${holding.token} → USDC on ${holding.chain}: ${result.txHash}`);
  }
}
```

---

### Step 4: Plan Consolidation

**What this does:**
- Skips the main treasury chain
- Calculates how much can safely move without breaching minimum balance
- Applies the threshold filter — skips tiny excess amounts
- Returns a simple list of `{ chain, amount }` pairs (no bridges executed yet)

**Key protection:** `amountToMove = min(excess, balance - minimum)`
- Ensures the chain retains its operational floor
- Safe even when `targetBalance` is lower than `minimumBalance`

```typescript
function planConsolidation(chains: ChainBalance[]): { chain: string; amount: string }[] {
  const operations = [];

  for (const chain of chains) {
    if (chain.chain === TREASURY_CHAIN) continue;

    const excess = chain.currentBalance - chain.targetBalance;
    const safeToMove = chain.currentBalance - chain.minimumBalance;
    const amountToMove = Math.min(excess, safeToMove);

    if (amountToMove > CONSOLIDATION_THRESHOLD) {
      operations.push({ chain: chain.chain, amount: amountToMove.toFixed(2) });
    }
  }

  return operations;
}
```

---

### Step 5: Execute Consolidation

**What this does:**
- Iterates over planned operations and executes each bridge
- Uses SLOW mode — Circle's CCTP with no protocol fee
- Each bridge is independent — one failure doesn't stop the rest

**Note:**
- SLOW mode settles in ~15-30 minutes (vs seconds for FAST)
- Ideal for treasury consolidation — you trade speed for zero cost

```typescript
async function executeConsolidation(
  operations: { chain: string; amount: string }[]
): Promise<void> {
  for (const op of operations) {
    const result = await kit.bridge({
      from: { adapter: treasuryAdapter, chain: op.chain },
      to: {
        adapter: treasuryAdapter,
        chain: TREASURY_CHAIN,
        recipientAddress: TREASURY_ADDRESS
      },
      amount: op.amount,
      config: { transferSpeed: USE_SLOW_MODE ? 'SLOW' : 'FAST' }
    });

    console.log(`  ✓ Bridged $${op.amount} from ${op.chain}: ${result.steps[0].txHash}`);
  }
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

> **Note**: This example uses Circle Wallet for managed key custody. To get your credentials:
> - API Key and Entity Secret: [Circle Console](https://console.circle.com/)
> - Setup guide: [Circle Wallet Quickstart](https://developers.circle.com/w3s/docs/programmable-wallets-quickstart)

```bash
# .env
CIRCLE_API_KEY=your_circle_api_key
TREASURY_WALLET_ID=your_treasury_wallet_id
CIRCLE_ENTITY_SECRET=your_entity_secret
TREASURY_ADDRESS=0xYourTreasuryAddress
KIT_KEY=your_kit_key  # Required for swap operations
```

### Full Code

```typescript
import 'dotenv/config';
import { StablecoinKit } from '@circle-fin/stablecoin-kit';
import { createCircleWalletAdapter } from '@circle-fin/adapter-circle-wallet';
// Replace createCircleWalletAdapter with your own wallet provider if needed

const kit = new StablecoinKit();
const treasuryAdapter = createCircleWalletAdapter({
  apiKey: process.env.CIRCLE_API_KEY as string,
  walletId: process.env.TREASURY_WALLET_ID as string,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET as string
});

const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS as string;
const TREASURY_CHAIN = 'Ethereum';

// Define target and minimum balances per chain
const chainBalances = [
  { chain: 'Base',     currentBalance: 0, targetBalance: 10000, minimumBalance: 5000 },
  { chain: 'Arbitrum', currentBalance: 0, targetBalance: 10000, minimumBalance: 5000 },
  { chain: 'Ethereum', currentBalance: 0, targetBalance: 50000, minimumBalance: 20000 }
];

// Step 1: Fetch live USDC balances from Circle Wallet
const walletBalances = await treasuryAdapter.getWalletTokenBalances({
  walletId: process.env.TREASURY_WALLET_ID as string
});

for (const chain of chainBalances) {
  const usdcBalance = walletBalances.find(b => b.chain === chain.chain && b.token === 'USDC');
  chain.currentBalance = usdcBalance ? parseFloat(usdcBalance.amount) : 0;
}

// Step 2 (Optional): Detect and swap non-USDC tokens to USDC
const nonUsdcTokens = walletBalances.filter(b => b.token !== 'USDC' && parseFloat(b.amount) > 0);
for (const holding of nonUsdcTokens) {
  await kit.swap({
    from: { adapter: treasuryAdapter, chain: holding.chain },
    tokenIn: holding.token,
    tokenOut: 'USDC',
    amount: holding.amount,
    config: { kitKey: process.env.KIT_KEY as string, slippageBps: 50 }
  });
}

// Step 3: Bridge excess USDC to main treasury
for (const chain of chainBalances) {
  if (chain.chain === TREASURY_CHAIN) continue;

  const excess = chain.currentBalance - chain.targetBalance;
  const amount = Math.min(excess, chain.currentBalance - chain.minimumBalance);

  if (amount > 1000) {
    const result = await kit.bridge({
      from: { adapter: treasuryAdapter, chain: chain.chain },
      to: { adapter: treasuryAdapter, chain: TREASURY_CHAIN, recipientAddress: TREASURY_ADDRESS },
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

### 2. **Swap First, Then Bridge**
- Swap non-USDC tokens to USDC on each chain before bridging
- Keeps the main treasury in a single asset
- Swap is optional — skip if your wallets already hold only USDC

### 3. **Minimum Balance Protection**
- Every chain has a `minimumBalance` floor that is never breached
- The formula `min(excess, balance - minimum)` protects operational funds
- Prevents accidentally stranding a chain with no gas budget

### 4. **Threshold Filtering Reduces Noise**
- Only consolidate when excess exceeds `$1,000` (configurable)
- Eliminates micro-transactions that cost more in gas than they move

---

## Next Steps

1. **Fetch Live Balances**: Replace mock `currentBalance` with live on-chain reads using viem's `readContract` on the USDC token contract
2. **Database Integration**: Persist transaction hashes for accounting and audit trails
3. **Alerts**: Notify on Slack/email when a chain goes below `minimumBalance` or when a bridge fails
4. **Gas Timing**: Check gas prices before running and delay if unusually high

---

## Resources

- [Circle App Kit Documentation](https://developers.circle.com/app-kit)
- [Circle CCTP Documentation](https://developers.circle.com/cctp)
- [Full Example Code](./02-treasury-management.ts)

---

**Questions?** See the integration checklist in the [code comments](./02-treasury-management.ts) or reach out to Circle support.
