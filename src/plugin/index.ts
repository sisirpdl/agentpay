import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import {
  getUserByTelegramId,
  insertUser,
  searchRecipients,
  searchLocalContacts,
  isAddressInContacts,
  saveContact,
  insertTx,
  storePendingPayment,
  getPendingPayment,
  clearPendingPayment,
  checkLimits,
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
function matchScore(contact: Contact, query: string): number {
  const name = contact.name.toLowerCase();
  const q = query.toLowerCase();
  if (name === q) return 100;
  if (contact.username?.toLowerCase() === q) return 90;
  if (name.startsWith(q)) return 80;
  if (name.includes(q) || contact.username?.toLowerCase().includes(q)) return 50;
  return 0;
}

// ── Risk scoring ──────────────────────────────────────────────────────────
// Factors: new recipient (+30), large amount (+20), unverified (+15)
// < 30 → proceed normally
// 30–60 → add warning to confirm message
// > 60 → require address challenge before confirming
function calcRiskScore(isNewRecipient: boolean, amount: number, isVerified: boolean): number {
  let score = 0;
  if (isNewRecipient) score += 30;
  if (amount > 100) score += 20;
  if (!isVerified) score += 15;
  return score;
}

// ── 3-Tier search ─────────────────────────────────────────────────────────
const STRONG_MATCH_THRESHOLD = 70;

async function searchAllTiers(telegramId: string, query: string): Promise<ResolvedResult[]> {
  const isUsername = query.startsWith('@');

  if (isUsername) {
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

  const localRaw = await searchLocalContacts(telegramId, query);
  const localScored: ResolvedResult[] = localRaw
    .map((c) => ({ contact: c, tier: 1 as const, tierLabel: 'your contacts', score: matchScore(c, query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  const bestLocalScore = localScored[0]?.score ?? 0;

  if (bestLocalScore >= STRONG_MATCH_THRESHOLD) {
    return localScored.slice(0, 3);
  }

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

  const merged = [...localScored, ...globalScored, ...mbScored].sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const deduped: ResolvedResult[] = [];
  for (const r of merged) {
    const key = r.contact.wallet_address.toLowerCase();
    if (!seen.has(key)) { seen.add(key); deduped.push(r); }
    if (deduped.length === 3) break;
  }
  return deduped;
}

export default function (api: any) {

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
      'Prefix with @ for exact username match. Returns 1 result (proceed to payment) or disambiguation list. ' +
      'Always call this before send_payment.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Name, partial name, or @username to search.' },
        senderTelegramId: { type: 'string', description: 'Telegram user ID of the sender.' },
      },
      required: ['query', 'senderTelegramId'],
    },
    handler: async (input: { query: string; senderTelegramId: string }) => {
      const results = await searchAllTiers(input.senderTelegramId, input.query);

      if (results.length === 0) {
        return { found: false, message: `No recipient found matching "${input.query}". Try a @username for an exact match.` };
      }

      if (results.length === 1) {
        const { contact, tierLabel } = results[0];
        return {
          found: true, unique: true,
          name: contact.name,
          username: contact.username ? `@${contact.username}` : null,
          wallet_address: contact.wallet_address,
          source: tierLabel,
        };
      }

      return {
        found: true, unique: false,
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
    description: "Returns the user's USDC balance, wallet address, and remaining daily spending limit.",
    inputSchema: {
      type: 'object',
      properties: {
        senderTelegramId: { type: 'string', description: 'Telegram user ID of the sender.' },
      },
      required: ['senderTelegramId'],
    },
    handler: async (input: { senderTelegramId: string }) => {
      const user = await ensureUser(input.senderTelegramId);
      const balance = await getBalance(user.wallet_address);
      const limits = await checkLimits(input.senderTelegramId, 0);
      return {
        balance,
        currency: 'USDC',
        address: user.wallet_address,
        daily_remaining: limits.daily_remaining,
        per_tx_max: (user.limits as any)?.per_tx_max ?? 500,
      };
    },
  });

  // ── send_payment ──────────────────────────────────────────────────────────
  // Phase 1 (no confirmed): search → risk score → store pending → return confirm/challenge
  // Phase 2 (confirmed: true): check limits → verify challenge if needed → execute transfer
  // Cancel  (confirmed: false): clear pending
  api.registerTool({
    name: 'send_payment',
    description:
      'Sends USDC to a recipient. Phase 1: omit confirmed to create a payment intent. ' +
      'Phase 2: pass confirmed=true (+ address_challenge if prompted) to execute. ' +
      'Pass confirmed=false to cancel.',
    inputSchema: {
      type: 'object',
      properties: {
        recipient_name: { type: 'string', description: 'Name or partial name of the recipient.' },
        recipient_username: { type: 'string', description: 'Exact @username (without @) for disambiguation.' },
        amount: { type: 'number', description: 'USDC amount to send, e.g. 5 for $5.00.' },
        senderTelegramId: { type: 'string', description: 'Telegram user ID of the sender.' },
        confirmed: { type: 'boolean', description: 'Omit on first call. true to execute, false to cancel.' },
        address_challenge: {
          type: 'string',
          description: 'First 6 characters of recipient address typed by user — required when risk score > 60.',
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
      address_challenge?: string;
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

        // ── Spending limits check ─────────────────────────────────────────
        const limitCheck = await checkLimits(senderTelegramId, Number(pending.amount));
        if (!limitCheck.allowed) {
          await clearPendingPayment(senderTelegramId);
          return { success: false, error: `Payment blocked: ${limitCheck.reason}` };
        }

        // ── Address challenge for high-risk payments ──────────────────────
        const riskScore = Number(pending.risk_score ?? 0);
        if (riskScore > 60) {
          const expected = pending.recipient_address.slice(0, 6).toLowerCase();
          const provided = (input.address_challenge ?? '').toLowerCase();
          if (provided !== expected) {
            return {
              success: false,
              status: 'address_challenge_required',
              message: `⚠️ High-risk payment. Type the first 6 characters of the recipient's address to confirm.\nAddress: ${pending.recipient_address.slice(0, 6)}...${pending.recipient_address.slice(-4)}`,
              hint: 'Provide address_challenge with the first 6 characters of the recipient address.',
            };
          }
        }

        // ── Execute transfer ──────────────────────────────────────────────
        const sender = await ensureUser(senderTelegramId);
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

        if (status !== 'reverted') {
          await saveContact(senderTelegramId, pending.recipient_name, pending.recipient_address, pending.recipient_username ?? undefined);
        }

        if (status === 'reverted') {
          return {
            success: false,
            error: 'Transaction reverted on-chain. No funds transferred.',
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
          daily_remaining: limitCheck.daily_remaining,
        };
      }

      // ── Phase 1: Intent ───────────────────────────────────────────────────
      const { recipient_name, recipient_username, amount } = input;
      if ((!recipient_name && !recipient_username) || amount == null) {
        return { success: false, error: 'recipient_name (or recipient_username) and amount are required.' };
      }

      // 1. 3-tier search
      const query = recipient_username ? `@${recipient_username}` : recipient_name!;
      const results = await searchAllTiers(senderTelegramId, query);

      if (results.length === 0) {
        return { success: false, error: `No recipient found matching "${query}". Try a @username for exact match.` };
      }
      if (results.length > 1) {
        return {
          success: false, status: 'disambiguation_needed',
          message: 'Multiple recipients found. Please specify a @username.',
          matches: results.map((r, i) => ({
            index: i + 1, name: r.contact.name,
            username: r.contact.username ? `@${r.contact.username}` : null,
            wallet_address: r.contact.wallet_address, match_score: r.score,
          })),
        };
      }

      const { contact: recipient, tier } = results[0];

      // 2. Ensure sender exists + balance check
      const sender = await ensureUser(senderTelegramId);
      const balanceBefore = await getBalance(sender.wallet_address);
      if (parseFloat(balanceBefore) < amount) {
        return {
          success: false,
          error: `Insufficient balance. You have ${balanceBefore} USDC but tried to send ${amount} USDC.`,
          balance: balanceBefore, currency: 'USDC',
        };
      }

      // 3. Risk scoring
      const isNewRecipient = !(await isAddressInContacts(senderTelegramId, recipient.wallet_address));
      const isVerified = tier === 2 && (recipient.verified === true);
      const riskScore = calcRiskScore(isNewRecipient, amount, isVerified);

      // 4. Store pending intent with risk score
      await storePendingPayment(
        senderTelegramId, recipient.name, recipient.wallet_address,
        amount, recipient.username, riskScore
      );

      const addrShort = `${recipient.wallet_address.slice(0, 6)}...${recipient.wallet_address.slice(-4)}`;
      const baseMessage = `Send ${amount} USDC to ${recipient.name}${recipient.username ? ` (@${recipient.username})` : ''}?`;

      // 5. Return based on risk score
      if (riskScore > 60) {
        return {
          status: 'address_challenge_required',
          message: `⚠️ High-risk payment detected (score ${riskScore}/65).\n\n${baseMessage}\n\nTo proceed, the user must type the first 6 characters of the recipient's address:\n${addrShort}`,
          risk_score: riskScore,
          risk_factors: [
            isNewRecipient ? '• New recipient (not in your contacts)' : null,
            amount > 100 ? '• Large amount (> 100 USDC)' : null,
            !isVerified ? '• Recipient not verified in global directory' : null,
          ].filter(Boolean),
          recipient: recipient.name,
          wallet_address_short: addrShort,
          amount, currency: 'USDC',
        };
      }

      const warningText = riskScore >= 30
        ? `\n\n⚠️ Heads up: ${[
            isNewRecipient ? 'new recipient' : null,
            amount > 100 ? 'large amount' : null,
            !isVerified ? 'unverified recipient' : null,
          ].filter(Boolean).join(', ')}.`
        : '';

      return {
        status: 'pending_confirmation',
        message: baseMessage + warningText,
        recipient: recipient.name,
        username: recipient.username ? `@${recipient.username}` : null,
        wallet_address: recipient.wallet_address,
        wallet_address_short: addrShort,
        amount, currency: 'USDC',
        balance_before: balanceBefore,
        found_via: results[0].tierLabel,
        risk_score: riskScore,
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
        senderTelegramId: { type: 'string', description: 'Telegram user ID of the sender.' },
      },
      required: ['senderTelegramId'],
    },
    handler: async (input: { senderTelegramId: string }) => {
      await clearPendingPayment(input.senderTelegramId);
      return { status: 'cancelled', message: 'Payment cancelled.' };
    },
  });
}
