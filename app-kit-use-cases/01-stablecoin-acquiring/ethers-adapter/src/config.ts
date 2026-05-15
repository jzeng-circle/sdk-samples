import 'dotenv/config';
import { AppKit } from '@circle-fin/app-kit';
import { createEthersAdapterFromPrivateKey } from '@circle-fin/adapter-ethers-v6';
import { ethers, JsonRpcProvider } from 'ethers';

// ===========================
// CONFIGURATION
// ===========================

export const PLATFORM_FEE_PERCENT = 2.5;
export const SESSION_EXPIRY_MINUTES = 15;
export const SLIPPAGE_BPS = 50;

export const INTERNAL_WALLET_KEY = process.env.INTERNAL_WALLET_KEY as string;
export const PLATFORM_FEE_ADDRESS = process.env.PLATFORM_FEE_ADDRESS as string;
export const KIT_KEY = process.env.KIT_KEY as string;
export const ALCHEMY_KEY = process.env.ALCHEMY_KEY;
export const MERCHANT_ADDRESS = process.env.MERCHANT_ADDRESS as string;
export const MERCHANT_SETTLEMENT_CHAIN = process.env.MERCHANT_SETTLEMENT_CHAIN ?? 'Base_Sepolia';

// ===========================
// INITIALIZATION
// ===========================

export const kit = new AppKit();

// Internal wallet adapter — used for swaps, settlements, and receiving aggregated funds
export const internalWalletAdapter = createEthersAdapterFromPrivateKey({
  privateKey: INTERNAL_WALLET_KEY,
  // Use Alchemy if key provided, otherwise fall back to public testnet RPC
  ...(ALCHEMY_KEY && {
    getProvider: () =>
      new JsonRpcProvider(`https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`),
  }),
});

export const INTERNAL_WALLET_ADDRESS = new ethers.Wallet(INTERNAL_WALLET_KEY).address;

// ===========================
// TOKEN ADDRESSES (testnet)
// ===========================

export const TOKEN_ADDRESSES: Record<string, Record<string, string>> = {
  Ethereum_Sepolia: {
    USDC: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  },
  Base_Sepolia: {
    USDC: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  },
  Arbitrum_Sepolia: {
    USDC: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
  },
  Polygon_Amoy_Testnet: {
    USDC: '0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582',
  },
};

export const TOKEN_DECIMALS: Record<string, number> = {
  USDC: 6,
};

// Minimal ERC-20 ABI for balance checks
export const ERC20_ABI = ['function balanceOf(address) view returns (uint256)'];

// ===========================
// HELPERS
// ===========================

export function calculateAmounts(orderAmount: string) {
  const baseAmount = parseFloat(orderAmount);
  const fee = baseAmount * PLATFORM_FEE_PERCENT / 100;
  return { baseAmount, fee, total: baseAmount + fee };
}
