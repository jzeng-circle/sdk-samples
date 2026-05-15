/**
 * Test: kit.bridge() with a Circle Developer-Controlled SCA wallet
 *
 * Bridges USDC from Arc Testnet → Ethereum Sepolia using the SCA wallet.
 *
 * Run:
 *   SCA_WALLET_ADDRESS=0x... SCA_WALLET_ID=<uuid> npx tsx src/test-sca-bridge.ts
 */

import 'dotenv/config';
import { AppKit } from '@circle-fin/app-kit';
import { createCircleWalletsAdapter } from '@circle-fin/adapter-circle-wallets';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

const CIRCLE_API_KEY       = process.env.CIRCLE_API_KEY as string;
const CIRCLE_ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET as string;
const BRIDGE_AMOUNT        = '0.01';
const RECIPIENT            = process.env.INTERNAL_WALLET_ADDRESS as string;

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
  console.log('\n── kit.bridge() with Circle SCA wallet ──');
  console.log('  Arc Testnet → Ethereum Sepolia\n');

  // Check balance first
  const balanceResponse = await circleClient.getWalletTokenBalance({ id: SCA_WALLET_ID! });
  const balances = balanceResponse.data?.tokenBalances ?? [];
  const usdcBalance = balances.find((b: any) => b.token?.symbol?.toUpperCase() === 'USDC');
  const available   = parseFloat((usdcBalance as any)?.amount ?? '0');
  console.log(`  SCA wallet: ${SCA_WALLET_ADDRESS}`);
  console.log(`  USDC balance: ${available}\n`);

  if (available < parseFloat(BRIDGE_AMOUNT)) {
    console.log(`Need at least ${BRIDGE_AMOUNT} USDC. Fund the wallet and re-run.`);
    return;
  }

  console.log('Calling kit.bridge():');
  console.log(`  from: Arc_Testnet  ${SCA_WALLET_ADDRESS}`);
  console.log(`  to:   Ethereum_Sepolia  ${RECIPIENT}`);
  console.log(`  token: USDC, amount: ${BRIDGE_AMOUNT}\n`);

  const result = await kit.bridge({
    from: {
      adapter: circleAdapter,
      chain: 'Arc_Testnet' as any,
      address: SCA_WALLET_ADDRESS!,
    },
    to: {
      chain: 'Ethereum_Sepolia' as any,
      recipientAddress: RECIPIENT,
      useForwarder: true,
    },
    token: 'USDC',
    amount: BRIDGE_AMOUNT,
  });

  console.log(`Steps: ${result.steps.length}`);
  for (const step of result.steps) {
    console.log(`  [${step.state}] ${step.name}${step.txHash ? '  tx: ' + step.txHash : ''}${step.errorMessage ? '  err: ' + step.errorMessage : ''}`);
    if (step.explorerUrl) console.log(`         ${step.explorerUrl}`);
  }
  console.log();
}

main().catch(console.error);
