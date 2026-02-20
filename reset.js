#!/usr/bin/env node
// reset.js — wipe users, pending_payments, tx_history. recipients untouched.
require('dotenv').config({ path: __dirname + '/.env' });

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function clearTable(table, column) {
  const { error } = await supabase.from(table).delete().neq(column, 'x');
  if (error) console.error(`  ✗ ${table}:`, error.message);
  else console.log(`  ✓ cleared ${table}`);
}

async function main() {
  console.log('Resetting test state...');
  await clearTable('pending_payments', 'chat_id');
  await clearTable('tx_history', 'tx_hash');
  await clearTable('users', 'telegram_id');
  console.log('Done. Recipients untouched.');
}

main().catch(err => { console.error(err.message); process.exit(1); });
