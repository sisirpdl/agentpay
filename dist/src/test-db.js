"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const db_1 = require("./db");
async function test() {
    // Test 1: insertUser
    console.log('Testing insertUser...');
    const user = await (0, db_1.insertUser)('123456789', '0xTestWalletAddress', 'encrypted_key_placeholder');
    console.log('✅ insertUser:', user);
    // Test 2: searchRecipients
    console.log('\nTesting searchRecipients...');
    const results = await (0, db_1.searchRecipients)('coffee');
    console.log('✅ searchRecipients:', results);
    // Test 3: insertTx
    console.log('\nTesting insertTx...');
    const tx = await (0, db_1.insertTx)({
        senderId: '123456789',
        recipientAddress: '0x1111111111111111111111111111111111111111',
        recipientName: 'Downtown Coffee Shop',
        amount: 10,
        txHash: '0xfaketxhash123',
        status: 'success'
    });
    console.log('✅ insertTx:', tx);
}
test().catch(console.error);
