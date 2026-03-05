# Sample Code Style Guide

This document defines the coding style and best practices for writing SDK example code.

## Core Principles

1. **Simple and Direct**: Code should be easy to read and understand at a glance
2. **Minimal Boilerplate**: Remove unnecessary abstractions and verbose explanations
3. **Practical Focus**: Show real-world usage patterns, not theoretical examples
4. **Self-Documenting**: Use clear variable names and inline comments instead of separate documentation blocks

## Code Structure

### 1. File Header

Keep descriptions SHORT and focused on the business problem:

```typescript
/**
 * [Use Case Name]
 *
 * Flow:
 * 1. Step one brief description
 * 2. Step two brief description
 * 3. Step three brief description
 *
 * Benefits: Key benefit in one line
 */
```

**DON'T:**
- Write long paragraphs explaining the problem
- Add separate "BUSINESS SCENARIO" sections
- Duplicate information in multiple places
- Use ASCII art diagrams in code (put in separate .md files)

**DO:**
- Use bullet points for the flow
- Keep header under 15 lines
- Focus on WHAT it does, not WHY (put business context in separate docs)

### 2. Configuration Section

Place configuration constants BEFORE initialization:

```typescript
// ===========================
// CONFIGURATION
// ===========================

const PLATFORM_FEE_PERCENT = 2.5;
const SESSION_EXPIRY_MINUTES = 15;
const SLIPPAGE_BPS = 50;
```

**DO:**
- Set global configuration values at the top
- Use UPPER_CASE for constants
- Add inline comments for clarity
- Avoid passing the same config values repeatedly in code

### 3. Initialization Section

Place ALL initialization at the TOP of the file, after configuration:

```typescript
// ===========================
// INITIALIZATION
// ===========================

const kit = new StablecoinKit();
const internalWalletAdapter = createViemAdapterFromPrivateKey({
  privateKey: process.env.INTERNAL_WALLET_KEY as string,
});

const INTERNAL_WALLET = process.env.INTERNAL_WALLET_ADDRESS || '0xInternal';
```

**DON'T:**
- Create new instances in each function
- Initialize SDKs multiple times
- Use generic names like `adapter` (unclear purpose)
- Put initialization inside functions unless absolutely necessary

**DO:**
- Initialize once at the top
- Use descriptive names: `internalWalletAdapter`, `tempPaymentAdapter` (shows purpose)
- Use UPPER_CASE for addresses/config constants
- Group related initializations together

### 4. Type Definitions

Keep types MINIMAL and focused:

```typescript
// ===========================
// TYPES
// ===========================

interface Order {
  orderId: string;
  amount: string;
  token: string;
}
```

**DON'T:**
- Add fields that aren't used in the example
- Add verbose inline comments for each field (use clear names instead)
- Create separate types for everything
- Include configuration values that should be global constants

**DO:**
- Only include fields that are actually used
- Use clear, self-documenting field names
- Keep interfaces small (3-5 fields ideal)
- Move repeated values (like `platformFeePercent`) to global config

### 5. Helper Functions

Place helper functions at the BOTTOM of the file:

```typescript
// ===========================
// HELPER FUNCTIONS
// ===========================

function calculateAmounts(orderAmount: string) {
  const baseAmount = parseFloat(orderAmount);
  const fee = baseAmount * PLATFORM_FEE_PERCENT / 100;
  const total = baseAmount + fee;

  return { baseAmount, fee, total };
}
```

**DO:**
- Create helpers for repeated calculations
- Place all helpers at the end
- Use helpers to avoid duplicating logic (DRY principle)
- Keep helpers simple and focused

### 6. Main Functions

Write focused, single-purpose functions:

```typescript
async function processPayment(order: Order): Promise<string> {
  // Calculate amounts using helper
  const amounts = calculateAmounts(order.amount);

  // Execute swap
  const result = await kit.swap({
    from: { adapter: internalWalletAdapter, chain: 'Ethereum' },
    tokenIn: order.token,
    tokenOut: 'USDC',
    amount: amounts.total.toFixed(2)
  });

  return result.txHash;
}
```

