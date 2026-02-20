import 'dotenv/config';
import { getUserByTelegramId, insertUser, searchRecipients, insertTx } from '../db';
import { getBalance, transfer, generateWallet } from '../chain';

export default function (api: any) {
  // ── Onboarding helper ─────────────────────────────────────────────────────
  // Called whenever a tool needs a user that doesn't exist yet.
  // delegation is left as a placeholder until gator-cli is wired up.
  async function ensureUser(telegramId: string) {
    let user = await getUserByTelegramId(telegramId);
    if (!user) {
      const wallet = generateWallet();
      user = await insertUser(telegramId, wallet.address, 'pending_delegation');
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
    handler: async (input: { senderTelegramId: string }) => {
      const user = await ensureUser(input.senderTelegramId);
      const balance = await getBalance(user.wallet_address);
      return { balance, currency: 'USDC', address: user.wallet_address };
    },
  });

  // ── send_payment ──────────────────────────────────────────────────────────
  api.registerTool({
    name: 'send_payment',
    description:
      'Sends USDC to a merchant or recipient by name. Fuzzy-searches the recipient ' +
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
    handler: async (input: {
      recipient_name: string;
      amount: number;
      senderTelegramId: string;
    }) => {
      const { recipient_name, amount, senderTelegramId } = input;

      // 1. Fuzzy search for recipient
      const results = await searchRecipients(recipient_name);
      if (!results || results.length === 0) {
        return { success: false, error: `No recipient found matching "${recipient_name}".` };
      }
      const recipient = results[0]; // top fuzzy match

      // 2. Ensure sender exists (onboard if new)
      const sender = await ensureUser(senderTelegramId);

      // 3. Transfer
      // TODO: replace with gator-cli delegation flow once integrated.
      // For now, transfer() uses the sender's stored encrypted key (legacy path).
      // This will be swapped when delegation is wired up.
      if (!sender.encrypted_private_key) {
        return {
          success: false,
          error: 'Delegation not yet configured for this account. Onboarding incomplete.',
        };
      }

      const txHash = await transfer(
        sender.encrypted_private_key,
        recipient.wallet_address,
        amount
      );

      // 4. Record in tx_history
      await insertTx({
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
