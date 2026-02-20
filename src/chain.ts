import 'dotenv/config';
import {
  createWalletClient,
  createPublicClient,
  http,
  formatUnits,
  parseUnits,
} from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import CryptoJS from 'crypto-js';
import { insertUser } from './db';

// USDC on Base Sepolia
const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const;
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
] as const;

// Public client for reading blockchain data
const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});

// Generate a new wallet and encrypt the private key
export function generateWallet() {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const encryptedKey = CryptoJS.AES.encrypt(
    privateKey,
    process.env.ENCRYPTION_SECRET!
  ).toString();

  return {
    address: account.address,
    encryptedPrivateKey: encryptedKey,
  };
}

// Decrypt stored private key
function decryptKey(encryptedKey: string) {
  const bytes = CryptoJS.AES.decrypt(encryptedKey, process.env.ENCRYPTION_SECRET!);
  const privateKey = bytes.toString(CryptoJS.enc.Utf8) as `0x${string}`;
  return privateKeyToAccount(privateKey);
}

// Send USDC to an address
export async function transfer(
  encryptedPrivateKey: string,
  toAddress: string,
  amount: number // human readable e.g. 10 = 10 USDC
) {
  const account = decryptKey(encryptedPrivateKey);

  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(),
  });

  const txHash = await walletClient.writeContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: 'transfer',
    args: [
      toAddress as `0x${string}`,
      parseUnits(amount.toString(), USDC_DECIMALS),
    ],
  });

  return txHash;
}

// Get USDC balance of an address
export async function getBalance(address: string) {
  const balance = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
  });

  return formatUnits(balance, USDC_DECIMALS); // returns e.g. "1.0"
}

// Create wallet and store in Supabase — called during onboarding
// delegation is the MetaMask gator-cli delegation string for this user
export async function createAndStoreWallet(telegramId: string) {
  const wallet = generateWallet();
  const user = await insertUser(telegramId, wallet.address, wallet.encryptedPrivateKey);
  return user;
}