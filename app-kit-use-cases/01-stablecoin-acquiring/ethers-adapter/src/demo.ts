/**
 * Demo script — runs the full acquiring flow end-to-end (no server needed)
 * Run: npm run demo
 */

import {
  createPaymentSession,
  aggregateToInternalWallet,
  batchSwapToUSDC,
  settleMerchant,
} from './acquiring.js';
import { calculateAmounts, PLATFORM_FEE_PERCENT } from './config.js';

async function main() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║  STABLECOIN ACQUIRING DEMO (Ethers)    ║');
  console.log('╚════════════════════════════════════════╝\n');

  const orderId = `order_${Date.now()}`;
  const orderAmount = '100.00';
  const token = 'USDT';
  const chain = 'Ethereum';
  const amounts = calculateAmounts(orderAmount);

  // Step 1: Create payment session
  console.log('Step 1: Create payment session');
  const session = await createPaymentSession(orderId, orderAmount, token, chain);
  console.log(`  Session:  ${session.sessionId}`);
  console.log(`  Address:  ${session.paymentAddress}`);
  console.log(`  Amount:   ${session.expectedAmount} ${token} (includes ${PLATFORM_FEE_PERCENT}% fee)`);
  console.log(`  Expires:  ${session.expiresAt.toLocaleTimeString()}`);

  console.log('\nCustomer payment instructions:');
  console.log(`  Send ${session.expectedAmount} ${token} to:`);
  console.log(`  ${session.paymentAddress}\n`);

  // Step 2: Monitor (skipped in demo — wallet has no real funds)
  console.log('Step 2: Monitor payment');
  console.log('  [DEMO] Skipping — temp wallet has no real funds on chain');
  console.log('  In production: poll ERC-20 balance until received\n');

  // Step 3: Aggregate (skipped — no funds)
  console.log('Step 3: Aggregate to internal wallet');
  console.log('  [DEMO] Skipping — requires real USDT in temp wallet');
  console.log('  In production: kit.send() sweeps temp → internal wallet\n');

  // Step 4: Batch swap — demo call (will fail without real balance)
  console.log('Step 4: Batch swap USDT → USDC (hourly job)');
  console.log('  Total to swap: ' + amounts.total.toFixed(2) + ' USDT');
  console.log('  [DEMO] kit.swap() call — requires real USDT balance');
  console.log('  In production: runs hourly, aggregates all pending orders\n');

  // Step 5: Settlement — demo call
  console.log('Step 5: Settle to merchant (daily job)');
  console.log(`  Merchant receives: $${amounts.baseAmount.toFixed(2)} USDC`);
  console.log(`  Platform fee: $${amounts.fee.toFixed(2)} USDC`);
  console.log('  [DEMO] kit.bridge() call — requires real USDC balance');
  console.log('  In production: SLOW mode, zero protocol fees\n');

  console.log('╔════════════════════════════════════════╗');
  console.log('║  To run with real funds:               ║');
  console.log('║  1. Fund the temp wallet with USDT     ║');
  console.log('║  2. Run npm start (web interface)      ║');
  console.log('║  3. Create a session and send funds    ║');
  console.log('╚════════════════════════════════════════╝\n');
}

main().catch(console.error);
