/**
 * Test: Check wallet balances via Circle API
 *
 * Verifies connectivity to the Circle Developer Controlled Wallets API
 * and prints token balances for the internal wallet and wallet set.
 * No funds required — safe to run at any time.
 *
 * Run: npx tsx src/test-check-balance.ts
 */

import 'dotenv/config';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

const CIRCLE_API_KEY       = process.env.CIRCLE_API_KEY as string;
const CIRCLE_ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET as string;
const WALLET_SET_ID        = process.env.WALLET_SET_ID as string;
const INTERNAL_WALLET_ADDRESS = process.env.INTERNAL_WALLET_ADDRESS as string;

if (!CIRCLE_API_KEY || !CIRCLE_ENTITY_SECRET) {
  console.error('Set CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET in .env');
  process.exit(1);
}

const circleClient = initiateDeveloperControlledWalletsClient({
  apiKey: CIRCLE_API_KEY,
  entitySecret: CIRCLE_ENTITY_SECRET,
});

async function main() {
  console.log('\n── Circle Wallet — Balance Check ──\n');
  console.log(`  API key:     ${CIRCLE_API_KEY.slice(0, 20)}...`);
  console.log(`  Wallet set:  ${WALLET_SET_ID}`);
  console.log(`  Internal:    ${INTERNAL_WALLET_ADDRESS}\n`);

  // List all wallets in the wallet set
  const walletsResponse = await circleClient.listWallets({ walletSetId: WALLET_SET_ID });
  const wallets = walletsResponse.data?.wallets ?? [];
  console.log(`  Wallets in set: ${wallets.length}`);

  for (const wallet of wallets.slice(0, 10)) {
    const balResponse = await circleClient.getWalletTokenBalance({ id: wallet.id });
    const balances = balResponse.data?.tokenBalances ?? [];
    const balStr = balances.length
      ? balances.map((b: any) => `${b.token?.symbol ?? '?'} ${b.amount}`).join(', ')
      : '(empty)';
    console.log(`    ${wallet.address}  [${(wallet as any).accountType ?? 'EOA'}]  ${balStr}`);
  }

  if (wallets.length > 10) {
    console.log(`    ... and ${wallets.length - 10} more`);
  }

  console.log('\n  OK — Circle API connection verified\n');
}

main().catch(console.error);
