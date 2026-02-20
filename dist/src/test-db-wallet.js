"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const chain_1 = require("./chain");
async function test() {
    const user = await (0, chain_1.createAndStoreWallet)('987654321');
    console.log('✅ Wallet stored:', user);
}
test().catch(console.error);
