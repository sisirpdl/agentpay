import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import {
  getUserByTelegramId,
  insertUser,
  searchRecipients,
  searchLocalContacts,
  saveContact,
  insertTx,
  storePendingPayment,
  getPendingPayment,
  clearPendingPayment,
  type Contact,
} from '../db';
import { getBalance, transfer, generateWallet } from '../chain';

// ── Mock Moltbook (Tier 3) ────────────────────────────────────────────────
const MOLTBOOK_PATH = path.join(__dirname, '../moltbook.json');
const moltbookData: Contact[] = JSON.parse(fs.readFileSync(MOLTBOOK_PATH, 'utf-8'));

function searchMoltbook(query: string): Contact[] {
  const q = query.toLowerCase();
  if (q.startsWith('@')) {
    const u = q.slice(1);
    return moltbookData.filter((c) => c.username?.toLowerCase() === u);
  }
  return moltbookData.filter(
    (c) => c.name.toLowerCase().includes(q) || c.username?.toLowerCase().includes(q)
  );
}

type ResolvedResult = { contact: Contact; tier: 1 | 2 | 3; tierLabel: string; score: number };

// ── Match scoring ─────────────────────────────────────────────────────────
// 100 = exact name | 90 = exact username | 80 = name starts with query
// 50  = substring  | 0  = no match
function matchScore(contact: Contact, query: string): number {
  const name = contact.name.toLowerCase();
  const q = query.toLowerCase();
  if (name === q) return 100;
  if (contact.username?.toLowerCase() === q) return 90;
  if (name.startsWith(q)) return 80;
  if (name.includes(q) || contact.username?.toLowerCase().includes(q)) return 50;
  return 0;
}

// ── 3-Tier search with score-based fallthrough ────────────────────────────
// STRONG local match (score ≥ 70) → stop at local, no global lookup needed
// WEAK  local match (score < 70)  → also search global + Moltbook and merge all
// No local match                  → global → Moltbook
// @username query                 → always exact match, first tier that hits wins
const STRONG_MATCH_THRESHOLD = 70;

