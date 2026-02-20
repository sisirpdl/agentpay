import 'dotenv/config';
import { transfer, getBalance } from './chain';

async function test() {
  const encryptedKey = 'U2FsdGVkX1+DfmiAy+kJnOlU7pQ4hx5puYwp5A82Id8rZceurpUZ/uyGUOPJD16vuIIKqqY2nkQwY8VfYiIKxzigEAs/j9Dt7ZKVYAFt+LqWJ4XGGLrGUVlZ8ITtVhcJ';
  
  // Send 0.1 USDC to Downtown Coffee Shop's test address
  const toAddress = '0x1111111111111111111111111111111111111111';
  
  console.log('Balance before:', await getBalance('0x2fA72D351654Fe1b5831eD4f3439d94bdb971434'), 'USDC');
  
  console.log('Sending 0.1 USDC...');
  const txHash = await transfer(encryptedKey, toAddress, 1);
  console.log('✅ TX Hash:', txHash);
  
  console.log('Balance after:', await getBalance('0x2fA72D351654Fe1b5831eD4f3439d94bdb971434'), 'USDC');
}

test().catch(console.error);