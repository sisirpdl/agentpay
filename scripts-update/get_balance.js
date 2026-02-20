#!/usr/bin/env node
// get_balance.js <chat_id>
require('dotenv').config({ path: __dirname + '/.env' });

const { createClient } = require('@supabase/supabase-js');
const { createPublicClient, http, formatUnits } = require('viem');
const { baseSepolia } = require('viem/chains');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const USDC_ABI = [{ name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] }];

const publicClient = createPublicClient({ chain: baseSepolia, transport: http(process.env.RPC_URL) });

async function main() {
  const chatId = process.argv[2];
  if (!chatId) { console.error('Usage: get_balance.js <chat_id>'); process.exit(1); }

  const { data: user } = await supabase
    .from('users')
    .select('wallet_address')
    .eq('telegram_id', chatId)
    .single();

  if (!user) {
    console.log(JSON.stringify({ message: "❌ No wallet found. Say 'hi' to create one." }));
    return;
  }

  const raw = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: [user.wallet_address],
  });

  const balance = formatUnits(raw, 6);

  console.log(JSON.stringify({
    address: user.wallet_address,
    balance,
    message: `💰 Balance: ${balance} USDC\n\nAddress: ${user.wallet_address}`
  }));
}

main().catch(err => { console.error(err.message); process.exit(1); });
