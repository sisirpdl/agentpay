#!/usr/bin/env node
// confirm_payment.js <chat_id>
require('dotenv').config({ path: __dirname + '/.env' });

const { createClient } = require('@supabase/supabase-js');
const { createWalletClient, http, parseUnits } = require('viem');
const { baseSepolia } = require('viem/chains');
const { privateKeyToAccount } = require('viem/accounts');
const CryptoJS = require('/home/claude/agentpay/node_modules/crypto-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const USDC_ABI = [{ name: 'transfer', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] }];

async function main() {
  const chatId = process.argv[2];
  if (!chatId) { console.error('Usage: confirm_payment.js <chat_id>'); process.exit(1); }

  // 1. Get pending payment
  const { data: pending } = await supabase
    .from('pending_payments')
    .select('*')
    .eq('chat_id', chatId)
    .single();

  if (!pending) {
    console.log(JSON.stringify({ status: 'error', message: '❌ No pending payment found.' }));
    return;
  }

  // 2. Get sender's encrypted key
  const { data: sender } = await supabase
    .from('users')
    .select('encrypted_private_key')
    .eq('telegram_id', chatId)
    .single();

  if (!sender?.encrypted_private_key) {
    console.log(JSON.stringify({ status: 'error', message: '❌ Wallet not set up. Say hi to onboard.' }));
    return;
  }

  // 3. Fuzzy-search recipient
  const { data: recipients, error: searchErr } = await supabase
    .rpc('search_recipients_fuzzy', { search_query: pending.recipient_name });

  if (searchErr || !recipients?.length) {
    console.log(JSON.stringify({ status: 'error', message: `❌ Recipient "${pending.recipient_name}" not found.` }));
    return;
  }

  const recipient = recipients[0];

  // 4. Decrypt key and transfer
  const privateKey = CryptoJS.AES.decrypt(sender.encrypted_private_key, process.env.ENCRYPTION_SECRET).toString(CryptoJS.enc.Utf8);
  const account = privateKeyToAccount(privateKey);

  const walletClient = createWalletClient({ account, chain: baseSepolia, transport: http(process.env.RPC_URL) });

  const txHash = await walletClient.writeContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: 'transfer',
    args: [recipient.wallet_address, parseUnits(pending.amount.toString(), 6)],
  });

  // 5. Record tx and clear pending
  await supabase.from('tx_history').insert({
    sender_id: chatId,
    recipient_address: recipient.wallet_address,
    recipient_name: recipient.name,
    amount: pending.amount,
    tx_hash: txHash,
    status: 'success',
  });

  await supabase.from('pending_payments').delete().eq('chat_id', chatId);

  console.log(JSON.stringify({
    status: 'success',
    txHash,
    message: `✅ Sent ${pending.amount} USDC to ${recipient.name}\n\nTx: ${txHash}`
  }));
}

main().catch(err => { console.error(err.message); process.exit(1); });
