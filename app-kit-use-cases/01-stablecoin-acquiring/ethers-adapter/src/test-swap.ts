/**
 * Test: kit.swap() with Ethers adapter
 *
 * Swaps 0.01 USDC → EURC on Ethereum Sepolia using KIT_KEY.
 *
 * Prerequisites:
 *   - Internal wallet funded with USDC on Ethereum Sepolia
 *   - INTERNAL_WALLET_KEY and KIT_KEY set in .env
 *
 * Note: Swap availability depends on KIT_KEY permissions and DEX liquidity
 * on the testnet. If swap is unsupported on Sepolia, this will throw.
 *
 * Run: npx tsx src/test-swap.ts
 */

import 'dotenv/config';
import { AppKit } from '@circle-fin/app-kit';
import { createEthersAdapterFromPrivateKey } from '@circle-fin/adapter-ethers-v6';
import { ethers, JsonRpcProvider } from 'ethers';

const INTERNAL_WALLET_KEY = process.env.INTERNAL_WALLET_KEY as string;
const KIT_KEY             = process.env.KIT_KEY as string;
const ALCHEMY_KEY         = process.env.ALCHEMY_KEY;
const SWAP_AMOUNT         = '0.01';
const CHAIN               = 'Ethereum_Sepolia';

// Ethereum Sepolia token addresses
const USDC_SEPOLIA = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
const EURC_SEPOLIA = '0x08210F9170F89Ab7658F0B5E3fF39b0E03C594D4';

if (!INTERNAL_WALLET_KEY || !KIT_KEY) {
  console.error('Set INTERNAL_WALLET_KEY and KIT_KEY in .env');
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
  console.log('\n── kit.swap() with Ethers adapter (Ethereum Sepolia) ──\n');
  console.log(`  Wallet:   ${internalAddress}`);
  console.log(`  Chain:    ${CHAIN}`);
  console.log(`  tokenIn:  ${USDC_SEPOLIA}  (USDC)`);
  console.log(`  tokenOut: ${EURC_SEPOLIA}  (EURC)`);
  console.log(`  amount:   ${SWAP_AMOUNT}\n`);

  const result = await kit.swap({
    from: {
      adapter,
      chain: CHAIN as any,
    },
    tokenIn:  USDC_SEPOLIA as any,
    tokenOut: EURC_SEPOLIA as any,
    amountIn: SWAP_AMOUNT,
    config: { kitKey: KIT_KEY, slippageBps: 50 },
  });

  console.log(`  txHash: ${result.txHash}`);
  console.log();
}

main().catch(console.error);
