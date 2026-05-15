# Stablecoin Acquiring — Circle Wallets Adapter

Accept stablecoin payments (USDT/DAI/USDC) and settle USDC to merchants using Circle's Programmable Wallets. No private keys in your code — Circle manages wallet custody.

## How it works

```
Customer pays USDT/DAI
       │
       ▼
 Temp Circle wallet         ← created per order via Circle API
 (ETH / BASE / ARB / MATIC)
       │  kit.send()
       ▼
 Internal Circle wallet     ← your aggregation wallet
       │  kit.swap()  (hourly)
       ▼
 USDC (same chain)
       │  kit.bridge()  (daily)
       ▼
 Merchant wallet            ← any chain, minus platform fee
```

**Key difference from the ethers adapter:** wallets are created and controlled by Circle's API. There are no private keys to store or manage. Balance monitoring also goes through Circle's API instead of direct RPC calls.

## Project structure

```
circle-wallet-adapter/
├── src/
│   ├── config.ts       # Env vars, AppKit + circleAdapter init, fee helpers
│   ├── acquiring.ts    # Core logic — all 5 steps + PaymentSession/MerchantConfig types
│   └── demo.ts         # Entry point — runs step 1 live, annotates steps 2–5
├── .env.example        # Required environment variables
├── .npmrc              # Circle private npm registry config
├── package.json
└── tsconfig.json
```

### File responsibilities

| File | Responsibility |
|---|---|
| `config.ts` | Reads env vars; creates the single `AppKit` instance and the single `circleAdapter` instance shared across all operations |
| `acquiring.ts` | Types (`PaymentSession`, `MerchantConfig`) and the five-step business logic |
| `demo.ts` | Runs step 1 against the real Circle API and prints payment instructions; steps 2–5 are annotated and skipped until a wallet has real funds |

## Setup

**1. Install dependencies**

```bash
npm install
```

The `.npmrc` file already points to Circle's private npm registry with credentials.

**2. Configure environment**

```bash
cp .env.example .env
```

| Variable | Where to get it | Description |
|---|---|---|
| `CIRCLE_API_KEY` | [console.circle.com](https://console.circle.com) → API Keys | Format: `TEST_API_KEY:xxxxxx` |
| `CIRCLE_ENTITY_SECRET` | Circle console → Entity Secret | 64-char hex string |
| `WALLET_SET_ID` | Circle console → Wallets → Wallet Sets | UUID of the set to create temp wallets in |
| `INTERNAL_WALLET_ID` | Circle console → Wallets | UUID of your aggregation wallet |
| `INTERNAL_WALLET_ADDRESS` | Circle console → Wallets | On-chain address of the same wallet |
| `PLATFORM_FEE_ADDRESS` | Any EVM wallet you control | Receives the 2.5% platform fee on settlement |
| `KIT_KEY` | Circle App Kit dashboard | Required for `kit.swap()` operations |

**3. Run**

```bash
npm run demo
```

## The five steps

### Step 1 — `createPaymentSession`

Calls `circleClient.createWallets()` to provision a fresh EOA wallet on the customer's chosen chain. The wallet ID and address are stored in `PaymentSession`. No private key is ever returned or stored.

Chain codes (`ETH`, `BASE`, `ARB`, `MATIC`) are mapped to:
- Circle API blockchain IDs: `ETH-SEPOLIA`, `BASE-SEPOLIA`, `ARB-SEPOLIA`, `MATIC-AMOY`
- AppKit chain names: `Ethereum_Sepolia`, `Base_Sepolia`, `Arbitrum_Sepolia`, `Polygon_Amoy_Testnet`

### Step 2 — `monitorPayment`

Polls `circleClient.listWalletBalance()` every 5 seconds until the expected token amount arrives or the session expires (15 minutes). No RPC node or contract ABI required.

### Step 3 — `aggregateToInternalWallet`

Calls `kit.send()` using the Circle adapter. Because `circleAdapter` is developer-controlled, every `from`/`to` context requires an explicit `address` field — unlike the ethers adapter where the address is derived from the private key automatically.

```ts
// Circle adapter — address required
from: { adapter: circleAdapter, address: '0x...', chain: 'Ethereum_Sepolia' }

// Ethers adapter — address forbidden (auto-derived from private key)
from: { adapter: ethersAdapter, chain: 'Ethereum_Sepolia' }
```

### Step 4 — `batchSwapToUSDC`

Hourly job. Calls `kit.swap()` from the internal wallet to convert accumulated USDT/DAI to USDC. Skipped automatically when `token === 'USDC'`.

### Step 5 — `settleMerchant`

Daily job. Calls `kit.bridge()` in `SLOW` mode (zero protocol fees) with a `customFee` that routes 2.5% to `PLATFORM_FEE_ADDRESS`. The `address` in the `to` context is the internal wallet (signer); `recipientAddress` is where the bridged USDC actually lands.
