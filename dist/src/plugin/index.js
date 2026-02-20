"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = default_1;
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../../.env') });
const db_1 = require("../db");
const chain_1 = require("../chain");
function default_1(api) {
    // ── Onboarding helper ─────────────────────────────────────────────────────
    // Auto-provisions a wallet for new users on first use.
    async function ensureUser(telegramId) {
        let user = await (0, db_1.getUserByTelegramId)(telegramId);
        if (!user) {
            const wallet = (0, chain_1.generateWallet)();
            user = await (0, db_1.insertUser)(telegramId, wallet.address, wallet.encryptedPrivateKey);
        }
        return user;
    }
    // ── check_balance ─────────────────────────────────────────────────────────
    api.registerTool({
        name: 'check_balance',
        description: 'Returns the USDC balance of the calling user\'s AgentPay wallet.',
        inputSchema: {
            type: 'object',
            properties: {
                senderTelegramId: {
                    type: 'string',
                    description: 'Telegram user ID of the sender, injected from session.',
                },
            },
            required: ['senderTelegramId'],
        },
        handler: async (input) => {
            const user = await ensureUser(input.senderTelegramId);
            const balance = await (0, chain_1.getBalance)(user.wallet_address);
            return { balance, currency: 'USDC', address: user.wallet_address };
        },
    });
    // ── send_payment ──────────────────────────────────────────────────────────
    api.registerTool({
        name: 'send_payment',
        description: 'Sends USDC to a merchant or recipient by name. Fuzzy-searches the recipient ' +
            'directory, then executes the transfer. Returns the transaction hash on success.',
        inputSchema: {
            type: 'object',
            properties: {
                recipient_name: {
                    type: 'string',
                    description: 'Name (or partial name) of the recipient, e.g. "coffee" or "Downtown Coffee".',
                },
                amount: {
                    type: 'number',
                    description: 'Amount of USDC to send, e.g. 5 for $5.00.',
                },
                senderTelegramId: {
                    type: 'string',
                    description: 'Telegram user ID of the sender, injected from session.',
                },
            },
            required: ['recipient_name', 'amount', 'senderTelegramId'],
        },
        handler: async (input) => {
            const { recipient_name, amount, senderTelegramId } = input;
            // 1. Fuzzy search for recipient
            const results = await (0, db_1.searchRecipients)(recipient_name);
            if (!results || results.length === 0) {
                return { success: false, error: `No recipient found matching "${recipient_name}".` };
            }
            const recipient = results[0]; // top fuzzy match
            // 2. Ensure sender exists (onboard if new)
            const sender = await ensureUser(senderTelegramId);
            // 3. Transfer
            const txHash = await (0, chain_1.transfer)(sender.encrypted_private_key, recipient.wallet_address, amount);
            // 4. Record in tx_history
            await (0, db_1.insertTx)({
                senderId: senderTelegramId,
                recipientAddress: recipient.wallet_address,
                recipientName: recipient.name,
                amount,
                txHash,
                status: 'success',
            });
            return {
                success: true,
                recipient: recipient.name,
                amount,
                currency: 'USDC',
                txHash,
            };
        },
    });
}
