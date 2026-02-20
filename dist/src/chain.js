"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateWallet = generateWallet;
exports.transfer = transfer;
exports.getBalance = getBalance;
exports.createAndStoreWallet = createAndStoreWallet;
require("dotenv/config");
const viem_1 = require("viem");
const accounts_1 = require("viem/accounts");
const chains_1 = require("viem/chains");
const crypto_js_1 = __importDefault(require("crypto-js"));
const db_1 = require("./db");
// USDC on Base Sepolia
const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const USDC_DECIMALS = 6; // USDC uses 6 decimals, not 18
const USDC_ABI = [
    {
        name: 'transfer',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'to', type: 'address' },
            { name: 'amount', type: 'uint256' },
        ],
        outputs: [{ type: 'bool' }],
    },
    {
        name: 'balanceOf',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ type: 'uint256' }],
    },
];
// Public client for reading blockchain data
const publicClient = (0, viem_1.createPublicClient)({
    chain: chains_1.baseSepolia,
    transport: (0, viem_1.http)(),
});
// Generate a new wallet and encrypt the private key
function generateWallet() {
    const privateKey = (0, accounts_1.generatePrivateKey)();
    const account = (0, accounts_1.privateKeyToAccount)(privateKey);
    const encryptedKey = crypto_js_1.default.AES.encrypt(privateKey, process.env.ENCRYPTION_SECRET).toString();
    return {
        address: account.address,
        encryptedPrivateKey: encryptedKey,
    };
}
// Decrypt stored private key
function decryptKey(encryptedKey) {
    const bytes = crypto_js_1.default.AES.decrypt(encryptedKey, process.env.ENCRYPTION_SECRET);
    const privateKey = bytes.toString(crypto_js_1.default.enc.Utf8);
    return (0, accounts_1.privateKeyToAccount)(privateKey);
}
// Send USDC to an address
async function transfer(encryptedPrivateKey, toAddress, amount // human readable e.g. 10 = 10 USDC
) {
    const account = decryptKey(encryptedPrivateKey);
    const walletClient = (0, viem_1.createWalletClient)({
        account,
        chain: chains_1.baseSepolia,
        transport: (0, viem_1.http)(),
    });
    const txHash = await walletClient.writeContract({
        address: USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: 'transfer',
        args: [
            toAddress,
            (0, viem_1.parseUnits)(amount.toString(), USDC_DECIMALS),
        ],
    });
    return txHash;
}
// Get USDC balance of an address
async function getBalance(address) {
    const balance = await publicClient.readContract({
        address: USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: 'balanceOf',
        args: [address],
    });
    return (0, viem_1.formatUnits)(balance, USDC_DECIMALS); // returns e.g. "1.0"
}
// Create wallet and store in Supabase — called during onboarding
// delegation is the MetaMask gator-cli delegation string for this user
async function createAndStoreWallet(telegramId) {
    const wallet = generateWallet();
    const user = await (0, db_1.insertUser)(telegramId, wallet.address, wallet.encryptedPrivateKey);
    return user;
}
