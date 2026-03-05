/**
 * Multi-Chain Treasury Management
 *
 * Flow:
 * 1. Check USDC balances across all chains
 * 2. Identify chains with excess funds above target
 * 3. Bridge excess to main treasury (SLOW mode for zero fees)
 * 4. Optionally top-up chains that fell below target
 * 5. Generate consolidation report
 *
 * Benefits: Zero bridge fees using SLOW mode, automated scheduling
 */

import 'dotenv/config';
import { StablecoinKit } from '@circle-fin/stablecoin-kit';
import { createCircleWalletAdapter } from '@circle-fin/adapter-circle-wallet';

// ===========================
// TYPES
// ===========================

interface ChainBalance {
  chain: string;
  currentBalance: number;
  targetBalance: number;
  minimumBalance: number;
}

interface ConsolidationConfig {
  mainTreasuryChain: string;
  mainTreasuryAddress: string;
  consolidationThreshold: number; // Skip chains with excess below this
  useSlowMode: boolean;           // SLOW = zero bridge fees
}

interface ConsolidationOperation {
  fromChain: string;
  toChain: string;
  amount: string;
  reason: string;
  status: 'pending' | 'completed' | 'failed';
  txHashes: string[];
  error?: string;
}

interface ConsolidationReport {
  timestamp: string;
  totalConsolidated: number;
  operations: ConsolidationOperation[];
  finalBalances: Record<string, number>;
  bridgeFees: string;
}

// ===========================
// CONFIGURATION
// ===========================

const CONSOLIDATION_THRESHOLD = 1000; // Only consolidate if excess > $1,000
const USE_SLOW_MODE = true;           // SLOW mode = free bridge (no protocol fees)

// ===========================
// INITIALIZATION
// ===========================

const kit = new StablecoinKit();

const adapter = createCircleWalletAdapter({
  apiKey: process.env.CIRCLE_API_KEY as string,
  walletId: process.env.TREASURY_WALLET_ID as string,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET as string
});

const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS || '0xYourTreasuryAddress';
const TREASURY_CHAIN = 'Ethereum';

// ===========================
// STEP 1: CHECK BALANCES
// ===========================

async function checkChainBalances(chains: ChainBalance[]): Promise<void> {
  console.log('\n--- Chain Balances ---');

  for (const chain of chains) {
    const status =
      chain.currentBalance > chain.targetBalance ? 'EXCESS'
      : chain.currentBalance < chain.minimumBalance ? 'LOW'
      : 'OK';

    const excess = chain.currentBalance - chain.targetBalance;
    const excessStr = excess > 0 ? `+$${excess.toFixed(0)}` : `-$${Math.abs(excess).toFixed(0)}`;

    console.log(`  ${chain.chain.padEnd(12)} $${chain.currentBalance.toLocaleString().padStart(8)}  (target $${chain.targetBalance.toLocaleString()}, ${excessStr})  [${status}]`);
  }
}

// ===========================
// STEP 2: PLAN CONSOLIDATION
// ===========================

function planConsolidation(
  chains: ChainBalance[],
  config: ConsolidationConfig
): ConsolidationOperation[] {
  console.log('\n--- Consolidation Plan ---');

  const operations: ConsolidationOperation[] = [];

  for (const chain of chains) {
    if (chain.chain === config.mainTreasuryChain) {
      console.log(`  ${chain.chain}: Skipped (main treasury)`);
      continue;
    }

    const excess = chain.currentBalance - chain.targetBalance;
    // Respect minimum balance — never drain below it
    const safeToMove = chain.currentBalance - chain.minimumBalance;
    const amountToMove = Math.min(excess, safeToMove);

    if (amountToMove > config.consolidationThreshold) {
      console.log(`  ${chain.chain}: Consolidate $${amountToMove.toFixed(2)} → ${config.mainTreasuryChain}`);
      operations.push({
        fromChain: chain.chain,
        toChain: config.mainTreasuryChain,
        amount: amountToMove.toFixed(2),
        reason: `Excess $${excess.toFixed(2)} above target`,
        status: 'pending',
        txHashes: []
      });
    } else if (excess > 0) {
      console.log(`  ${chain.chain}: Excess $${excess.toFixed(2)} below threshold — skip`);
    } else {
      console.log(`  ${chain.chain}: At or below target — skip`);
    }
  }

  console.log(`\n  Total operations planned: ${operations.length}`);

  return operations;
}

// ===========================
// STEP 3: EXECUTE CONSOLIDATION
// ===========================

