"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserByTelegramId = getUserByTelegramId;
exports.insertUser = insertUser;
exports.searchRecipients = searchRecipients;
exports.insertTx = insertTx;
const supabase_js_1 = require("@supabase/supabase-js");
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
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
async function insertUser(telegramId, walletAddress, encryptedPrivateKey) {
    const { data, error } = await supabase
        .from('users')
        .insert({
        telegram_id: telegramId,
        wallet_address: walletAddress,
        encrypted_private_key: encryptedPrivateKey,
    })
        .select()
        .single();
    if (error)
        throw error;
    return data;
}
async function searchRecipients(query) {
    const { data, error } = await supabase
        .rpc('search_recipients_fuzzy', { search_query: query });
    if (error)
        throw error;
    return data;
}
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