async function searchAllTiers(
  telegramId: string,
  query: string
): Promise<ResolvedResult[]> {
  const isUsername = query.startsWith('@');

  if (isUsername) {
    // Exact username lookup — first tier that hits wins
    const local = await searchLocalContacts(telegramId, query);
    if (local.length > 0) return [{ contact: local[0], tier: 1, tierLabel: 'your contacts', score: 90 }];

    const global = (await searchRecipients(query)) ?? [];
    const globalUsername = global.filter(
      (c: Contact) => c.username?.toLowerCase() === query.slice(1).toLowerCase()
    );
    if (globalUsername.length > 0) return [{ contact: globalUsername[0], tier: 2, tierLabel: 'global directory', score: 90 }];

    const mb = searchMoltbook(query);
    if (mb.length > 0) return [{ contact: mb[0], tier: 3, tierLabel: 'Moltbook', score: 90 }];
    return [];
  }

  // Score local contacts
  const localRaw = await searchLocalContacts(telegramId, query);
  const localScored: ResolvedResult[] = localRaw
    .map((c) => ({ contact: c, tier: 1 as const, tierLabel: 'your contacts', score: matchScore(c, query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  const bestLocalScore = localScored[0]?.score ?? 0;

  if (bestLocalScore >= STRONG_MATCH_THRESHOLD) {
    // Strong local match — return top 3 locals, no need to check further
    return localScored.slice(0, 3);
  }

  // Weak or no local match — search global and Moltbook too, then merge
  const globalRaw = (await searchRecipients(query)) ?? [];
  const globalScored: ResolvedResult[] = (globalRaw as Contact[])
    .map((c) => ({ contact: c, tier: 2 as const, tierLabel: 'global directory', score: matchScore(c, query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  const mbRaw = searchMoltbook(query);
  const mbScored: ResolvedResult[] = mbRaw
    .map((c) => ({ contact: c, tier: 3 as const, tierLabel: 'Moltbook', score: matchScore(c, query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  // Merge all results, sort by score desc, dedupe by wallet_address, return top 3
  const merged = [...localScored, ...globalScored, ...mbScored]
    .sort((a, b) => b.score - a.score);

  const seen = new Set<string>();
  const deduped: ResolvedResult[] = [];
  for (const r of merged) {
    const key = r.contact.wallet_address.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(r);
    }
    if (deduped.length === 3) break;
  }

  return deduped;
}

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

  // ── search_contacts ──────────────────────────────────────────────────────
  api.registerTool({
    name: 'search_contacts',
    description:
      'Searches for a recipient across 3 tiers: local saved contacts → global directory → Moltbook. ' +
      'Prefix with @ for exact username match (e.g. @downtown_coffee). ' +
      'Returns 1 result (proceed to payment) or a disambiguation list (ask user to pick). ' +
      'Use this before send_payment to confirm who the user wants to pay.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Name, partial name, or @username to search, e.g. "coffee", "downtown", or "@downtown_coffee".',
        },
        senderTelegramId: {
          type: 'string',
          description: 'Telegram user ID of the sender, injected from session.',
        },
      },
      required: ['query', 'senderTelegramId'],
    },
    handler: async (input: { query: string; senderTelegramId: string }) => {
      const results = await searchAllTiers(input.senderTelegramId, input.query);

      if (results.length === 0) {
        return {
          found: false,
          message: `No recipient found matching "${input.query}". Try a @username for an exact match.`,
        };
      }

      if (results.length === 1) {
        const { contact, tierLabel } = results[0];
        return {
          found: true,
          unique: true,
          name: contact.name,
          username: contact.username ? `@${contact.username}` : null,
          wallet_address: contact.wallet_address,
          source: tierLabel,
        };
      }

      // Multiple matches — return list for disambiguation
      return {
        found: true,
        unique: false,
        message: 'Multiple matches found. Ask the user which one they mean, or to provide a @username.',
        matches: results.map((r, i) => ({
          index: i + 1,
          name: r.contact.name,
          username: r.contact.username ? `@${r.contact.username}` : null,
          wallet_address: r.contact.wallet_address,
          source: r.tierLabel,
          match_score: r.score,
        })),
      };
    },
  });

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
        recipient_username: {
          type: 'string',
          description: 'Exact @username of the recipient (without @), used to disambiguate when multiple matches exist.',
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
      recipient_username?: string;
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

        // Auto-save contact to local contacts after first successful payment
        if (status !== 'reverted') {
          await saveContact(
            senderTelegramId,
            pending.recipient_name,
            pending.recipient_address,
            pending.recipient_username ?? undefined
          );
        }

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
      const { recipient_name, recipient_username, amount } = input;
      if ((!recipient_name && !recipient_username) || amount == null) {
        return { success: false, error: 'recipient_name (or recipient_username) and amount are required.' };
      }

      // 1. 3-tier search — @username for exact pick, name for fuzzy
      const query = recipient_username ? `@${recipient_username}` : recipient_name!;
      const results = await searchAllTiers(senderTelegramId, query);

      if (results.length === 0) {
        return { success: false, error: `No recipient found matching "${query}". Try a @username for exact match.` };
      }

      if (results.length > 1) {
        return {
          success: false,
          status: 'disambiguation_needed',
          message: 'Multiple recipients found. Please specify a @username.',
          matches: results.map((r, i) => ({
            index: i + 1,
            name: r.contact.name,
            username: r.contact.username ? `@${r.contact.username}` : null,
            wallet_address: r.contact.wallet_address,
            match_score: r.score,
          })),
        };
      }

      const recipient = results[0].contact;
      const tierLabel = results[0].tierLabel;

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
        amount,
        recipient.username
      );

      // 5. Return pending state — show name, @username, and truncated address for sender to verify
      const addrShort = `${recipient.wallet_address.slice(0, 6)}...${recipient.wallet_address.slice(-4)}`;
      return {
        status: 'pending_confirmation',
        message: `Send ${amount} USDC to ${recipient.name}${recipient.username ? ` (@${recipient.username})` : ''}?`,
        recipient: recipient.name,
        username: recipient.username ? `@${recipient.username}` : null,
        wallet_address: recipient.wallet_address,
        wallet_address_short: addrShort,
        amount,
        currency: 'USDC',
        balance_before: balanceBefore,
        found_via: tierLabel,
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
