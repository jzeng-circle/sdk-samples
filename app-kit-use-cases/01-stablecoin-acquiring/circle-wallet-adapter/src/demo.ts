/**
 * Demo script — runs the full acquiring flow end-to-end (no server needed)
 * Run: npm run demo
 */

import {
  createPaymentSession,
  monitorPayment,
  aggregateToInternalWallet,
  batchSwapToUSDC,
  settleMerchant,
  calculateAmounts,
  type MerchantConfig,
} from './acquiring.js';
import { PLATFORM_FEE_PERCENT } from './config.js';

async function main() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║  STABLECOIN ACQUIRING DEMO (Arc/Circle)║');
  console.log('╚════════════════════════════════════════╝\n');

  const TOKEN = 'USDC';
  const CHAIN = 'ARC';

  const amounts = calculateAmounts('1.00');

  // ── Step 1 ────────────────────────────────────────────────────────────────
  const orderId = `order_${Date.now()}`;
  console.log('Step 1: Creating payment session...');
  const session = await createPaymentSession(orderId, '1.00', TOKEN, CHAIN);
  console.log(`  Address:   ${session.paymentAddress}`);
  console.log(`  Wallet ID: ${session.paymentWalletId}`);
  console.log(`  Amount:    ${session.expectedAmount} ${TOKEN} (1.00 + ${PLATFORM_FEE_PERCENT}% fee)\n`);

  // ── Step 2 ────────────────────────────────────────────────────────────────
  console.log(`Step 2: Waiting for ${session.expectedAmount} ${TOKEN} on Arc Testnet...`);
  console.log(`  Send to: ${session.paymentAddress}`);
  console.log('  (polling every 5s, timeout 5 min)\n');
  const received = await monitorPayment(session);
  if (!received) {
    console.error('  Payment not received within timeout — exiting');
    return;
  }
  console.log('  Payment confirmed!\n');

  try {
    // ── Step 3 ────────────────────────────────────────────────────────────────
    console.log('Step 3: Aggregating to internal wallet...');
    const txId = await aggregateToInternalWallet(session);
    console.log(`  Transaction ID: ${txId}\n`);

    // ── Step 4 ────────────────────────────────────────────────────────────────
    console.log('Step 4: Swap (skipped — token is already USDC)');
    const swapTxHash = await batchSwapToUSDC(CHAIN, TOKEN, parseFloat(session.expectedAmount));
    console.log(`  Tx hash: ${swapTxHash}\n`);

    // ── Step 5 ────────────────────────────────────────────────────────────────
    const merchant: MerchantConfig = {
      merchantId: 'merchant_001',
      settlementAddress: '0x3c5fbd990819fb6bdd17251f6ae406f7ee98344e',
      settlementChain: 'Ethereum_Sepolia',
    };
    console.log('Step 5: Settle to merchant');
    console.log('  Route:        Arc Testnet → Ethereum Sepolia');
    console.log(`  Merchant:     $${amounts.baseAmount.toFixed(2)} USDC → ${merchant.settlementAddress}`);
    console.log(`  Platform fee: $${amounts.fee.toFixed(2)} USDC`);
    const txHashes = await settleMerchant(merchant, amounts.baseAmount, amounts.fee, 'Arc_Testnet');
    console.log(`  Tx hashes:    ${txHashes.join(', ')}\n`);

  } catch (err: any) {
    console.error('\nError:', err.message);
  }
}

main().catch(console.error);
