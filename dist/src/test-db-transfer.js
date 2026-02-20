"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const chain_1 = require("./chain");
const db_1 = require("./db");
async function test() {
    const encryptedKey = 'U2FsdGVkX1+DfmiAy+kJnOlU7pQ4hx5puYwp5A82Id8rZceurpUZ/uyGUOPJD16vuIIKqqY2nkQwY8VfYiIKxzigEAs/j9Dt7ZKVYAFt+LqWJ4XGGLrGUVlZ8ITtVhcJ';
    const senderAddress = '0x2fA72D351654Fe1b5831eD4f3439d94bdb971434';
    // Get coffee shop address from Supabase
    const matches = await (0, db_1.searchRecipients)('coffee');
    const coffee = matches[0];
    console.log('Sending to:', coffee.name, coffee.wallet_address);
    console.log('Balance before:', await (0, chain_1.getBalance)(senderAddress), 'USDC');
    const txHash = await (0, chain_1.transfer)(encryptedKey, coffee.wallet_address, 0.1);
    console.log('✅ TX Hash:', txHash);
    // Check receiver got it
    console.log('Coffee balance after:', await (0, chain_1.getBalance)(coffee.wallet_address), 'USDC');
}
test().catch(console.error);
