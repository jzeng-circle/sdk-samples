/**
 * Test: kit.swap() with a Circle Developer-Controlled SCA wallet
 *
 * Swaps USDC → EURC on Arc Testnet using explicit contract addresses.
 *
 * Run:
 *   SCA_WALLET_ADDRESS=0x... SCA_WALLET_ID=<uuid> npx tsx src/test-sca-swap.ts
 */

import 'dotenv/config';
import { AppKit } from '@circle-fin/app-kit';
import { createCircleWalletsAdapter } from '@circle-fin/adapter-circle-wallets';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

const CIRCLE_API_KEY       = process.env.CIRCLE_API_KEY as string;
const CIRCLE_ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET as string;
const KIT_KEY              = process.env.KIT_KEY as string;
const SWAP_AMOUNT          = '0.01';

// Arc Testnet token addresses (from app-kit ArcTestnet chain definition)
const USDC_ARC = '0x3600000000000000000000000000000000000000';
const EURC_ARC = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a';

const SCA_WALLET_ADDRESS = process.env.SCA_WALLET_ADDRESS;
const SCA_WALLET_ID      = process.env.SCA_WALLET_ID;

if (!SCA_WALLET_ADDRESS || !SCA_WALLET_ID) {
  console.error('Set SCA_WALLET_ADDRESS and SCA_WALLET_ID env vars (from test-sca-send.ts output)');
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

async function main() {
  console.log('\n── kit.swap() with Circle SCA wallet ──');
  console.log('  USDC → EURC on Arc Testnet (explicit addresses)\n');

  // Check balance first
  const balanceResponse = await circleClient.getWalletTokenBalance({ id: SCA_WALLET_ID! });
  const balances = balanceResponse.data?.tokenBalances ?? [];
  const usdcBalance = balances.find((b: any) => b.token?.symbol?.toUpperCase() === 'USDC');
  const available   = parseFloat((usdcBalance as any)?.amount ?? '0');
  console.log(`  SCA wallet: ${SCA_WALLET_ADDRESS}`);
  console.log(`  USDC balance: ${available}\n`);

  if (available < parseFloat(SWAP_AMOUNT)) {
    console.log(`Need at least ${SWAP_AMOUNT} USDC. Fund the wallet and re-run.`);
    return;
  }

  console.log('Calling kit.swap() with explicit contract addresses:');
  console.log(`  from:     Arc_Testnet  ${SCA_WALLET_ADDRESS}`);
  console.log(`  tokenIn:  ${USDC_ARC}  (USDC)`);
  console.log(`  tokenOut: ${EURC_ARC}  (EURC)`);
  console.log(`  amountIn: ${SWAP_AMOUNT}\n`);

  const result = await kit.swap({
    from: {
      adapter: circleAdapter,
      chain: 'Arc_Testnet' as any,
      address: SCA_WALLET_ADDRESS!,
    },
    tokenIn: USDC_ARC as any,
    tokenOut: EURC_ARC as any,
    amountIn: SWAP_AMOUNT,
    config: { kitKey: KIT_KEY, slippageBps: 50 },
  });

  console.log('Result:');
  console.log(`  txHash: ${result.txHash}`);
  console.log();
}

main().catch(console.error);
