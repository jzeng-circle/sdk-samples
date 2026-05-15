/**
 * Test: USDC transfer using a Circle Modular Wallet (ERC-4337 / ERC-6900)
 *
 * Circle Modular Wallets are ERC-4337 smart accounts owned by a local private key.
 * Transactions are sent as UserOperations via Circle's bundler.
 *
 * Required env vars:
 *   MODULAR_WALLETS_URL       - Circle modular wallets endpoint (from console.circle.com)
 *   MODULAR_WALLETS_APP_ID    - Circle modular wallets app ID / client key
 *   MODULAR_WALLET_PRIVATE_KEY - hex private key of the smart account owner (0x...)
 *
 * Optional env vars (re-used from existing .env):
 *   INTERNAL_WALLET_ADDRESS   - destination for the test transfer
 *
 * Run:
 *   npx tsx src/test-modular-send.ts
 */

import 'dotenv/config';
import { createPublicClient, defineChain, parseUnits } from 'viem';
import { createBundlerClient } from 'viem/account-abstraction';
import { privateKeyToAccount } from 'viem/accounts';
import {
  toModularTransport,
  toCircleModularWalletClient,
  toCircleSmartAccount,
  ContractAddress,
  encodeTransfer,
} from '@circle-fin/modular-wallets-core';

// ── env ──────────────────────────────────────────────────────────────────────
const MODULAR_WALLETS_URL    = process.env.MODULAR_WALLETS_URL as string;
const MODULAR_WALLETS_APP_ID = process.env.MODULAR_WALLETS_APP_ID as string;
const PRIVATE_KEY            = process.env.MODULAR_WALLET_PRIVATE_KEY as `0x${string}`;
const TO_ADDRESS             = process.env.INTERNAL_WALLET_ADDRESS as `0x${string}`;
const SEND_AMOUNT            = '0.01';

if (!MODULAR_WALLETS_URL || !MODULAR_WALLETS_APP_ID) {
  console.error(
    'Set MODULAR_WALLETS_URL and MODULAR_WALLETS_APP_ID in your .env\n' +
    '  (from console.circle.com → Modular Wallets → App Settings)',
  );
  process.exit(1);
}

if (!PRIVATE_KEY) {
  console.error('Set MODULAR_WALLET_PRIVATE_KEY in your .env (hex private key, 0x-prefixed)');
  process.exit(1);
}

// ── Arc Testnet chain definition ─────────────────────────────────────────────
const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.arc.network/'] },
  },
  blockExplorers: {
    default: { name: 'ArcScan', url: 'https://testnet.arcscan.app' },
  },
  testnet: true,
});

// ── setup ─────────────────────────────────────────────────────────────────────
const transport = toModularTransport(MODULAR_WALLETS_URL, MODULAR_WALLETS_APP_ID);

const publicClient = createPublicClient({ chain: arcTestnet, transport });
const circleClient = toCircleModularWalletClient({ client: publicClient });

async function main() {
  console.log('\n── Circle Modular Wallet — USDC transfer on Arc Testnet ──\n');

  // ── Step 1: derive smart account from owner private key ──────────────────
  const owner = privateKeyToAccount(PRIVATE_KEY);
  console.log(`Owner (EOA):  ${owner.address}`);

  const account = await toCircleSmartAccount({ client: circleClient, owner });
  console.log(`Smart account: ${account.address}`);

  // ── Step 2: check USDC balance ────────────────────────────────────────────
  const usdcAddress = ContractAddress.ArcTestnet_USDC as `0x${string}`;
  const erc20BalanceAbi = [
    {
      name: 'balanceOf',
      type: 'function',
      stateMutability: 'view',
      inputs: [{ name: 'account', type: 'address' }],
      outputs: [{ name: '', type: 'uint256' }],
    },
  ] as const;

  const rawBalance = await publicClient.readContract({
    address: usdcAddress,
    abi: erc20BalanceAbi,
    functionName: 'balanceOf',
    args: [account.address],
  });
  const balance = Number(rawBalance) / 1e6;
  console.log(`USDC balance:  ${balance}\n`);

  if (balance < parseFloat(SEND_AMOUNT)) {
    console.log(`Need at least ${SEND_AMOUNT} USDC on Arc Testnet.`);
    console.log(`Fund this address and re-run:\n  ${account.address}\n`);
    return;
  }

  // ── Step 3: build UserOperation call ─────────────────────────────────────
  const amountUnits = parseUnits(SEND_AMOUNT, 6);
  const { data, to } = encodeTransfer(TO_ADDRESS, usdcAddress, amountUnits);

  console.log(`Sending ${SEND_AMOUNT} USDC via UserOperation:`);
  console.log(`  from: ${account.address}`);
  console.log(`  to:   ${TO_ADDRESS}`);
  console.log(`  call: ${to} (USDC transfer)\n`);

  // ── Step 4: send UserOperation via Circle bundler ─────────────────────────
  const bundlerClient = createBundlerClient({
    account,
    client: publicClient,
    transport,
  });

  const userOpHash = await bundlerClient.sendUserOperation({
    calls: [{ to, data, value: 0n }],
  });
  console.log(`UserOperation hash: ${userOpHash}`);

  // ── Step 5: wait for receipt ──────────────────────────────────────────────
  console.log('Waiting for UserOperation receipt...');
  const receipt = await bundlerClient.waitForUserOperationReceipt({ hash: userOpHash });

  console.log(`\nResult:`);
  console.log(`  tx hash:  ${receipt.receipt.transactionHash}`);
  console.log(`  explorer: https://testnet.arcscan.app/tx/${receipt.receipt.transactionHash}`);
  console.log(`  success:  ${receipt.success}\n`);
}

main().catch(console.error);