async function executeConsolidation(
  operations: ConsolidationOperation[],
  config: ConsolidationConfig
): Promise<void> {
  console.log('\n--- Executing Consolidation ---');

  for (const op of operations) {
    try {
      console.log(`\n  Bridging $${op.amount} from ${op.fromChain} → ${op.toChain}`);
      console.log(`  Reason: ${op.reason}`);

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

      console.log(`  ✓ Completed (${result.state})`);
      result.steps.forEach((step, i) => {
        console.log(`    Step ${i + 1}: ${step.action} — ${step.txHash}`);
      });

    } catch (error: any) {
      op.status = 'failed';
      op.error = error.message;
      console.error(`  ✗ Failed: ${error.message}`);
    }
  }
}

// ===========================
// STEP 4: REBALANCE (Optional)
// ===========================

async function topUpLowChains(
  chains: ChainBalance[],
  config: ConsolidationConfig
): Promise<void> {
  console.log('\n--- Topping Up Low Chains ---');

  const lowChains = chains.filter(
    c => c.chain !== config.mainTreasuryChain &&
    (c.targetBalance - c.currentBalance) > config.consolidationThreshold
  );

  if (lowChains.length === 0) {
    console.log('  No chains need topping up');
    return;
  }

  for (const chain of lowChains) {
    const deficit = (chain.targetBalance - chain.currentBalance).toFixed(2);
    console.log(`\n  Bridging $${deficit} from ${config.mainTreasuryChain} → ${chain.chain}`);

    try {
      const result = await kit.bridge({
        from: { adapter, chain: config.mainTreasuryChain },
        to: { adapter, chain: chain.chain },
        amount: deficit,
        config: { transferSpeed: config.useSlowMode ? 'SLOW' : 'FAST' }
      });

      console.log(`  ✓ Completed: ${result.steps[0].txHash}`);
    } catch (error: any) {
      console.error(`  ✗ Failed: ${error.message}`);
    }
  }
}

// ===========================
// STEP 5: GENERATE REPORT
// ===========================

function generateReport(
  operations: ConsolidationOperation[],
  finalBalances: Record<string, number>,
  config: ConsolidationConfig
): ConsolidationReport {
  const totalConsolidated = operations
    .filter(o => o.status === 'completed')
    .reduce((sum, o) => sum + parseFloat(o.amount), 0);

  const report: ConsolidationReport = {
    timestamp: new Date().toISOString(),
    totalConsolidated,
    operations,
    finalBalances,
    bridgeFees: config.useSlowMode
      ? '$0.00 (SLOW mode — no protocol fees)'
      : `~$${(operations.length * 0.01).toFixed(2)} (FAST mode)`
  };

  console.log('\n=== Consolidation Report ===');
  console.log(`  Timestamp:          ${report.timestamp}`);
  console.log(`  Total Consolidated: $${totalConsolidated.toFixed(2)}`);
  console.log(`  Successful:         ${operations.filter(o => o.status === 'completed').length}/${operations.length}`);
  console.log(`  Bridge Fees:        ${report.bridgeFees}`);

  return report;
}

// ===========================
// SCHEDULED CONSOLIDATION JOB
// ===========================

async function runConsolidationJob() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║   TREASURY CONSOLIDATION JOB           ║');
  console.log('╚════════════════════════════════════════╝');
  console.log(`\n  Run at: ${new Date().toISOString()}`);
  console.log(`  Treasury: ${TREASURY_ADDRESS} on ${TREASURY_CHAIN}`);

  // In production: fetch live balances from each chain
  const chainBalances: ChainBalance[] = [
    { chain: 'Base',      currentBalance: 15000, targetBalance: 10000, minimumBalance: 5000 },
    { chain: 'Arbitrum',  currentBalance: 12500, targetBalance: 10000, minimumBalance: 5000 },
    { chain: 'Polygon',   currentBalance: 8000,  targetBalance: 10000, minimumBalance: 5000 },
    { chain: 'Optimism',  currentBalance: 5500,  targetBalance: 10000, minimumBalance: 5000 },
    { chain: 'Ethereum',  currentBalance: 25000, targetBalance: 50000, minimumBalance: 20000 }
  ];

  const config: ConsolidationConfig = {
    mainTreasuryChain: TREASURY_CHAIN,
    mainTreasuryAddress: TREASURY_ADDRESS,
    consolidationThreshold: CONSOLIDATION_THRESHOLD,
    useSlowMode: USE_SLOW_MODE
  };

  // Step 1: Audit current state
  await checkChainBalances(chainBalances);

  // Step 2: Decide what to move
  const operations = planConsolidation(chainBalances, config);

  if (operations.length === 0) {
    console.log('\n✓ Nothing to consolidate');
    return;
  }

  // Step 3: Execute bridges
  await executeConsolidation(operations, config);

  // Step 4: Top up chains that fell short (optional)
  await topUpLowChains(chainBalances, config);

  // Step 5: Report
  const finalBalances: Record<string, number> = {};
  for (const c of chainBalances) finalBalances[c.chain] = c.currentBalance;

  generateReport(operations, finalBalances, config);

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
