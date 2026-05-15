/**
 * Test: kit.send() with Circle Wallets adapter
 *
 * Demonstrates that kit.send() ignores the `address` field in the `from` context
 * and calls adapter.getAddress() instead — which throws for developer-controlled adapters.
 *
 * Run: npx tsx src/test-send.ts
 */

import 'dotenv/config';
import { AppKit } from '@circle-fin/app-kit';
import { createCircleWalletsAdapter } from '@circle-fin/adapter-circle-wallets';

const kit = new AppKit();
const circleAdapter = createCircleWalletsAdapter({
  apiKey: process.env.CIRCLE_API_KEY as string,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET as string,
});

const FROM_ADDRESS = process.env.INTERNAL_WALLET_ADDRESS as string;
const TO_ADDRESS   = '0x360919b38e50e5c643e77451aa205017a5eb9816'; // temp wallet (safe recipient for test)

console.log('\n── kit.send() with Circle Wallets adapter (Arc Testnet) ──\n');
console.log('Calling:');
console.log(`  kit.send({`);
console.log(`    from: { adapter: circleAdapter, chain: 'Arc_Testnet', address: '${FROM_ADDRESS}' },`);
console.log(`    to: '${TO_ADDRESS}',`);
console.log(`    amount: '0.01',`);
console.log(`    token: 'USDC',`);
console.log(`  })\n`);

try {
  const result = await kit.send({
    from: {
      adapter: circleAdapter,
      chain: 'Arc_Testnet' as any,
      address: FROM_ADDRESS,
    },
    to: TO_ADDRESS,
    amount: '0.01',
    token: 'USDC',
  });
  console.log('Result:', result);
} catch (err) {
  console.error(err);
}
