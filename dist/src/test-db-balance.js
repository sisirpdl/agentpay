"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const chain_1 = require("./chain");
async function test() {
    const balance = await (0, chain_1.getBalance)('0x2fA72D351654Fe1b5831eD4f3439d94bdb971434');
    console.log('✅ USDC Balance:', balance, 'USDC');
}
test().catch(console.error);
