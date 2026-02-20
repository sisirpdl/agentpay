"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const chain_1 = require("./chain");
async function test() {
    const wallet = (0, chain_1.generateWallet)();
    console.log('New receiver address:', wallet.address);
}
test().catch(console.error);
