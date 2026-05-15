import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const TREASURY_WALLET_KEY = required('TREASURY_WALLET_KEY');
export const TREASURY_ADDRESS = required('TREASURY_ADDRESS');
export const KIT_KEY = process.env.KIT_KEY ?? '';

export const SLIPPAGE_BPS = 50; // 0.5% — used for kit.swap()

// Chains the treasury holds an EOA on for receiving inflows.
// Outflows can target any Gateway-supported chain, not only these.
export const RECEIVE_CHAINS = ['Ethereum_Sepolia', 'Base_Sepolia', 'Arc_Testnet'] as const;
export type ReceiveChain = (typeof RECEIVE_CHAINS)[number];

// Non-USDC tokens we accept on each receive chain. Triggers a swap before deposit.
// On testnet, App Kit currently exposes the EURC ↔ USDC pair on Arc Testnet only.
export const NON_USDC_INFLOWS: Record<string, string[]> = {
  Ethereum_Sepolia: [],
  Base_Sepolia: [],
  Arc_Testnet: ['EURC'],
};
