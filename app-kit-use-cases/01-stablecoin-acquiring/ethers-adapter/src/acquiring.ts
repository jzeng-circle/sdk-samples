/**
 * Stablecoin Acquiring — Ethers Adapter
 *
 * Flow:
 * 1. Create payment session — generate temporary wallet locally with ethers
 * 2. Monitor payment — poll ERC-20 balance via RPC
 * 3. Aggregate — sweep temp wallet to internal wallet via kit.send()
 * 4. Batch swap (hourly) — swap all accumulated tokens to USDC via kit.swap()
 * 5. Settle (daily) — bridge USDC to merchant with fee via kit.bridge()
 */

import { ethers } from 'ethers';
import {
  kit,
  internalWalletAdapter,
  INTERNAL_WALLET_ADDRESS,
  PLATFORM_FEE_ADDRESS,
  KIT_KEY,
  SLIPPAGE_BPS,
  SESSION_EXPIRY_MINUTES,
  TOKEN_ADDRESSES,
  TOKEN_DECIMALS,
  ERC20_ABI,
  calculateAmounts,
  ALCHEMY_KEY,
} from './config.js';
import { createEthersAdapterFromPrivateKey } from '@circle-fin/adapter-ethers-v6';
import type { PaymentSession, MerchantConfig } from './types.js';
import { JsonRpcProvider } from 'ethers';

// ===========================
// STEP 1: CREATE PAYMENT SESSION
// ===========================

export async function createPaymentSession(
  orderId: string,
  orderAmount: string,
  token: string,
  chain: string
): Promise<PaymentSession> {
  // Generate a random temporary wallet locally — no API call needed
  const tempWallet = ethers.Wallet.createRandom();
  const amounts = calculateAmounts(orderAmount);

  return {
    sessionId: `session_${orderId}`,
    orderId,
    orderAmount,
    paymentAddress: tempWallet.address,
    paymentPrivateKey: tempWallet.privateKey,  // stored for aggregation
    expectedAmount: amounts.total.toFixed(2),
    expectedToken: token,
    customerChain: chain,
    expiresAt: new Date(Date.now() + SESSION_EXPIRY_MINUTES * 60 * 1000),
    status: 'pending',
  };
}

// ===========================
// STEP 2: MONITOR PAYMENT
// ===========================

// Public testnet RPC endpoints (no API key required)
const TESTNET_RPCS: Record<string, string> = {
  Ethereum_Sepolia:    'https://sepolia.drpc.org',
  Base_Sepolia:        'https://sepolia.base.org',
  Arbitrum_Sepolia:    'https://sepolia-rollup.arbitrum.io/rpc',
  Polygon_Amoy_Testnet:'https://rpc-amoy.polygon.technology',
};

export async function monitorPayment(session: PaymentSession): Promise<boolean> {
  const tokenAddress = TOKEN_ADDRESSES[session.customerChain]?.[session.expectedToken];
  if (!tokenAddress) {
    throw new Error(`Unsupported token ${session.expectedToken} on ${session.customerChain}`);
  }

  const rpcUrl = TESTNET_RPCS[session.customerChain];
  if (!rpcUrl) {
    throw new Error(`Unsupported chain: ${session.customerChain}`);
  }

  const provider = new JsonRpcProvider(rpcUrl);
  const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  const decimals = TOKEN_DECIMALS[session.expectedToken] ?? 6;
  const expectedRaw = ethers.parseUnits(session.expectedAmount, decimals);

  const maxAttempts = 60; // 5 minutes at 5s intervals

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (new Date() > session.expiresAt) {
      session.status = 'expired';
      return false;
    }

    const balance: bigint = await contract.balanceOf(session.paymentAddress);
    if (balance >= expectedRaw) {
      session.status = 'received';
      return true;
    }

    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  return false;
}

// ===========================
// STEP 3: AGGREGATE TO INTERNAL WALLET
// ===========================

export async function aggregateToInternalWallet(session: PaymentSession): Promise<string> {
  // Recreate adapter from the private key stored in the session
  const tempPaymentAdapter = createEthersAdapterFromPrivateKey({
    privateKey: session.paymentPrivateKey,
  });

  const result = await kit.send({
    from: { adapter: tempPaymentAdapter, chain: session.customerChain as any },
    to: INTERNAL_WALLET_ADDRESS,
    amount: session.expectedAmount,
    token: session.expectedToken,
  });

  session.status = 'aggregated';
  return result.txHash ?? '';
}

// ===========================
// STEP 4: BATCH SWAP (Hourly Job)
// ===========================

export async function batchSwapToUSDC(
  chain: string,
  token: string,
  totalAmount: number
): Promise<string> {
  if (token === 'USDC') return 'no-swap';

  const result = await kit.swap({
    from: { adapter: internalWalletAdapter, chain: chain as any },
    tokenIn: token as any,
    tokenOut: 'USDC',
    amountIn: totalAmount.toFixed(2),
    config: { kitKey: KIT_KEY, slippageBps: SLIPPAGE_BPS },
  });

  return result.txHash;
}

// ===========================
// STEP 5: SETTLE TO MERCHANT (Daily Job)
// ===========================

export async function settleMerchant(
  merchant: MerchantConfig,
  totalAmount: number,
  totalFee: number
): Promise<string[]> {
  const bridgeResult = await kit.bridge({
    from: { adapter: internalWalletAdapter, chain: 'Ethereum' as any },
    to: {
      adapter: internalWalletAdapter,
      chain: merchant.settlementChain as any,
      recipientAddress: merchant.settlementAddress,
    },
    amount: totalAmount.toFixed(2),
    config: {
      transferSpeed: 'SLOW',
      customFee: {
        value: totalFee.toFixed(2),
        recipientAddress: PLATFORM_FEE_ADDRESS,
      },
    },
  });

  return bridgeResult.steps.map(s => s.txHash ?? '');
}
