import 'dotenv/config';
import { createAndStoreWallet } from './chain';

async function test() {
  const user = await createAndStoreWallet('987654321');
  console.log('✅ Wallet stored:', user);
}

test().catch(console.error);