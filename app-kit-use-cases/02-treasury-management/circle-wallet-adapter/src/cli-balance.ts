import { printBalance, readUnifiedBalance } from './treasury.js';

readUnifiedBalance()
  .then(printBalance)
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
