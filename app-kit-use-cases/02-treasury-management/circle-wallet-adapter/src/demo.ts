/**
 * End-to-end demo of the unified-balance treasury flow (Circle Wallets adapter).
 *
 * Runs:
 *   1. Read current unified balance
 *   2. (Optional) Swap any non-USDC inflow on a receive chain to USDC
 *   3. Deposit USDC into the unified balance
 *   4. Spend on a different chain — minted instantly via Gateway
 *   5. Re-read the balance to confirm the new state
 *
 * Override the demo inputs via env vars or by editing the constants below.
 */

import {
  printBalance,
  readUnifiedBalance,
  swapInflowToUsdc,
  depositToUnifiedBalance,
  spendFromUnifiedBalance,
} from './treasury.js';

// Default flow: receive EURC on Arc Testnet, swap to USDC, deposit, then spend on Base Sepolia.
const RECEIVE_CHAIN = process.env.DEMO_RECEIVE_CHAIN ?? 'Arc_Testnet';
const INFLOW_TOKEN = process.env.DEMO_INFLOW_TOKEN ?? 'EURC';
const INFLOW_AMOUNT = process.env.DEMO_INFLOW_AMOUNT ?? '100';
const DEPOSIT_AMOUNT = process.env.DEMO_DEPOSIT_AMOUNT ?? '100';
const PAYOUT_DESTINATION = process.env.DEMO_PAYOUT_CHAIN ?? 'Base_Sepolia';
const PAYOUT_AMOUNT = process.env.DEMO_PAYOUT_AMOUNT ?? '50';
const PAYOUT_RECIPIENT = process.env.DEMO_PAYOUT_RECIPIENT ?? '';

async function main() {
  printBalance(await readUnifiedBalance());

  if (INFLOW_TOKEN !== 'USDC') {
    await swapInflowToUsdc(RECEIVE_CHAIN, INFLOW_AMOUNT, INFLOW_TOKEN);
  }

  await depositToUnifiedBalance(RECEIVE_CHAIN, DEPOSIT_AMOUNT);

  if (PAYOUT_RECIPIENT) {
    await spendFromUnifiedBalance({
      amount: PAYOUT_AMOUNT,
      destinationChain: PAYOUT_DESTINATION,
      recipientAddress: PAYOUT_RECIPIENT,
    });
  } else {
    console.log('\n  Skipping payout — set DEMO_PAYOUT_RECIPIENT to run a spend');
  }

  printBalance(await readUnifiedBalance());
}

main().catch((err) => {
  console.error('\nDemo failed:', err);
  process.exit(1);
});