**DON'T:**
- Add verbose logging in every step
- Create complex error handling for examples
- Return complex objects with lots of metadata
- Add try-catch blocks unless demonstrating error handling
- Repeat calculations (use helpers instead)

**DO:**
- Use inline comments for complex logic
- Return simple types (string, boolean, simple objects)
- Keep functions under 50 lines when possible
- Use descriptive function names
- Use helper functions for repeated calculations

### 7. Logging

Keep console output MINIMAL and INFORMATIVE:

```typescript
console.log(`\n✓ Payment processed`);
console.log(`  TX: ${txHash}`);
console.log(`  Amount: $${amount} USDC`);
```

**DON'T:**
```typescript
console.log('\n=== Step 3: Processing Payment ===\n');
console.log('Order Details:');
console.log(`  Order ID: ${order.orderId}`);
console.log(`  Merchant ID: ${order.merchantId}`);
console.log(`  Amount: ${order.amount}`);
console.log('\nPayment Breakdown:');
console.log(`  Base amount: $${baseAmount.toFixed(2)}`);
console.log(`  Platform fee (${feePercent}%): $${fee.toFixed(2)}`);
console.log(`  Total: $${total.toFixed(2)}`);
console.log('\nProcessing...\n');
```

**DO:**
```typescript
console.log(`\n✓ Payment processed: $${total} USDC`);
console.log(`  TX: ${txHash}`);
```

**Guidelines:**
- Use `✓` for success, `✗` for errors, `⏳` for waiting
- Maximum 3 lines per log statement
- Only log essential information
- Use indentation (2 spaces) for details

### 8. Comments

Use comments to explain LOGIC, not SYNTAX:

**DON'T:**
```typescript
// Create the swap result by calling the swap function
const swapResult = await kit.swap({...});

// Get the transaction hash from the result
const txHash = swapResult.txHash;

// Log the transaction hash to console
console.log(txHash);
```

**DO:**
```typescript
// Swap all accumulated tokens in ONE transaction (saves gas)
const result = await kit.swap({...});

// In production: Update database with transaction details
// await db.orders.updateMany({ status: 'swapped', txHash: result.txHash });

return result.txHash;
```

**Guidelines:**
- Explain WHY, not WHAT
- Use comments for production notes
- Mark TODO or FIXME items
- Keep comments on same line for simple explanations

### 9. SDK Feature Usage

**Platform Fee Collection:**

When using bridge operations with fees:

```typescript
// ✅ DO: Use customFee in bridge config (ONE transaction)
const bridgeResult = await kit.bridge({
  from: { adapter: internalWalletAdapter, chain: 'Ethereum' },
  to: {
    adapter: internalWalletAdapter,
    chain: 'Base',
    recipientAddress: merchantAddress
  },
  amount: totalAmount.toFixed(2),
  config: {
    transferSpeed: 'SLOW',
    customFee: {
      value: platformFee.toFixed(2),
      recipientAddress: PLATFORM_FEE_WALLET
    }
  }
});
```

```typescript
// ❌ DON'T: Separate fee collection transaction
const feeResult = await kit.send({ ... }); // Extra transaction!
const bridgeResult = await kit.bridge({ ... });
```

**DO:**
- Use `customFee` parameter when available to collect fees in one transaction
- Only use separate transactions when on the same chain (no bridge)

### 10. Example Functions

Provide clear, runnable examples that work autonomously:

```typescript
async function runExample() {
  console.log('\n╔════════════════════════════╗');
  console.log('║   USE CASE NAME            ║');
  console.log('╚════════════════════════════╝');

  // Setup data
  const order = {
    orderId: `order_${Date.now()}`, // Unique ID
    amount: '100',
    token: 'USDT'
  };

  // Step 1: Create session
  const session = await createPaymentSession(order);

  console.log(`\n📱 Customer Payment Instructions:`);
  console.log(`   Send ${session.expectedAmount} ${order.token} to:`);
  console.log(`   ${session.paymentAddress}\n`);

  // Step 2: Monitor for payment (real blockchain monitoring)
  const received = await monitorPayment(session);

  if (!received) {
    console.log('\n✗ Payment not received - order cancelled');
    return;
  }

  // Step 3: Process payment
  const txHash = await processPayment(order, session);

  console.log(`\n✓ Complete: ${txHash}`);
}
```

