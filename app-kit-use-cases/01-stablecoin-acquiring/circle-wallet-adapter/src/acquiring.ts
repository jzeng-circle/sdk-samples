/**
 * Stablecoin Acquiring — Circle Wallets Adapter
 *
 * Flow:
 * 1. Create payment session — provision a Circle-managed temp wallet via API
 * 2. Monitor payment — poll Circle API for wallet balance (no RPC node needed)
 * 3. Aggregate — sweep temp wallet to internal wallet via kit.send() + circleAdapter
 * 4. Batch swap (hourly) — swap all accumulated tokens to USDC via kit.swap()
 * 5. Settle (daily) — bridge USDC to merchant with fee via kit.bridge()
 *
 * Key difference from ethers adapter:
 * - Wallets are managed by Circle (no private keys in your code)
 * - Balance checks use Circle's API, not on-chain RPC reads
 * - kit.send/swap/bridge require explicit `address` in from context (developer-controlled)
 */

import { AppKit } from '@circle-fin/app-kit';
import { createCircleWalletsAdapter } from '@circle-fin/adapter-circle-wallets';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import {
  CIRCLE_API_KEY,
  CIRCLE_ENTITY_SECRET,
  WALLET_SET_ID,
  INTERNAL_WALLET_ADDRESS,
  PLATFORM_FEE_ADDRESS,
  KIT_KEY,
  SLIPPAGE_BPS,
  SESSION_EXPIRY_MINUTES,
  PLATFORM_FEE_PERCENT,
} from './config.js';

const kit = new AppKit();

// Single adapter instance — Circle manages keys, address passed explicitly per operation
const circleAdapter = createCircleWalletsAdapter({
  apiKey: CIRCLE_API_KEY,
  entitySecret: CIRCLE_ENTITY_SECRET,
});

export function calculateAmounts(orderAmount: string) {
  const baseAmount = parseFloat(orderAmount);
  const fee = baseAmount * PLATFORM_FEE_PERCENT / 100;
  return { baseAmount, fee, total: baseAmount + fee };
}
export interface PaymentSession {
  sessionId: string;
  orderId: string;
  orderAmount: string;
  paymentAddress: string;
  paymentWalletId: string;   // Circle wallet ID — used for balance checks
  expectedAmount: string;    // orderAmount + platform fee
  expectedToken: string;
  customerChain: string;
  expiresAt: Date;
  status: 'pending' | 'received' | 'aggregated' | 'expired';
}

export interface MerchantConfig {
  merchantId: string;
  settlementAddress: string;
  settlementChain: string;
}

// ===========================
// CIRCLE CLIENT
// ===========================

const circleClient = initiateDeveloperControlledWalletsClient({
  apiKey: CIRCLE_API_KEY,
  entitySecret: CIRCLE_ENTITY_SECRET,
});

// Frontend shorthand → Circle API blockchain identifier (testnet)
const CHAIN_TO_CIRCLE_BLOCKCHAIN: Record<string, string> = {
  ARC: 'ARC-TESTNET',
};

// Frontend shorthand → AppKit chain identifier used in kit.send/swap/bridge
const CHAIN_TO_APPKIT: Record<string, string> = {
  ARC: 'Arc_Testnet',
};

// ===========================
// STEP 1: CREATE PAYMENT SESSION
// ===========================

export async function createPaymentSession(
  orderId: string,
  orderAmount: string,
  token: string,
  chain: string
): Promise<PaymentSession> {
  const circleBlockchain = CHAIN_TO_CIRCLE_BLOCKCHAIN[chain] ?? chain;
  const appKitChain = CHAIN_TO_APPKIT[chain] ?? chain;
  const amounts = calculateAmounts(orderAmount);

  // Circle creates and manages this wallet — no private key stored locally
  const response = await circleClient.createWallets({
    walletSetId: WALLET_SET_ID,
    accountType: 'EOA',
    blockchains: [circleBlockchain as any],
    count: 1,
  });

  const wallet = response.data?.wallets?.[0];
  if (!wallet?.id || !wallet?.address) {
    throw new Error('Circle wallet creation failed — no wallet returned');
  }

  return {
    sessionId: `session_${orderId}`,
    orderId,
    orderAmount,
    paymentAddress: wallet.address,
    paymentWalletId: wallet.id,    // Circle wallet ID — no private key needed
    expectedAmount: amounts.total.toFixed(2),
    expectedToken: token,
    customerChain: appKitChain,    // stored as AppKit chain name for kit.send()
    expiresAt: new Date(Date.now() + SESSION_EXPIRY_MINUTES * 60 * 1000),
    status: 'pending',
  };
}

// ===========================
// STEP 2: MONITOR PAYMENT
// ===========================

export async function monitorPayment(session: PaymentSession): Promise<boolean> {
  const maxAttempts = 60; // 5 minutes at 5s intervals

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (new Date() > session.expiresAt) {
      session.status = 'expired';
      return false;
    }

    // Circle API handles balance reads — no RPC node or contract ABI needed
    const response = await circleClient.getWalletTokenBalance({ id: session.paymentWalletId });

    const balances = response.data?.tokenBalances ?? [];
    const match = balances.find(
      (b: any) => b.token?.symbol?.toUpperCase() === session.expectedToken.toUpperCase()
    );

    const received = parseFloat((match as any)?.amount ?? '0');
    const expected = parseFloat(session.expectedAmount);

    if (received >= expected) {
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
  // kit.send() now correctly honours from.address for Circle Wallet adapters (fixed in app-kit 1.4.2)
  const step = await kit.send({
    from: {
      adapter: circleAdapter,
      address: session.paymentAddress,
      chain: session.customerChain as any,
    },
    to: INTERNAL_WALLET_ADDRESS,
    token: session.expectedToken as any,
    amount: session.expectedAmount,
  });

  session.status = 'aggregated';
  return step.txHash ?? '';
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

  const appKitChain = CHAIN_TO_APPKIT[chain] ?? chain;

  const result = await kit.swap({
    from: {
      adapter: circleAdapter,
      address: INTERNAL_WALLET_ADDRESS,
      chain: appKitChain as any,
    },
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
  totalFee: number,
  sourceChain: string
): Promise<string[]> {
  const bridgeResult = await kit.bridge({
    from: {
      adapter: circleAdapter,
      address: INTERNAL_WALLET_ADDRESS,
      chain: sourceChain as any,
    },
    to: {
      chain: merchant.settlementChain as any,
      recipientAddress: merchant.settlementAddress,
      useForwarder: true,
    },
    token: 'USDC',
    amount: totalAmount.toFixed(2),
    config: {
      transferSpeed: 'FAST',
      customFee: {
        value: totalFee.toFixed(2),
        recipientAddress: PLATFORM_FEE_ADDRESS,
      },
    },
  });

  return bridgeResult.steps.map((s: any) => s.txHash ?? '');
}
