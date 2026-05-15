# Treasury Management — Ethers Adapter

Multi-chain treasury management built on App Kit's unified balance (testnet flow).

- Receive USDC on EOAs across Ethereum Sepolia, Base Sepolia, and Arc Testnet
- On Arc Testnet, additionally accept EURC and swap it to USDC before deposit (the only swap pair App Kit currently exposes on testnet)
- Deposit USDC into the unified balance via Circle's Gateway protocol
- Spend on any Gateway-supported chain instantly — no bridging, no rebalancing job

See [`../../02-TREASURY-MANAGEMENT.md`](../../02-TREASURY-MANAGEMENT.md) for the full walkthrough.

## Setup

```bash
npm install
cp .env.example .env
# fill in TREASURY_WALLET_KEY, TREASURY_ADDRESS, and KIT_KEY
```

## Scripts

```bash
npm run balance                                                 # read the unified balance
npm run deposit Arc_Testnet 100                                 # deposit 100 USDC from Arc Testnet
npm run spend 50 Base_Sepolia 0xRecipient...                    # spend 50 USDC on Base Sepolia
npm run demo                                                    # full end-to-end flow (EURC → USDC → deposit → spend)
```

## Files

- `src/config.ts` — env vars and receive-chain configuration
- `src/treasury.ts` — `readUnifiedBalance`, `swapInflowToUsdc`, `depositToUnifiedBalance`, `spendFromUnifiedBalance`
- `src/demo.ts` — end-to-end flow (read → swap → deposit → spend → re-read)
- `src/cli-balance.ts`, `src/cli-deposit.ts`, `src/cli-spend.ts` — individual CLI entrypoints
