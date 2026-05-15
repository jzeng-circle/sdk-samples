import { spendFromUnifiedBalance } from './treasury.js';

const [, , amount, destinationChain, recipientAddress] = process.argv;
if (!amount || !destinationChain || !recipientAddress) {
  console.error('Usage: tsx src/cli-spend.ts <amount> <destinationChain> <recipientAddress>');
  console.error('Example: tsx src/cli-spend.ts 50 Base_Sepolia 0xRecipient...');
  process.exit(1);
}

spendFromUnifiedBalance({
  amount,
  destinationChain,
  recipientAddress,
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
