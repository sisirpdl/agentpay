#!/usr/bin/env node
// onboard.js <chat_id>
require('dotenv').config({ path: __dirname + '/.env' });

const { createClient } = require('@supabase/supabase-js');
const { generatePrivateKey, privateKeyToAccount } = require('viem/accounts');
const CryptoJS = require('/home/claude/agentpay/node_modules/crypto-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function main() {
  const chatId = process.argv[2];
  if (!chatId) { console.error('Usage: onboard.js <chat_id>'); process.exit(1); }

  const { data: existing } = await supabase
    .from('users')
    .select('wallet_address')
    .eq('telegram_id', chatId)
    .single();

  if (existing) {
    console.log(JSON.stringify({
      isNew: false,
      address: existing.wallet_address,
      message: `👋 Welcome back! Address: ${existing.wallet_address}\n\nTry: pay [name] [amount]`
    }));
    return;
  }

  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const encryptedPrivateKey = CryptoJS.AES.encrypt(privateKey, process.env.ENCRYPTION_SECRET).toString();

  const { error } = await supabase.from('users').insert({
    telegram_id: chatId,
    wallet_address: account.address,
    encrypted_private_key: encryptedPrivateKey,
  });

  if (error) { console.error('DB error:', error.message); process.exit(1); }

  console.log(JSON.stringify({
    isNew: true,
    address: account.address,
    message: `👋 Wallet created!\n\nAddress: ${account.address}\nBalance: 0 USDC\n\nFund your wallet with test USDC, then try: pay [name] [amount]`
  }));
}

main().catch(err => { console.error(err.message); process.exit(1); });
