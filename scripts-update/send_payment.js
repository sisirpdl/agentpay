#!/usr/bin/env node
// send_payment.js <chat_id> <recipient> <amount>
require('dotenv').config({ path: __dirname + '/.env' });

const { createClient } = require('@supabase/supabase-js');
const { generatePrivateKey, privateKeyToAccount } = require('viem/accounts');
const CryptoJS = require('/home/claude/agentpay/node_modules/crypto-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function getOrCreateUser(chatId) {
  const { data: existing } = await supabase
    .from('users')
    .select('wallet_address')
    .eq('telegram_id', chatId)
    .single();

  if (existing) return { user: existing, isNew: false };

  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const encryptedPrivateKey = CryptoJS.AES.encrypt(privateKey, process.env.ENCRYPTION_SECRET).toString();

  await supabase.from('users').insert({
    telegram_id: chatId,
    wallet_address: account.address,
    encrypted_private_key: encryptedPrivateKey,
  });

  return { user: { wallet_address: account.address }, isNew: true };
}

async function main() {
  const [,, chatId, recipient, amount] = process.argv;
  if (!chatId || !recipient || !amount) {
    console.error('Usage: send_payment.js <chat_id> <recipient> <amount>');
    process.exit(1);
  }

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    console.log(JSON.stringify({ status: 'error', message: '❌ Invalid amount.' }));
    return;
  }

  const { isNew } = await getOrCreateUser(chatId);
  const onboardNotice = isNew ? '👋 Wallet created for you!\n\n' : '';

  await supabase
    .from('pending_payments')
    .upsert({
      chat_id: chatId,
      recipient_name: recipient,
      amount: parsedAmount,
      created_at: new Date().toISOString()
    }, { onConflict: 'chat_id' });

  console.log(JSON.stringify({
    status: 'pending',
    to: recipient,
    amount: parsedAmount,
    message: `${onboardNotice}💸 Payment Intent\n\nTo: ${recipient}\nAmount: ${parsedAmount} USDC\n\nConfirm?`
  }));
}

main().catch(err => { console.error(err.message); process.exit(1); });
