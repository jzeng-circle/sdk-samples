import { depositToUnifiedBalance } from './treasury.js';

const [, , chain, amount] = process.argv;
if (!chain || !amount) {
  console.error('Usage: tsx src/cli-deposit.ts <chain> <amount>');
  console.error('Example: tsx src/cli-deposit.ts Arc_Testnet 100');
  process.exit(1);
}

depositToUnifiedBalance(chain, amount).catch((err) => {
  console.error(err);
  process.exit(1);
});
