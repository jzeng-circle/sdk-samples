/**
 * Multi-Chain Treasury Management
 *
 * Flow:
 * 1. Check USDC balances across all chains
 * 2. (Optional) Swap non-USDC tokens to USDC on each chain
 * 3. Identify chains with excess funds above target
 * 4. Bridge excess to main treasury (SLOW mode for zero fees)
 *
 * Benefits: Zero bridge fees using SLOW mode, automated scheduling
 */

import 'dotenv/config';
import { StablecoinKit } from '@circle-fin/stablecoin-kit';
import { createCircleWalletAdapter } from '@circle-fin/adapter-circle-wallet';
// Note: createCircleWalletAdapter can be replaced with any wallet adapter
// (e.g., createViemAdapter, createEthersAdapter) depending on your wallet provider.

// ===========================
// TYPES
// ===========================

interface ChainBalance {
  chain: string;
  currentBalance: number;
  targetBalance: number;
  minimumBalance: number;
}

// ===========================
// CONFIGURATION
// ===========================

const CONSOLIDATION_THRESHOLD = 1000; // Only consolidate if excess > $1,000
const SLIPPAGE_BPS = 50;              // 0.5% slippage for swaps
const USE_SLOW_MODE = true;           // SLOW mode = free bridge (no protocol fees)

// ===========================
// INITIALIZATION
// ===========================

const kit = new StablecoinKit();

const treasuryAdapter = createCircleWalletAdapter({
  apiKey: process.env.CIRCLE_API_KEY as string,
  walletId: process.env.TREASURY_WALLET_ID as string,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET as string
});

const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS || '0xYourTreasuryAddress';
const TREASURY_CHAIN = 'Ethereum';

// ===========================
// STEP 1: CHECK BALANCES
// ===========================

async function checkChainBalances(chains: ChainBalance[]): Promise<{ token: string; chain: string; amount: string }[]> {
  console.log('\n--- Chain Balances ---');

  // Single call to fetch all token balances across all chains
  const allBalances = await treasuryAdapter.getWalletTokenBalances({
    walletId: process.env.TREASURY_WALLET_ID as string
  });

  for (const chain of chains) {
    const chainBalances = allBalances.filter(b => b.chain === chain.chain);
    chain.currentBalance = chainBalances.reduce(
      (sum, b) => sum + parseFloat(b.amount), 0
    );

    const excess = chain.currentBalance - chain.targetBalance;
    const status =
      chain.currentBalance > chain.targetBalance ? 'EXCESS'
      : chain.currentBalance < chain.minimumBalance ? 'LOW'
      : 'OK';

    const delta = excess >= 0 ? `+$${excess.toFixed(0)}` : `-$${Math.abs(excess).toFixed(0)}`;
    console.log(`  ${chain.chain.padEnd(12)} $${chain.currentBalance.toLocaleString().padStart(8)}  (target $${chain.targetBalance.toLocaleString()}, ${delta})  [${status}]`);
  }

  // Return all balances so Step 2 can reuse them without another API call
  return allBalances;
}

// ===========================
// STEP 2: SWAP TO USDC (Optional)
// Detect any non-USDC tokens in the wallet and swap them to USDC
// ===========================

async function swapToUSDC(walletBalances: { token: string; chain: string; amount: string }[]): Promise<void> {
  console.log('\n--- Swapping Tokens to USDC ---');

  // Filter to non-USDC tokens with a positive balance (reuses balances from Step 1)
  const nonUsdcTokens = walletBalances.filter(
    b => b.token !== 'USDC' && parseFloat(b.amount) > 0
  );

  if (nonUsdcTokens.length === 0) {
    console.log('  No non-USDC tokens found');
    return;
  }

  for (const holding of nonUsdcTokens) {
    console.log(`\n  Swapping ${holding.amount} ${holding.token} → USDC on ${holding.chain}`);

    try {
      const result = await kit.swap({
        from: { adapter: treasuryAdapter, chain: holding.chain },
        tokenIn: holding.token,
        tokenOut: 'USDC',
        amount: holding.amount,
        config: {
          kitKey: process.env.KIT_KEY as string,
          slippageBps: SLIPPAGE_BPS
        }
      });

      console.log(`  ✓ Swapped: ${result.txHash}`);
    } catch (error: any) {
      console.error(`  ✗ Failed: ${error.message}`);
    }
  }
}

// ===========================
// STEP 3: PLAN CONSOLIDATION
// ===========================

