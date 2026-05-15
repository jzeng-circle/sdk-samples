/**
 * Test: kit.send() with a Circle Developer-Controlled SCA wallet on Arc Testnet
 *
 * Steps:
 * 1. Provision a new SCA wallet via the Circle API (accountType: 'SCA')
 * 2. Print the wallet address — fund it with USDC on Arc Testnet before continuing
 * 3. Once funded (or SCA_WALLET_ADDRESS + SCA_WALLET_ID set in env), call kit.send()
 *
 * Usage:
 *   # First run — provisions wallet and exits
 *   npx tsx src/test-sca-send.ts
 *
 *   # Fund the printed address with USDC on Arc Testnet, then re-run with:
 *   SCA_WALLET_ADDRESS=0x... SCA_WALLET_ID=<uuid> npx tsx src/test-sca-send.ts
 *
 * Run: npx tsx src/test-sca-send.ts
 */

import 'dotenv/config';
import { AppKit } from '@circle-fin/app-kit';
import { createCircleWalletsAdapter } from '@circle-fin/adapter-circle-wallets';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

const CIRCLE_API_KEY     = process.env.CIRCLE_API_KEY as string;
const CIRCLE_ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET as string;
const WALLET_SET_ID      = process.env.WALLET_SET_ID as string;
const TO_ADDRESS         = process.env.INTERNAL_WALLET_ADDRESS as string;
const SEND_AMOUNT        = '0.01';

const kit = new AppKit();

const circleAdapter = createCircleWalletsAdapter({
  apiKey: CIRCLE_API_KEY,
  entitySecret: CIRCLE_ENTITY_SECRET,
});

const circleClient = initiateDeveloperControlledWalletsClient({
  apiKey: CIRCLE_API_KEY,
  entitySecret: CIRCLE_ENTITY_SECRET,
});

async function main() {
  console.log('\n── kit.send() with Circle SCA wallet (Arc Testnet) ──\n');

  let walletAddress = process.env.SCA_WALLET_ADDRESS;
  let walletId      = process.env.SCA_WALLET_ID;

  // ── Step 1: provision SCA wallet if not provided ──────────────────────────
  if (!walletAddress || !walletId) {
    console.log('No SCA_WALLET_ADDRESS/SCA_WALLET_ID in env — provisioning a new SCA wallet...');
    const response = await circleClient.createWallets({
      walletSetId: WALLET_SET_ID,
      accountType: 'SCA',
      blockchains: ['ARC-TESTNET' as any],
      count: 1,
    });

    const wallet = response.data?.wallets?.[0];
    if (!wallet?.id || !wallet?.address) {
      throw new Error('SCA wallet creation failed — no wallet returned');
    }

    walletAddress = wallet.address;
    walletId      = wallet.id;

    console.log('\nSCA wallet provisioned:');
    console.log(`  Address:   ${walletAddress}`);
    console.log(`  Wallet ID: ${walletId}`);
    console.log(`  Type:      ${(wallet as any).accountType ?? 'SCA'}`);
    console.log('\nFund this address with USDC on Arc Testnet, then re-run:');
    console.log(`  SCA_WALLET_ADDRESS=${walletAddress} SCA_WALLET_ID=${walletId} npx tsx src/test-sca-send.ts\n`);
    return;
  }

  console.log(`Using SCA wallet: ${walletAddress}`);

  // ── Step 2: check balance ─────────────────────────────────────────────────
  const balanceResponse = await circleClient.getWalletTokenBalance({ id: walletId });
  const balances = balanceResponse.data?.tokenBalances ?? [];
  const usdcBalance = balances.find((b: any) => b.token?.symbol?.toUpperCase() === 'USDC');
  const available   = parseFloat((usdcBalance as any)?.amount ?? '0');

  console.log(`  USDC balance: ${available}`);

  if (available < parseFloat(SEND_AMOUNT)) {
    console.log(`\nInsufficient balance — need at least ${SEND_AMOUNT} USDC to send.`);
    console.log('Fund the wallet and re-run.\n');
    return;
  }

  // ── Step 3: kit.send() ────────────────────────────────────────────────────
  console.log(`\nCalling kit.send():`);
  console.log(`  from: { adapter: circleAdapter, chain: 'Arc_Testnet', address: '${walletAddress}' }`);
  console.log(`  to:   '${TO_ADDRESS}'`);
  console.log(`  token: 'USDC', amount: '${SEND_AMOUNT}'\n`);

  const step = await kit.send({
    from: {
      adapter: circleAdapter,
      chain: 'Arc_Testnet' as any,
      address: walletAddress,
    },
    to: TO_ADDRESS,
    token: 'USDC',
    amount: SEND_AMOUNT,
  });

  console.log('Result:');
  console.log(`  state:   ${step.state}`);
  console.log(`  txHash:  ${step.txHash ?? '(none)'}`);
  if (step.explorerUrl) {
    console.log(`  explorer: ${step.explorerUrl}`);
  }
  if (step.state === 'error') {
    console.error(`  error:   ${step.errorMessage}`);
  }
  console.log();
}

main().catch(console.error);
