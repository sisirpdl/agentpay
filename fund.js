#!/usr/bin/env node
// fund.js <wallet_address> <amount_usdc>
// Sends test USDC from the PRIVATE_KEY wallet to any address on Base Sepolia
require('dotenv').config({ path: __dirname + '/.env' });

const { createWalletClient, createPublicClient, http, parseUnits, formatUnits } = require('viem');
const { baseSepolia } = require('viem/chains');
const { privateKeyToAccount } = require('viem/accounts');

const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const USDC_ABI = [
  { name: 'transfer', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
];

async function main() {
  const [,, to, amount] = process.argv;
  if (!to || !amount) {
    console.error('Usage: fund.js <wallet_address> <amount_usdc>');
    process.exit(1);
  }

  const account = privateKeyToAccount(process.env.PRIVATE_KEY);
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(process.env.RPC_URL) });
  const walletClient = createWalletClient({ account, chain: baseSepolia, transport: http(process.env.RPC_URL) });

  const balance = await publicClient.readContract({ address: USDC_ADDRESS, abi: USDC_ABI, functionName: 'balanceOf', args: [account.address] });
  console.log(`Funder balance: ${formatUnits(balance, 6)} USDC`);

  if (balance === 0n) {
    console.error('Funder has no USDC. Get test USDC at: https://faucet.circle.com/');
    console.error(`Funder address: ${account.address}`);
    process.exit(1);
  }

  const parsed = parseUnits(amount, 6);
  if (parsed > balance) {
    console.error(`Insufficient balance. Have ${formatUnits(balance, 6)}, need ${amount}`);
    process.exit(1);
  }

  console.log(`Sending ${amount} USDC to ${to}...`);
  const txHash = await walletClient.writeContract({ address: USDC_ADDRESS, abi: USDC_ABI, functionName: 'transfer', args: [to, parsed] });
  console.log(`✅ Funded! tx: ${txHash}`);
  console.log(`   https://sepolia.basescan.org/tx/${txHash}`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
