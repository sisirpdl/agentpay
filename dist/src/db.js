"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserByTelegramId = getUserByTelegramId;
exports.insertUser = insertUser;
exports.searchLocalContacts = searchLocalContacts;
exports.isAddressInContacts = isAddressInContacts;
exports.saveContact = saveContact;
exports.searchRecipients = searchRecipients;
exports.checkLimits = checkLimits;
exports.storePendingPayment = storePendingPayment;
exports.getPendingPayment = getPendingPayment;
exports.clearPendingPayment = clearPendingPayment;
exports.insertTx = insertTx;
const supabase_js_1 = require("@supabase/supabase-js");
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
// ── Users ─────────────────────────────────────────────────────────────────
async function getUserByTelegramId(telegramId) {
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('telegram_id', telegramId)
        .single();
    if (error)
        return null;
    return data;
}
// delegation field stores encrypted private key for demo;
// will store real ERC-7710 delegation JSON once smart-accounts-kit is wired up.
async function insertUser(telegramId, walletAddress, encryptedPrivateKey) {
    const { data, error } = await supabase
        .from('users')
        .insert({
        telegram_id: telegramId,
        wallet_address: walletAddress,
        delegation: encryptedPrivateKey,
        limits: { per_tx_max: 500, daily_max: 2000 },
    })
        .select()
        .single();
    if (error)
        throw error;
    return data;
}
// Search by name substring OR exact @username match
async function searchLocalContacts(telegramId, query) {
    const user = await getUserByTelegramId(telegramId);
    if (!user?.contacts)
        return [];
    const contacts = user.contacts;
    // @username exact match
    if (query.startsWith('@')) {
        const u = query.slice(1).toLowerCase();
        return contacts.filter((c) => c.username?.toLowerCase() === u);
    }
    const q = query.toLowerCase();
    return contacts.filter((c) => c.name.toLowerCase().includes(q) || c.username?.toLowerCase().includes(q));
}
// Check if a specific wallet address is already in the user's local contacts
async function isAddressInContacts(telegramId, walletAddress) {
    const user = await getUserByTelegramId(telegramId);
    if (!user?.contacts)
        return false;
    const contacts = user.contacts;
    return contacts.some((c) => c.wallet_address.toLowerCase() === walletAddress.toLowerCase());
}
// Append a contact (skip if address already exists)
async function saveContact(telegramId, name, wallet_address, username) {
    const user = await getUserByTelegramId(telegramId);
    if (!user)
        return;
    const contacts = user.contacts ?? [];
    const alreadyExists = contacts.some((c) => c.wallet_address.toLowerCase() === wallet_address.toLowerCase());
    if (alreadyExists)
        return;
    const updated = [...contacts, { name, username, wallet_address }];
    const { error } = await supabase
        .from('users')
        .update({ contacts: updated })
        .eq('telegram_id', telegramId);
    if (error)
        throw error;
}
// ── Recipients (global Supabase directory) ────────────────────────────────
async function searchRecipients(query) {
    const { data, error } = await supabase
        .rpc('search_recipients_fuzzy', { search_query: query });
    if (error)
        throw error;
    return data;
}
async function checkLimits(chatId, amount) {
    const user = await getUserByTelegramId(chatId);
    if (!user)
        return { allowed: false, reason: 'User not found.', daily_remaining: 0 };
    const limits = user.limits ?? {
        per_tx_max: 500,
        daily_max: 2000,
    };
    // Per-transaction limit
    if (amount > limits.per_tx_max) {
        return {
            allowed: false,
            reason: `Amount ${amount} USDC exceeds your per-transaction limit of ${limits.per_tx_max} USDC.`,
            daily_remaining: 0,
        };
    }
    // Daily limit: sum successful txs in the last 24 hours
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: txs, error } = await supabase
        .from('tx_history')
        .select('amount')
        .eq('sender_id', chatId)
        .eq('status', 'success')
        .gte('created_at', since);
    if (error)
        throw error;
    const dailySpent = (txs ?? []).reduce((sum, t) => sum + Number(t.amount), 0);
    const daily_remaining = limits.daily_max - dailySpent;
    if (dailySpent + amount > limits.daily_max) {
        return {
            allowed: false,
            reason: `This payment would exceed your daily limit of ${limits.daily_max} USDC. Daily remaining: ${daily_remaining.toFixed(2)} USDC.`,
            daily_remaining,
        };
    }
    return { allowed: true, reason: '', daily_remaining: daily_remaining - amount };
}
// ── Pending payments ──────────────────────────────────────────────────────
async function storePendingPayment(chatId, recipientName, recipientAddress, amount, recipientUsername, riskScore) {
    const { error } = await supabase
        .from('pending_payments')
        .upsert({
        chat_id: chatId,
        recipient_name: recipientName,
        recipient_address: recipientAddress,
        amount,
        recipient_username: recipientUsername ?? null,
        risk_score: riskScore ?? 0,
    }, { onConflict: 'chat_id' });
    if (error)
        throw error;
}
async function getPendingPayment(chatId) {
    const { data, error } = await supabase
        .from('pending_payments')
        .select('*')
        .eq('chat_id', chatId)
        .single();
    if (error)
        return null;
    return data;
}
async function clearPendingPayment(chatId) {
    const { error } = await supabase
        .from('pending_payments')
        .delete()
        .eq('chat_id', chatId);
    if (error)
        throw error;
}
// ── Transaction history ───────────────────────────────────────────────────
async function insertTx(tx) {
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
    if (error)
        throw error;
    return data;
}