function planConsolidation(chains: ChainBalance[]): { chain: string; amount: string }[] {
  console.log('\n--- Consolidation Plan ---');

  const operations: { chain: string; amount: string }[] = [];

  for (const chain of chains) {
    if (chain.chain === TREASURY_CHAIN) {
      console.log(`  ${chain.chain}: Skipped (main treasury)`);
      continue;
    }

    const excess = chain.currentBalance - chain.targetBalance;
    // Never drain below minimum balance
    const safeToMove = chain.currentBalance - chain.minimumBalance;
    const amountToMove = Math.min(excess, safeToMove);

    if (amountToMove > CONSOLIDATION_THRESHOLD) {
      console.log(`  ${chain.chain}: Consolidate $${amountToMove.toFixed(2)} → ${TREASURY_CHAIN}`);
      operations.push({ chain: chain.chain, amount: amountToMove.toFixed(2) });
    } else if (excess > 0) {
      console.log(`  ${chain.chain}: Excess $${excess.toFixed(2)} below threshold — skip`);
    } else {
      console.log(`  ${chain.chain}: At or below target — skip`);
    }
  }

  console.log(`\n  Total operations: ${operations.length}`);
  return operations;
}

// ===========================
// STEP 4: EXECUTE CONSOLIDATION
// ===========================

async function executeConsolidation(
  operations: { chain: string; amount: string }[]
): Promise<void> {
  console.log('\n--- Executing Consolidation ---');

  for (const op of operations) {
    console.log(`\n  Bridging $${op.amount} from ${op.chain} → ${TREASURY_CHAIN}`);

    try {
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

      console.log(`  ✓ Completed (${result.state})`);
      result.steps.forEach((step, i) => {
        console.log(`    Step ${i + 1}: ${step.action} — ${step.txHash}`);
      });
    } catch (error: any) {
      console.error(`  ✗ Failed: ${error.message}`);
    }
  }
}

// ===========================
// CONSOLIDATION JOB
// ===========================

async function runConsolidationJob() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║   TREASURY CONSOLIDATION JOB           ║');
  console.log('╚════════════════════════════════════════╝');
  console.log(`\n  Run at: ${new Date().toISOString()}`);
  console.log(`  Treasury: ${TREASURY_ADDRESS} on ${TREASURY_CHAIN}`);

  // Define target and minimum balances per chain
  const chainBalances: ChainBalance[] = [
    { chain: 'Base',     currentBalance: 0, targetBalance: 10000, minimumBalance: 5000 },
    { chain: 'Arbitrum', currentBalance: 0, targetBalance: 10000, minimumBalance: 5000 },
    { chain: 'Polygon',  currentBalance: 0, targetBalance: 10000, minimumBalance: 5000 },
    { chain: 'Optimism', currentBalance: 0, targetBalance: 10000, minimumBalance: 5000 },
    { chain: 'Ethereum', currentBalance: 0, targetBalance: 50000, minimumBalance: 20000 }
  ];

  // Step 1: Fetch live balances from Circle Wallet (returns all token balances for reuse)
  const allBalances = await checkChainBalances(chainBalances);

  // Step 2 (Optional): Detect and swap any non-USDC tokens to USDC before bridging
  await swapToUSDC(allBalances);

  // Step 3: Decide what to move
  const operations = planConsolidation(chainBalances);

  if (operations.length === 0) {
    console.log('\n✓ Nothing to consolidate');
    return;
  }

  // Step 4: Execute bridges
  await executeConsolidation(operations);

  console.log('\n✓ Treasury consolidation complete');
}

// ===========================
// COST COMPARISON
// ===========================

function showCostComparison() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║   COST COMPARISON (5 chains)           ║');
  console.log('╚════════════════════════════════════════╝');
  console.log('\nManual (FAST bridges, daily):');
  console.log('  5 bridges × $10 × 365 days = $18,250/year');
  console.log('\nAutomated (SLOW bridges, weekly):');
  console.log('  5 bridges × $0 × 52 weeks  = $0/year');
  console.log('  Scheduling overhead        = ~$500/year');
  console.log('  Total: $500/year');
  console.log('\n  Savings: $17,750/year (97%)');
}

// ===========================
// RUN EXAMPLES
// ===========================

async function main() {
  if (!process.env.CIRCLE_API_KEY || !process.env.TREASURY_WALLET_ID) {
    console.log('\n  Set CIRCLE_API_KEY, TREASURY_WALLET_ID, CIRCLE_ENTITY_SECRET, and TREASURY_ADDRESS in .env file\n');
    showCostComparison();
    return;
  }

  console.log('\n  Treasury: ' + TREASURY_ADDRESS);
  console.log('  Mode: ' + (USE_SLOW_MODE ? 'SLOW (zero fees)' : 'FAST'));
  console.log('  Threshold: $' + CONSOLIDATION_THRESHOLD);

  // Uncomment to run:
  // await runConsolidationJob();

  showCostComparison();
}

main().catch(console.error);
