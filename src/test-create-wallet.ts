import 'dotenv/config';
import { generateWallet, getBalance } from './chain';

async function test() {
  const wallet = generateWallet();
  console.log('New receiver address:', wallet.address);
}

test().catch(console.error);