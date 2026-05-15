/**
 * Multi-Chain Treasury Management — Ethers Adapter
 *
 * Flow:
 * 1. Read unified balance via kit.unifiedBalance.getBalances() — one call, every chain.
 * 2. (Optional) Swap non-USDC inflows to USDC on the receive chain via kit.swap().
 * 3. Deposit USDC into the unified balance via kit.unifiedBalance.deposit().
 * 4. Spend on any Gateway-supported chain via kit.unifiedBalance.spend() — minted instantly.
 *
 * No upper/lower bound tracking, no rebalancing job, no bridge step in the hot path.
 */

import { AppKit } from '@circle-fin/app-kit';
import { createEthersAdapterFromPrivateKey } from '@circle-fin/adapter-ethers-v6';
import {
  TREASURY_WALLET_KEY,
  KIT_KEY,
  SLIPPAGE_BPS,
  NON_USDC_INFLOWS,
} from './config.js';

export const kit = new AppKit();

// Single adapter — same private key signs on every chain.
export const treasuryAdapter = createEthersAdapterFromPrivateKey({
  privateKey: TREASURY_WALLET_KEY,
});

export interface UnifiedBalanceSnapshot {
  totalConfirmed: string;
  totalPending: string;
  perChain: { chain: string; amount: string }[];
}

// ===========================
// STEP 1: READ UNIFIED BALANCE
// ===========================

export async function readUnifiedBalance(): Promise<UnifiedBalanceSnapshot> {
  const result: any = await kit.unifiedBalance.getBalances({
    sources: { adapter: treasuryAdapter },
    includePending: true,
  });

  return {
    totalConfirmed: String(result.totalConfirmedBalance ?? '0'),
    totalPending: String(result.totalPendingBalance ?? '0'),
    perChain: (result.balances ?? []).map((b: any) => ({
      chain: String(b.chain),
      amount: String(b.amount),
    })),
  };
}

export function printBalance(snapshot: UnifiedBalanceSnapshot): void {
  console.log('\n--- Unified Balance ---');
  console.log(`  Total confirmed:  $${snapshot.totalConfirmed}`);
  for (const entry of snapshot.perChain) {
    console.log(`    ${entry.chain.padEnd(16)} $${entry.amount}`);
  }
  console.log(`  Pending deposits: $${snapshot.totalPending}`);
}

// ===========================
// STEP 2: SWAP NON-USDC INFLOW → USDC
// ===========================

export async function swapInflowToUsdc(
  chain: string,
  amount: string,
  tokenIn: string,
): Promise<string> {
  if (!NON_USDC_INFLOWS[chain]?.includes(tokenIn)) {
    throw new Error(`${tokenIn} on ${chain} is not configured as a non-USDC inflow`);
  }
  if (!KIT_KEY) {
    throw new Error('KIT_KEY is required for kit.swap()');
  }

  console.log(`\n  Swapping ${amount} ${tokenIn} → USDC on ${chain}`);
  const result: any = await kit.swap({
    from: { adapter: treasuryAdapter, chain: chain as any },
    tokenIn,
    tokenOut: 'USDC',
    amountIn: amount,
    config: { kitKey: KIT_KEY, slippageBps: SLIPPAGE_BPS },
  });
  console.log(`  ✓ Swapped: ${result.txHash}`);
  return result.txHash;
}

// ===========================
// STEP 3: DEPOSIT USDC → UNIFIED BALANCE
// ===========================

export async function depositToUnifiedBalance(
  chain: string,
  amount: string,
): Promise<string> {
  console.log(`\n  Depositing $${amount} USDC from ${chain} → unified balance`);
  const result: any = await kit.unifiedBalance.deposit({
    from: { adapter: treasuryAdapter, chain: chain as any },
    amount,
  });
  console.log(`  ✓ Deposited: ${result.txHash}`);
  return result.txHash;
}

// ===========================
// STEP 4: SPEND INSTANTLY ON ANY CHAIN
// ===========================

export async function spendFromUnifiedBalance(args: {
  amount: string;
  destinationChain: string;
  recipientAddress: string;
  estimateOnly?: boolean;
}): Promise<{ estimateFee?: string; txHash?: string }> {
  const { amount, destinationChain, recipientAddress, estimateOnly } = args;

  const spendArgs = {
    amount,
    from: { adapter: treasuryAdapter },
    to: {
      adapter: treasuryAdapter,
      chain: destinationChain as any,
      recipientAddress,
    },
  };

  const estimate: any = await kit.unifiedBalance.estimateSpend(spendArgs);
  const estimateFee = String(estimate.fees?.[0]?.amount ?? '0');
  console.log(`  Estimated fee: $${estimateFee}`);

  if (estimateOnly) return { estimateFee };

  console.log(`\n  Paying $${amount} USDC to ${recipientAddress} on ${destinationChain}`);
  const result: any = await kit.unifiedBalance.spend(spendArgs);
  console.log(`  ✓ Minted on ${destinationChain}: ${result.txHash}`);
  return { estimateFee, txHash: result.txHash };
}
