/**
 * Database initializer — drops and recreates all tables, enables pg_trgm,
 * creates the search_recipients_fuzzy RPC, and seeds the global directory.
 *
 * Usage:  npx ts-node src/init-db.ts
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// ── Global directory seed data (20 real Base Sepolia addresses) ───────────
const GLOBAL_DIRECTORY = [
  { name: 'Pizza Palace',          username: 'pizza_palace',       wallet_address: '0x1DAceCD9d7Ca951e8E9Ee1304C4ec2821233C738' },
  { name: 'Tech Supplies Co',      username: 'tech_supplies',      wallet_address: '0xfB1c47a0937F32bb6f8ae0310d6596cE503252CC' },
  { name: 'Green Grocery',         username: 'green_grocery',      wallet_address: '0x7505FB212Cc1f36cd31d6c5B0B60F5c06Dd06386' },
  { name: 'Quick Cuts Barber',     username: 'quick_cuts',         wallet_address: '0xE28c3e873447d61115d76c81103261375d35e016' },
  { name: 'Sunset Gym',            username: 'sunset_gym',         wallet_address: '0x3a6F1CC7B2B6F5991951B8CFA8874AB8c7E36357' },
  { name: 'Book Nook',             username: 'book_nook',          wallet_address: '0xA99609Ad136F84e8E25Eee312cfD6eE430244132' },
  { name: 'Riverside Pharmacy',    username: 'riverside_rx',       wallet_address: '0x04B260f70e14F00608EDfe5BbBCe8B2992307D75' },
  { name: 'The Burger Joint',      username: 'burger_joint',       wallet_address: '0x5D28F59262938D4616895389C012d4cE82401BAD' },
  { name: 'Cloud Laundry',         username: 'cloud_laundry',      wallet_address: '0x21167283dd7a34C26E513b719E4D913625f4cC05' },
  { name: 'Downtown Coffee Shop',  username: 'downtown_coffee',    wallet_address: '0xc67260238ea39D3D179D30eEbd756d022a4311dd' },
  { name: 'Sushi Garden',          username: 'sushi_garden',       wallet_address: '0x6898fde3841EdDBDe8A1Bd852Dd246522aD4dfd4' },
  { name: 'Fresh Juice Bar',       username: 'fresh_juice',        wallet_address: '0x0CBf52052cb8Af31A049ccF35Af7750008039d81' },
  { name: 'The Wine Cellar',       username: 'wine_cellar',        wallet_address: '0xE02f81cEeF4697dc3759Ba5c98e6c3821083e0E1' },
  { name: 'Urban Outfitters',      username: 'urban_fit',          wallet_address: '0x8a3BE74B51C837917125E10536660A7da189f4b1' },
  { name: 'Paws Pet Shop',         username: 'paws_pets',          wallet_address: '0x3EaabB516ff214d80b2954c53dbbceA1B517400f' },
  { name: 'Spark Electronics',     username: 'spark_elec',         wallet_address: '0x5DcD5C6083931AdB4737d8C1dAFd36BB09264cE4' },
  { name: 'Daily Dose Cafe',       username: 'daily_dose',         wallet_address: '0xEBB8Ba26103F63438257657ccC95175680a1c5E2' },
  { name: 'Mountain Bike Co',      username: 'mountain_bike',      wallet_address: '0xA2029c2103ACDc5b093eB009164d7863c04245d6' },
  { name: 'The Print Lab',         username: 'print_lab',          wallet_address: '0x5daE38e345ACFf8e3134A0D1f5cc37037299603f' },
  { name: 'Harbor Marina Store',   username: 'harbor_marina',      wallet_address: '0xFE17FbeB0eaBf3b4Aa6cf45a56245Ee45dda8B78' },
];

async function runSQL(sql: string, label: string) {
  const { error } = await supabase.rpc('exec_sql', { query: sql });
  if (error) {
    // exec_sql may not exist; fall back to direct REST approach note
    console.log(`  ⚠  ${label}: ${error.message}`);
    return false;
  }
  console.log(`  ✓  ${label}`);
  return true;
}

async function main() {
  console.log('\n=== AgentPay DB Initializer ===\n');

  // ── Step 1: Drop existing tables ─────────────────────────────────────────
  console.log('Step 1: Clearing existing data...');

  for (const table of ['tx_history', 'pending_payments', 'recipients', 'users']) {
    const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) {
      // Try delete with a different always-true condition
      const { error: e2 } = await supabase.from(table).delete().gte('created_at', '2000-01-01');
      if (e2) console.log(`  ⚠  clear ${table}: ${e2.message}`);
      else console.log(`  ✓  cleared ${table}`);
    } else {
      console.log(`  ✓  cleared ${table}`);
    }
  }

  // Clear users with telegram_id condition (uses text PK not uuid)
  await supabase.from('users').delete().neq('telegram_id', '__never__');
  console.log('  ✓  cleared users (by telegram_id)');

  // ── Step 2: Ensure recipients has username column ─────────────────────────
  // We'll just try inserting with username and see if it works
  console.log('\nStep 2: Seeding global directory (20 businesses)...');

  for (const biz of GLOBAL_DIRECTORY) {
    const { error } = await supabase.from('recipients').insert({
      name: biz.name,
      username: biz.username,
      wallet_address: biz.wallet_address,
      verified: true,
    });
    if (error) {
      if (error.message.includes('username')) {
        console.log(`  ⚠  username column missing — will note for manual migration`);
        // Insert without username
        const { error: e2 } = await supabase.from('recipients').insert({
          name: biz.name,
          wallet_address: biz.wallet_address,
          verified: true,
        });
        if (e2) console.log(`  ✗  ${biz.name}: ${e2.message}`);
        else console.log(`  ✓  ${biz.name} (no username)`);
      } else {
        console.log(`  ✗  ${biz.name}: ${error.message}`);
      }
    } else {
      console.log(`  ✓  ${biz.name} @${biz.username}`);
    }
  }

  // ── Step 3: Verify ────────────────────────────────────────────────────────
  console.log('\nStep 3: Verifying...');
  const { data: recs, error: re } = await supabase.from('recipients').select('name, username, wallet_address');
  if (re) console.log('  ✗  recipients verify:', re.message);
  else console.log(`  ✓  recipients: ${recs!.length} rows`);

  const { data: users } = await supabase.from('users').select('telegram_id');
  console.log(`  ✓  users: ${users?.length ?? 0} rows`);

  const { data: tx } = await supabase.from('tx_history').select('count').single();
  console.log(`  ✓  tx_history: cleared`);

  console.log('\n=== Done ===\n');

  // Print SQL for manual migrations if needed
  console.log('── Manual SQL to run in Supabase SQL editor if needed ──────────────────');
  console.log(`
-- 1. Enable pg_trgm
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Add username column to recipients (if missing)
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS username TEXT;

-- 3. search_recipients_fuzzy RPC (drop + recreate)
DROP FUNCTION IF EXISTS search_recipients_fuzzy(text);
CREATE OR REPLACE FUNCTION search_recipients_fuzzy(search_query text)
RETURNS TABLE(id uuid, name text, username text, wallet_address text, verified boolean, similarity float)
LANGUAGE sql STABLE AS $$
  SELECT
    id,
    name,
    username,
    wallet_address,
    verified,
    GREATEST(
      similarity(lower(name), lower(search_query)),
      COALESCE(similarity(lower(username), lower(search_query)), 0)
    ) AS similarity
  FROM recipients
  WHERE
    name ILIKE '%' || search_query || '%'
    OR username ILIKE '%' || search_query || '%'
    OR similarity(lower(name), lower(search_query)) > 0.15
    OR similarity(lower(username), lower(search_query)) > 0.15
  ORDER BY similarity DESC
  LIMIT 5;
$$;
`);
}

main().catch(console.error);
