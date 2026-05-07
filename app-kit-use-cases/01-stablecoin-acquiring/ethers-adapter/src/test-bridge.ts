/**
 * Test: kit.bridge() with Ethers adapter
 *
 * Bridges 0.01 USDC from Ethereum Sepolia → Base Sepolia (or MERCHANT_SETTLEMENT_CHAIN).
 * Recipient is MERCHANT_ADDRESS.
 *
 * Prerequisites:
 *   - Internal wallet funded with USDC on Ethereum Sepolia
 *   - INTERNAL_WALLET_KEY, MERCHANT_ADDRESS, MERCHANT_SETTLEMENT_CHAIN set in .env
 *
 * Run: npx tsx src/test-bridge.ts
 */

import 'dotenv/config';
import { AppKit } from '@circle-fin/app-kit';
import { createEthersAdapterFromPrivateKey } from '@circle-fin/adapter-ethers-v6';
import { ethers, JsonRpcProvider } from 'ethers';

const INTERNAL_WALLET_KEY     = process.env.INTERNAL_WALLET_KEY as string;
const MERCHANT_ADDRESS        = process.env.MERCHANT_ADDRESS as string;
const MERCHANT_SETTLEMENT_CHAIN = process.env.MERCHANT_SETTLEMENT_CHAIN ?? 'Base_Sepolia';
const ALCHEMY_KEY             = process.env.ALCHEMY_KEY;
const BRIDGE_AMOUNT           = '0.01';
const FROM_CHAIN              = 'Ethereum_Sepolia';

if (!INTERNAL_WALLET_KEY || !MERCHANT_ADDRESS) {
  console.error('Set INTERNAL_WALLET_KEY and MERCHANT_ADDRESS in .env');
  process.exit(1);
}

const internalAddress = new ethers.Wallet(INTERNAL_WALLET_KEY).address;

const adapter = createEthersAdapterFromPrivateKey({
  privateKey: INTERNAL_WALLET_KEY,
  ...(ALCHEMY_KEY && {
    getProvider: () =>
      new JsonRpcProvider(`https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`),
  }),
});

const kit = new AppKit();

async function main() {
  console.log('\n── kit.bridge() with Ethers adapter ──\n');
  console.log(`  From:      ${internalAddress}  (${FROM_CHAIN})`);
  console.log(`  To:        ${MERCHANT_ADDRESS}  (${MERCHANT_SETTLEMENT_CHAIN})`);
  console.log(`  Token:     USDC`);
  console.log(`  Amount:    ${BRIDGE_AMOUNT}\n`);

  const result = await kit.bridge({
    from: {
      adapter,
      chain: FROM_CHAIN as any,
    },
    to: {
      chain: MERCHANT_SETTLEMENT_CHAIN as any,
      recipientAddress: MERCHANT_ADDRESS,
    },
    token: 'USDC',
    amount: BRIDGE_AMOUNT,
  });

  console.log(`  Steps: ${result.steps.length}`);
  for (const step of result.steps) {
    const status = step.state === 'error'
      ? `✗  ${step.errorMessage}`
      : `✓  ${step.state}`;
    console.log(`    [${step.name}]  ${status}${step.txHash ? '  tx: ' + step.txHash : ''}`);
    if (step.explorerUrl) console.log(`         ${step.explorerUrl}`);
  }
  console.log();
}

main().catch(console.error);
