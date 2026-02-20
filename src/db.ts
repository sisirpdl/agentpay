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
export async function insertUser(telegramId: string, walletAddress: string, encryptedPrivateKey: string) {
  const { data, error } = await supabase
    .from('users')
    .insert({
      telegram_id: telegramId,
      wallet_address: walletAddress,
      delegation: encryptedPrivateKey,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Local contacts (per-user JSONB) ──────────────────────────────────────

export type Contact = { name: string; username?: string; wallet_address: string };

// Search by name substring OR exact @username match
export async function searchLocalContacts(telegramId: string, query: string): Promise<Contact[]> {
  const user = await getUserByTelegramId(telegramId);
  if (!user?.contacts) return [];
  const contacts = user.contacts as Contact[];
  // @username exact match
  if (query.startsWith('@')) {
    const u = query.slice(1).toLowerCase();
    return contacts.filter((c) => c.username?.toLowerCase() === u);
  }
  const q = query.toLowerCase();
  return contacts.filter(
    (c) => c.name.toLowerCase().includes(q) || c.username?.toLowerCase().includes(q)
  );
}

// Append a contact (skip if address already exists)
export async function saveContact(
  telegramId: string,
  name: string,
  wallet_address: string,
  username?: string
) {
  const user = await getUserByTelegramId(telegramId);
  if (!user) return;
  const contacts: Contact[] = user.contacts ?? [];
  const alreadyExists = contacts.some(
    (c) => c.wallet_address.toLowerCase() === wallet_address.toLowerCase()
  );
  if (alreadyExists) return;
  const updated = [...contacts, { name, username, wallet_address }];
  const { error } = await supabase
    .from('users')
    .update({ contacts: updated })
    .eq('telegram_id', telegramId);
  if (error) throw error;
}

// ── Recipients (global Supabase directory) ────────────────────────────────

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
  amount: number,
  recipientUsername?: string
) {
  const { error } = await supabase
    .from('pending_payments')
    .upsert({
      chat_id: chatId,
      recipient_name: recipientName,
      recipient_address: recipientAddress,
      amount,
      recipient_username: recipientUsername ?? null,
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
  status: 'success' | 'reverted';
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
