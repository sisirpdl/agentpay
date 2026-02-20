import 'dotenv/config';
import {
  getUserByTelegramId,
  insertUser,
  searchRecipients,
  insertTx,
  storePendingPayment,
  getPendingPayment,
  clearPendingPayment,
} from '../db';
import { getBalance, transfer, generateWallet } from '../chain';

export default function (api: any) {

  // ── Onboarding helper ─────────────────────────────────────────────────────
  // Creates a server-side EOA wallet for new users.
  // delegation column stores the encrypted private key for the demo.
  // TODO: replace with real ERC-7710 delegation once smart-accounts-kit is wired.
  async function ensureUser(telegramId: string) {
    let user = await getUserByTelegramId(telegramId);
    if (!user) {
      const wallet = generateWallet();
      user = await insertUser(telegramId, wallet.address, wallet.encryptedPrivateKey);
    }
    return user;
  }

  // ── check_balance ─────────────────────────────────────────────────────────
  api.registerTool({
    name: 'check_balance',
    description: "Returns the USDC balance of the calling user's AgentPay wallet.",
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
    handler: async (input: { senderTelegramId: string }) => {
      const user = await ensureUser(input.senderTelegramId);
      const balance = await getBalance(user.wallet_address);
      return { balance, currency: 'USDC', address: user.wallet_address };
    },
  });

  // ── send_payment ──────────────────────────────────────────────────────────
  // Two-phase flow:
  //   Phase 1 (confirmed omitted): fuzzy search + balance check → store pending → return for confirmation
  //   Phase 2 (confirmed: true):   retrieve pending → execute transfer → record tx
  //   Cancel  (confirmed: false):  clear pending → return cancelled
  api.registerTool({
    name: 'send_payment',
    description:
      'Sends USDC to a merchant or recipient by name. ' +
      'First call returns a confirmation request. ' +
      'Call again with confirmed=true to execute, or confirmed=false to cancel.',
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
        confirmed: {
          type: 'boolean',
          description: 'Omit on first call. Pass true to confirm, false to cancel.',
        },
      },
      required: ['senderTelegramId'],
    },
    handler: async (input: {
      recipient_name?: string;
      amount?: number;
      senderTelegramId: string;
      confirmed?: boolean;
    }) => {
      const { senderTelegramId, confirmed } = input;

      // ── Cancel ────────────────────────────────────────────────────────────
      if (confirmed === false) {
        await clearPendingPayment(senderTelegramId);
        return { status: 'cancelled', message: 'Payment cancelled.' };
      }

      // ── Phase 2: Execute ──────────────────────────────────────────────────
      if (confirmed === true) {
        const pending = await getPendingPayment(senderTelegramId);
        if (!pending) {
          return { success: false, error: 'No pending payment found. Please start a new payment.' };
        }

        const sender = await ensureUser(senderTelegramId);

        // delegation column holds encrypted private key for demo
        const { txHash, status } = await transfer(
          sender.delegation,
          pending.recipient_address,
          Number(pending.amount)
        );

        const balanceAfter = await getBalance(sender.wallet_address);

        await insertTx({
          senderId: senderTelegramId,
          recipientAddress: pending.recipient_address,
          recipientName: pending.recipient_name,
          amount: Number(pending.amount),
          txHash,
          status,
        });

        await clearPendingPayment(senderTelegramId);

        if (status === 'reverted') {
          return {
            success: false,
            error: 'Transaction was reverted on-chain. No funds were transferred.',
            txHash,
            balance_after: balanceAfter,
          };
        }

        return {
          success: true,
          recipient: pending.recipient_name,
          amount: pending.amount,
          currency: 'USDC',
          txHash,
          balance_after: balanceAfter,
        };
      }

      // ── Phase 1: Intent ───────────────────────────────────────────────────
      const { recipient_name, amount } = input;
      if (!recipient_name || amount == null) {
        return { success: false, error: 'recipient_name and amount are required.' };
      }

      // 1. Fuzzy search
      const results = await searchRecipients(recipient_name);
      if (!results || results.length === 0) {
        return { success: false, error: `No recipient found matching "${recipient_name}".` };
      }
      const recipient = results[0];

      // 2. Ensure sender exists
      const sender = await ensureUser(senderTelegramId);

      // 3. Balance check
      const balanceBefore = await getBalance(sender.wallet_address);
      if (parseFloat(balanceBefore) < amount) {
        return {
          success: false,
          error: `Insufficient balance. You have ${balanceBefore} USDC but tried to send ${amount} USDC.`,
          balance: balanceBefore,
          currency: 'USDC',
        };
      }

      // 4. Store pending intent
      await storePendingPayment(
        senderTelegramId,
        recipient.name,
        recipient.wallet_address,
        amount
      );

      // 5. Return pending state — OpenClaw shows confirm/cancel buttons
      return {
        status: 'pending_confirmation',
        message: `Send ${amount} USDC to ${recipient.name}?`,
        recipient: recipient.name,
        amount,
        currency: 'USDC',
        balance_before: balanceBefore,
      };
    },
  });

  // ── cancel_payment ────────────────────────────────────────────────────────
  api.registerTool({
    name: 'cancel_payment',
    description: 'Cancels any pending payment for the user.',
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
    handler: async (input: { senderTelegramId: string }) => {
      await clearPendingPayment(input.senderTelegramId);
      return { status: 'cancelled', message: 'Payment cancelled.' };
    },
  });
}
