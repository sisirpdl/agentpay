import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function getUserByTelegramId(telegramId: string) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .single();
  if (error) return null;
  return data;
}

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

export async function searchRecipients(query: string) {
  const { data, error } = await supabase
    .rpc('search_recipients_fuzzy', { search_query: query });
  if (error) throw error;
  return data;
}

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