**DON'T:**
- Create 10 different example variations
- Add verbose explanations for each example
- Create separate example files
- Use simulated/fake data that doesn't work

**DO:**
- 1-3 clear examples per file
- Show the most common use case first
- Include one "full flow" example that actually works end-to-end
- Make examples easy to uncomment and run
- Store private keys in session data to enable autonomous execution
- Use real blockchain monitoring when possible (e.g., viem's publicClient)

### 11. Runnable Examples

**Write examples that can execute autonomously:**

When creating temporary wallets or addresses:

```typescript
interface PaymentSession {
  sessionId: string;
  paymentAddress: string;
  paymentPrivateKey: string;  // ✅ Store key in session
  expectedAmount: string;
}

async function createPaymentSession(order: Order): Promise<PaymentSession> {
  // Generate temporary wallet
  const tempKey = `0x${Buffer.from(`payment_${order.orderId}`).toString('hex')}`;
  const tempWallet = privateKeyToAccount(tempKey);

  return {
    sessionId: `session_${order.orderId}`,
    paymentAddress: tempWallet.address,
    paymentPrivateKey: tempKey,  // ✅ Return key for later use
    expectedAmount: '102.50'
  };
}

async function sweepFunds(session: PaymentSession) {
  // ✅ Use stored key to create adapter
  const tempAdapter = createViemAdapterFromPrivateKey({
    privateKey: session.paymentPrivateKey
  });

  await kit.send({
    from: { adapter: tempAdapter, chain: 'Ethereum' },
    to: INTERNAL_WALLET,
    amount: session.expectedAmount,
    token: 'USDT'
  });
}
```

**Real Blockchain Monitoring:**

```typescript
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';

const publicClient = createPublicClient({
  chain: mainnet,
  transport: http()
});

async function monitorPayment(session: PaymentSession): Promise<boolean> {
  const tokenAddress = TOKEN_ADDRESSES[session.token];
  const expectedAmount = parseUnits(session.expectedAmount, 6);

  // ✅ Real blockchain polling
  for (let attempt = 0; attempt < 60; attempt++) {
    const balance = await publicClient.readContract({
      address: tokenAddress,
      abi: [{ name: 'balanceOf', ... }],
      functionName: 'balanceOf',
      args: [session.paymentAddress]
    });

    if (balance >= expectedAmount) {
      return true;
    }

    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  return false;
}
```

**DO:**
- Store private keys in session objects when generating temporary wallets
- Implement real blockchain monitoring with viem/ethers
- Make examples that can run end-to-end without manual intervention
- Provide working code, not just pseudo-code

### 12. Main Entry Point

Keep the main function simple:

```typescript
async function main() {
  if (!process.env.PRIVATE_KEY) {
    console.log('\n⚠️  Set PRIVATE_KEY in .env file\n');
    return;
  }

  // Uncomment to run:
  // await runExample();

  console.log('See comments to run examples');
}

main().catch(console.error);
```

**DON'T:**
- Check every possible environment variable
- Add complex argument parsing
- Create CLI interfaces for examples

**DO:**
- Check only required env vars
- Provide clear instructions
- Keep examples commented out by default
- Use simple error handling

## File Size Guidelines

Target file sizes:
- **Simple examples**: 100-200 lines
- **Medium examples**: 200-400 lines
- **Complex examples**: 400-600 lines
- **Maximum**: 800 lines (split into multiple files if larger)

## What NOT to Include

Examples should NOT include:
- Database integration code
- Authentication/authorization logic
- Complex error handling frameworks
- Retry logic (unless that's the point of the example)
- Logging frameworks
- Testing code
- Build configurations
- Deployment scripts

Keep these in separate documentation or integration guides.

## What TO Include

Examples should include:
- Clear type definitions
- Direct SDK usage
- Inline comments for production notes
- Simple error messages
- Basic validation
- Minimal logging
- Commented sections for "in production" notes

## Documentation Strategy

Keep code files LEAN by moving detailed content to separate files:

### In Code Files (.ts)
- Short header (< 15 lines)
- Inline comments for logic
- Production implementation notes as comments

### In Documentation Files (.md)
- Business scenarios and context
- Detailed flow diagrams
- Architecture explanations
- Cost comparisons
- Security considerations
- Integration guides
- Error handling strategies

### File Organization Example
```
examples/
  use-case-name/
    01-basic-example.ts          (200 lines - focused code)
    02-advanced-example.ts       (300 lines - focused code)
    README.md                    (Overview and links)
    FLOW_DIAGRAM.md             (Visual flows)
    ARCHITECTURE.md             (System design)
    INTEGRATION_GUIDE.md        (Production tips)
```

## Example: Before and After

### ❌ BEFORE (Verbose)

```typescript
/**
 * USE CASE: Payment Processor
 *
 * ===========================
 * BUSINESS SCENARIO
 * ===========================
 *
 * You're building a payment platform that allows customers to pay with various
 * cryptocurrencies, but merchants want to receive USDC on their preferred blockchain.
 *
 * PROBLEM:
 * - Customers have different tokens (USDT, DAI, ETH, etc.) on various chains
 * - Merchants want stable USDC to avoid volatility
 * ... (50 more lines)
 */

// Process a payment for a merchant
async function processPayment(order: Order, merchant: Merchant): Promise<Receipt> {
  console.log('\n=== Processing Payment ===\n');
  console.log('Order Details:');
  console.log(`  Order ID: ${order.orderId}`);
  console.log(`  Merchant: ${merchant.name}`);
  console.log(`  Amount: ${order.amount}`);

  // Create a new kit instance
  const kit = new StablecoinKit();

  // Create adapter from private key
  const adapter = createViemAdapterFromPrivateKey({
    privateKey: process.env.PRIVATE_KEY as string,
  });

  // Calculate the total amount
  const amount = parseFloat(order.amount);

  // Execute the swap
  console.log('\n--- Executing Swap ---');
  const result = await kit.swap({...});

  console.log('✓ Swap completed');
  console.log(`  Transaction Hash: ${result.txHash}`);

  return {
    orderId: order.orderId,
    txHash: result.txHash,
    // ... 10 more fields
  };
}
```

### ✅ AFTER (Clean)

```typescript
/**
 * Payment Processor
 *
 * Flow:
 * 1. Customer pays to temporary address
 * 2. Funds aggregated to internal wallet
 * 3. Batch swap hourly to USDC
 * 4. Settle to merchants daily
 *
 * Benefits: 85% gas savings through batching
 */

// ===========================
// INITIALIZATION
// ===========================

const kit = new StablecoinKit();
const adapter = createViemAdapterFromPrivateKey({
  privateKey: process.env.PRIVATE_KEY as string,
});

// ===========================
// PAYMENT PROCESSING
// ===========================

async function processPayment(order: Order): Promise<string> {
  // Swap to USDC
  const result = await kit.swap({
    from: { adapter, chain: 'Ethereum' },
    tokenIn: order.token,
    tokenOut: 'USDC',
    amount: order.amount
  });

  console.log(`\n✓ Payment processed`);
  console.log(`  TX: ${result.txHash}`);

  return result.txHash;
}
```

## File Organization

Recommended order:
1. File header (< 15 lines)
2. Imports
3. Types
4. Configuration constants
5. Initialization (SDK, adapters, clients)
6. Main functions (in logical order)
7. Scheduled jobs / batch processing
8. Example runner functions
9. Main entry point
10. Helper functions (at the bottom)

## Checklist for Sample Code

Before submitting example code, verify:

- [ ] Header is under 15 lines
- [ ] Configuration constants defined at top
- [ ] All initialization at the top (after config)
- [ ] No repeated SDK instantiation
- [ ] Descriptive adapter names (not generic "adapter")
- [ ] Helper functions at the bottom
- [ ] No repeated calculations (use helpers)
- [ ] Functions are under 50 lines each
- [ ] Logging is minimal (< 3 lines per statement)
- [ ] Comments explain logic, not syntax
- [ ] Types only include used fields
- [ ] Global configs not in interfaces
- [ ] File is under 600 lines
- [ ] Examples can run autonomously
- [ ] Real blockchain monitoring (not simulated)
- [ ] Private keys stored when needed for later use
- [ ] Platform fees use customFee when available
- [ ] Detailed docs are in separate .md files

## Recent Learnings (2026-03-04)

### Key Improvements Applied:

1. **Global Configuration**: Define `PLATFORM_FEE_PERCENT`, `SLIPPAGE_BPS` etc. at the top, not in interfaces or passed repeatedly
2. **Descriptive Naming**: Use `internalWalletAdapter`, `tempPaymentAdapter` instead of generic `adapter`
3. **Helper Functions**: Create helpers like `calculateAmounts()` to avoid repeated calculations, place at bottom
4. **Fee Collection**: Use `customFee` in bridge config for one-transaction fee collection when bridging
5. **Runnable Examples**: Store private keys in session objects, implement real blockchain monitoring
6. **Autonomous Execution**: Examples should work end-to-end with just a private key provided

## Recent Learnings (2026-03-05)

### Keeping Samples Simple for Developers:

7. **Remove reporting/audit steps from samples**: Steps like "generate report" or "save to database" add complexity without teaching SDK usage. Leave these as "Next Steps" in the MD instead — keep the code focused on SDK calls only.
8. **Simplify optional steps aggressively**: Optional steps (e.g., top-up low chains) should be collapsed to the minimum viable code — filter + loop + one SDK call. No verbose inner checks or logging beyond a success/failure line.
9. **Flatten return types for simple operations**: When a step only produces a list of `{ chain, amount }` pairs, don't wrap it in a full `ConsolidationOperation` interface with `status`, `txHashes`, `error`, etc. Keep return types as simple as the data actually used.
10. **Swap before bridge pattern**: When treasury wallets hold mixed stablecoins, add an optional "swap to USDC" step before bridging. This keeps the main treasury in a single asset. Place it between balance-checking and planning — it's a same-chain operation that feeds into the cross-chain step.
11. **Optional steps belong in the flow, not in docs only**: If a step is optional but commonly needed (e.g., token consolidation via swap), include it directly in the code as a clearly labeled optional block. Don't just mention it in the MD — developers follow the code, not the docs.
12. **Never mix bullet-point content into paragraph format**: If content is list-like (multiple items, conditions, or reasons), always use bullet points — never write them as a single run-on sentence. Labels like `**When to use:**`, `**Note:**`, `**Key protection:**` must be followed by bullet points if they contain more than one idea. A short single sentence is fine as a paragraph; anything with multiple clauses or items must be a list.
13. **Use the wallet adapter's own methods consistently**: If a sample uses Circle Wallet adapter, all wallet operations (balance checks, token lookups, etc.) must use Circle Wallet API methods (e.g., `getWalletTokenBalances`). Do not mix with hardcoded mock data or methods from another provider. Similarly, note at the import that the adapter can be swapped with another provider — but make clear that the balance-fetching calls would need to be replaced with that provider's equivalent.
14. **Fetch live data from the wallet, don't hardcode it**: For balance checks and token detection, always call the wallet's API to get the real state. Hardcoded arrays like `nonUsdcHoldings = [...]` defeat the purpose of the sample — use the wallet API to discover what's actually there.
15. **Keep each step's responsibility narrow**: A balance-checking step (Step 1) should only report the total balance per chain — it should not filter by token type or detect non-USDC holdings. Token detection and normalisation belong in the step that actually acts on them (e.g., the swap step). Mixing concerns makes the flow harder to follow and harder to skip optional steps.

## Summary

**Remember: Code should be SIMPLE, DIRECT, PRACTICAL, and RUNNABLE.**

Write code that developers can:
1. Read in 2 minutes
2. Understand the flow immediately
3. Copy-paste and modify easily
4. Run with minimal setup (just provide private key)
5. Execute autonomously from start to finish

When in doubt, make it simpler.
