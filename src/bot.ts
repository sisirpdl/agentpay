import { Bot, InlineKeyboard } from 'grammy';
import 'dotenv/config';
import { pay } from './bank';
import { insertTx } from './db';

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);

// Pending payments per user: userId -> { to, amount }
const pending = new Map<number, { to: string; amount: string }>();

// --- Commands ---

bot.command('start', (ctx) =>
  ctx.reply(
    'AgentPay Online 🤖\n\n' +
    'Send money:\n' +
    '  pay <address> <amount>\n\n' +
    'Example:\n' +
    '  pay 0xAbc...123 0.01'
  )
);

// --- Payment Intent ---

bot.on('message:text', async (ctx) => {
  const text = ctx.message.text.trim();
  if (!text.toLowerCase().startsWith('pay ')) return;

  const parts = text.split(/\s+/);
  if (parts.length !== 3) {
    return ctx.reply('Usage: pay <address> <amount>\nExample: pay 0xAbc...123 0.01');
  }

  const [, to, amount] = parts;

  if (!to.startsWith('0x') || to.length !== 42) {
    return ctx.reply('❌ Invalid address. Must be a 0x... Ethereum address.');
  }
  if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    return ctx.reply('❌ Invalid amount.');
  }

  pending.set(ctx.from.id, { to, amount });

  const kb = new InlineKeyboard()
    .text('✅ Confirm', 'confirm_pay')
    .text('❌ Cancel', 'cancel_pay');

  await ctx.reply(
    `💸 Payment Intent\n\nTo: ${to}\nAmount: ${amount} ETH\n\nConfirm?`,
    { reply_markup: kb }
  );
});

// --- Callbacks ---

bot.callbackQuery('confirm_pay', async (ctx) => {
  await ctx.answerCallbackQuery();

  const p = pending.get(ctx.from.id);
  if (!p) return ctx.editMessageText('❌ No pending payment found.');
  pending.delete(ctx.from.id);

  await ctx.editMessageText('⏳ Sending...');

  try {
    const hash = await pay(p.to, p.amount);

    await insertTx({
      senderId: String(ctx.from.id),
      recipientAddress: p.to,
      recipientName: p.to,
      amount: parseFloat(p.amount),
      txHash: hash!,
      status: 'success',
    });

    await ctx.editMessageText(
      `✅ Sent!\n\nAmount: ${p.amount} ETH\nTo: ${p.to}\nTx: ${hash}`
    );
  } catch (err) {
    const msg = (err as Error).message ?? 'Unknown error';

    await insertTx({
      senderId: String(ctx.from.id),
      recipientAddress: p.to,
      recipientName: p.to,
      amount: parseFloat(p.amount),
      txHash: 'failed',
      status: 'failed',
    }).catch(() => {}); // don't let DB failure mask the tx error

    await ctx.editMessageText(`❌ Transaction failed: ${msg}`);
  }
});

bot.callbackQuery('cancel_pay', async (ctx) => {
  await ctx.answerCallbackQuery();
  pending.delete(ctx.from.id);
  await ctx.editMessageText('❌ Payment cancelled.');
});

// --- Start ---
bot.start();
console.log('AgentPay bot is running...');
