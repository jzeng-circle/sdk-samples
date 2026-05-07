/**
 * Test: kit.send() with Ethers adapter
 *
 * Sends 0.01 USDC from the internal wallet to PLATFORM_FEE_ADDRESS
 * on Ethereum Sepolia.
 *
 * Prerequisites:
 *   - Internal wallet funded with USDC on Ethereum Sepolia
 *   - INTERNAL_WALLET_KEY, PLATFORM_FEE_ADDRESS, KIT_KEY set in .env
 *
 * Run: npx tsx src/test-send.ts
 */

import 'dotenv/config';
import { AppKit } from '@circle-fin/app-kit';
import { createEthersAdapterFromPrivateKey } from '@circle-fin/adapter-ethers-v6';
import { ethers, JsonRpcProvider } from 'ethers';

const INTERNAL_WALLET_KEY  = process.env.INTERNAL_WALLET_KEY as string;
const PLATFORM_FEE_ADDRESS = process.env.PLATFORM_FEE_ADDRESS as string;
const ALCHEMY_KEY          = process.env.ALCHEMY_KEY;
const SEND_AMOUNT          = '0.01';
const CHAIN                = 'Ethereum_Sepolia';

if (!INTERNAL_WALLET_KEY) {
  console.error('Set INTERNAL_WALLET_KEY in .env');
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
  console.log('\n── kit.send() with Ethers adapter (Ethereum Sepolia) ──\n');
  console.log(`  From:   ${internalAddress}`);
  console.log(`  To:     ${PLATFORM_FEE_ADDRESS}`);
  console.log(`  Token:  USDC`);
  console.log(`  Amount: ${SEND_AMOUNT}\n`);

  const result = await kit.send({
    from: {
      adapter,
      chain: CHAIN as any,
    },
    to: PLATFORM_FEE_ADDRESS,
    token: 'USDC',
    amount: SEND_AMOUNT,
  });

  console.log(`  state:    ${result.state}`);
  console.log(`  txHash:   ${result.txHash ?? '(none)'}`);
  if (result.explorerUrl) console.log(`  explorer: ${result.explorerUrl}`);
  if (result.state === 'error') console.error(`  error:    ${result.errorMessage}`);
  console.log();
}

main().catch(console.error);
