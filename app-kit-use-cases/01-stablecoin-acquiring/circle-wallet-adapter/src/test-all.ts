/**
 * Test: Comprehensive kit operations with Circle Developer-Controlled SCA wallet
 *
 * Runs send → bridge → swap in sequence using a single SCA wallet on Arc Testnet.
 *
 * Prerequisites:
 *   1. Run test-sca-send.ts once to provision an SCA wallet
 *   2. Fund the wallet with USDC on Arc Testnet (faucet or transfer)
 *   3. Set SCA_WALLET_ADDRESS + SCA_WALLET_ID in env (printed by step 1)
 *
 * Usage:
 *   SCA_WALLET_ADDRESS=0x... SCA_WALLET_ID=<uuid> npx tsx src/test-all.ts
 *
 *   # Skip specific tests:
 *   SKIP_BRIDGE=1 SCA_WALLET_ADDRESS=0x... SCA_WALLET_ID=<uuid> npx tsx src/test-all.ts
 */

import 'dotenv/config';
import { AppKit } from '@circle-fin/app-kit';
import { createCircleWalletsAdapter } from '@circle-fin/adapter-circle-wallets';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

const CIRCLE_API_KEY       = process.env.CIRCLE_API_KEY as string;
const CIRCLE_ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET as string;
const KIT_KEY              = process.env.KIT_KEY as string;
const INTERNAL_WALLET_ADDRESS = process.env.INTERNAL_WALLET_ADDRESS as string;

const SCA_WALLET_ADDRESS = process.env.SCA_WALLET_ADDRESS;
const SCA_WALLET_ID      = process.env.SCA_WALLET_ID;

const SKIP_BRIDGE = !!process.env.SKIP_BRIDGE;
const SKIP_SWAP   = !!process.env.SKIP_SWAP;

const TEST_AMOUNT = '0.01';

// Arc Testnet token addresses
const USDC_ARC = '0x3600000000000000000000000000000000000000';
const EURC_ARC = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a';

if (!SCA_WALLET_ADDRESS || !SCA_WALLET_ID) {
  console.error('\nSet SCA_WALLET_ADDRESS and SCA_WALLET_ID (run test-sca-send.ts first to provision)\n');
  process.exit(1);
}

const kit = new AppKit();

const circleAdapter = createCircleWalletsAdapter({
  apiKey: CIRCLE_API_KEY,
  entitySecret: CIRCLE_ENTITY_SECRET,
});

const circleClient = initiateDeveloperControlledWalletsClient({
  apiKey: CIRCLE_API_KEY,
  entitySecret: CIRCLE_ENTITY_SECRET,
});

// ── helpers ──────────────────────────────────────────────────────────────────

function pass(label: string) { console.log(`  ✓  ${label}`); }
function fail(label: string, err: unknown) { console.log(`  ✗  ${label}: ${(err as Error).message ?? err}`); }
function skip(label: string) { console.log(`  –  ${label} (skipped)`); }

async function getUsdcBalance(walletId: string): Promise<number> {
  const resp = await circleClient.getWalletTokenBalance({ id: walletId });
  const b = (resp.data?.tokenBalances ?? []).find(
    (b: any) => b.token?.symbol?.toUpperCase() === 'USDC'
  );
  return parseFloat((b as any)?.amount ?? '0');
}

// ── tests ─────────────────────────────────────────────────────────────────────

async function testSend() {
  console.log('\n[1/3] kit.send()  Arc Testnet → internal wallet');
  try {
    const result = await kit.send({
      from: {
        adapter: circleAdapter,
        chain: 'Arc_Testnet' as any,
        address: SCA_WALLET_ADDRESS!,
      },
      to: INTERNAL_WALLET_ADDRESS,
      token: 'USDC',
      amount: TEST_AMOUNT,
    });

    pass(`state: ${result.state}  tx: ${result.txHash ?? '(pending)'}`)
    if (result.explorerUrl) console.log(`       ${result.explorerUrl}`);

    if (result.state === 'error') {
      fail('send', result.errorMessage ?? 'unknown error');
    }
  } catch (err) {
    fail('send', err);
  }
}

async function testBridge() {
  if (SKIP_BRIDGE) { skip('[2/3] kit.bridge()'); return; }
  console.log('\n[2/3] kit.bridge()  Arc Testnet → Ethereum Sepolia');
  try {
    const result = await kit.bridge({
      from: {
        adapter: circleAdapter,
        chain: 'Arc_Testnet' as any,
        address: SCA_WALLET_ADDRESS!,
      },
      to: {
        chain: 'Ethereum_Sepolia' as any,
        recipientAddress: INTERNAL_WALLET_ADDRESS,
        useForwarder: true,
      },
      token: 'USDC',
      amount: TEST_AMOUNT,
    });

    for (const step of result.steps) {
      const status = step.state === 'error' ? `✗ ${step.errorMessage}` : `✓ ${step.state}`;
      console.log(`  [${step.name}]  ${status}${step.txHash ? '  tx: ' + step.txHash : ''}`);
      if (step.explorerUrl) console.log(`       ${step.explorerUrl}`);
    }
  } catch (err) {
    fail('bridge', err);
  }
}

async function testSwap() {
  if (SKIP_SWAP) { skip('[3/3] kit.swap()'); return; }
  console.log('\n[3/3] kit.swap()  USDC → EURC on Arc Testnet');
  try {
    const result = await kit.swap({
      from: {
        adapter: circleAdapter,
        chain: 'Arc_Testnet' as any,
        address: SCA_WALLET_ADDRESS!,
      },
      tokenIn:  USDC_ARC as any,
      tokenOut: EURC_ARC as any,
      amountIn: TEST_AMOUNT,
      config: { kitKey: KIT_KEY, slippageBps: 50 },
    });

    pass(`txHash: ${result.txHash}`);
  } catch (err) {
    fail('swap', err);
  }
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║  Circle Wallet — kit operations test suite  ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`\n  Wallet: ${SCA_WALLET_ADDRESS}`);
  console.log(`  Amount: ${TEST_AMOUNT} USDC per test`);

  const balance = await getUsdcBalance(SCA_WALLET_ID!);
  console.log(`  USDC balance: ${balance}`);

  const minRequired = parseFloat(TEST_AMOUNT) * (1 + (SKIP_BRIDGE ? 0 : 1) + (SKIP_SWAP ? 0 : 1));
  if (balance < minRequired) {
    console.log(`\n  Insufficient balance — need at least ${minRequired} USDC.`);
    console.log('  Fund the wallet on Arc Testnet and re-run.\n');
    process.exit(1);
  }

  await testSend();
  await testBridge();
  await testSwap();

  console.log('\n  Done.\n');
}

main().catch(console.error);
