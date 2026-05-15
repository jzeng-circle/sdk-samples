import 'dotenv/config';

export const PLATFORM_FEE_PERCENT = 2.5;
export const SESSION_EXPIRY_MINUTES = 15;
export const SLIPPAGE_BPS = 50;

export const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY as string;
export const CIRCLE_ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET as string;
export const INTERNAL_WALLET_ADDRESS = process.env.INTERNAL_WALLET_ADDRESS as string;
export const WALLET_SET_ID = process.env.WALLET_SET_ID as string;
export const PLATFORM_FEE_ADDRESS = process.env.PLATFORM_FEE_ADDRESS as string;
export const KIT_KEY = process.env.KIT_KEY as string;
