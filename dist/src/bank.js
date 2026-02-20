"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pay = pay;
exports.getBalance = getBalance;
const viem_1 = require("viem");
const accounts_1 = require("viem/accounts");
const chains_1 = require("viem/chains");
require("dotenv/config");
// USDC on Base Sepolia
const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const USDC_DECIMALS = 6;
const ERC20_TRANSFER_ABI = [{
        name: 'transfer',
        type: 'function',
        inputs: [
            { name: 'to', type: 'address' },
            { name: 'amount', type: 'uint256' }
        ],
        outputs: [{ type: 'bool' }],
    }];
const privateKey = process.env.PRIVATE_KEY;
const account = (0, accounts_1.privateKeyToAccount)(privateKey);
const walletClient = (0, viem_1.createWalletClient)({
    account,
    chain: chains_1.baseSepolia,
    transport: (0, viem_1.http)(process.env.RPC_URL)
});
const publicClient = (0, viem_1.createPublicClient)({
    chain: chains_1.baseSepolia,
    transport: (0, viem_1.http)(process.env.RPC_URL)
});
async function pay(to, amount) {
    console.log(`💸 Sending ${amount} USDC to ${to}...`);
    try {
        const hash = await walletClient.writeContract({
            address: USDC_ADDRESS,
            abi: ERC20_TRANSFER_ABI,
            functionName: 'transfer',
            args: [to, (0, viem_1.parseUnits)(amount, USDC_DECIMALS)]
        });
        console.log(`✅ Paid! Transaction Hash: ${hash}`);
        return hash;
    }
    catch (error) {
        console.error('❌ Transaction failed:', error);
        throw error;
    }
}
async function getBalance(address) {
    const balance = await publicClient.readContract({
        address: USDC_ADDRESS,
        abi: [{
                name: 'balanceOf',
                type: 'function',
                inputs: [{ name: 'account', type: 'address' }],
                outputs: [{ type: 'uint256' }],
            }],
        functionName: 'balanceOf',
        args: [address]
    });
    // Return human-readable USDC amount
    return (Number(balance) / 10 ** USDC_DECIMALS).toFixed(2);
}
if (require.main === module) {
    pay('0x0000000000000000000000000000000000000000', '0.01');
}
