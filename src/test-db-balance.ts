import 'dotenv/config';
import { getBalance } from './chain';

async function test() {
  const balance = await getBalance('0x2fA72D351654Fe1b5831eD4f3439d94bdb971434');
  console.log('✅ USDC Balance:', balance, 'USDC');
}

test().catch(console.error);