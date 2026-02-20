import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// ── Users ─────────────────────────────────────────────────────────────────

export async function getUserByTelegramId(telegramId: string) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .single();
  if (error) return null;
  return data;
}

// delegation field stores encrypted private key for demo;
// will store real ERC-7710 delegation JSON once smart-accounts-kit is wired up.
export async function insertUser(telegramId: string, walletAddress: string, delegation: string) {
  const { data, error } = await supabase
    .from('users')
    .insert({
      telegram_id: telegramId,
      wallet_address: walletAddress,
      delegation,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Recipients ────────────────────────────────────────────────────────────

export async function searchRecipients(query: string) {
  const { data, error } = await supabase
    .rpc('search_recipients_fuzzy', { search_query: query });
  if (error) throw error;
  return data;
}

// ── Pending payments ──────────────────────────────────────────────────────

export async function storePendingPayment(
  chatId: string,
  recipientName: string,
  recipientAddress: string,
  amount: number
) {
  const { error } = await supabase
    .from('pending_payments')
    .upsert({
      chat_id: chatId,
      recipient_name: recipientName,
      recipient_address: recipientAddress,
      amount,
    }, { onConflict: 'chat_id' });
  if (error) throw error;
}

export async function getPendingPayment(chatId: string) {
  const { data, error } = await supabase
    .from('pending_payments')
    .select('*')
    .eq('chat_id', chatId)
    .single();
  if (error) return null;
  return data;
}

export async function clearPendingPayment(chatId: string) {
  const { error } = await supabase
    .from('pending_payments')
    .delete()
    .eq('chat_id', chatId);
  if (error) throw error;
}

// ── Transaction history ───────────────────────────────────────────────────

export async function insertTx(tx: {
  senderId: string;
  recipientAddress: string;
  recipientName: string;
  amount: number;
  txHash: string;
  status: 'success' | 'failed';
}) {
  const { data, error } = await supabase
    .from('tx_history')
    .insert({
      sender_id: tx.senderId,
      recipient_address: tx.recipientAddress,
      recipient_name: tx.recipientName,
      amount: tx.amount,
      tx_hash: tx.txHash,
      status: tx.status,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}
