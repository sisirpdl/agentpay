require('dotenv').config();
const { checkLimits, insertUser, getUserByTelegramId } = require('./dist/src/db');
const { generateWallet } = require('./dist/src/chain');

async function test() {
  const testId = 'test-limits-' + Date.now();

  // 1. New user gets default limits
  const w = generateWallet();
  await insertUser(testId, w.address, w.encryptedPrivateKey);
  const user = await getUserByTelegramId(testId);
  console.log('1. New user limits:', JSON.stringify(user.limits));

  // 2. Within limits
  const r1 = await checkLimits(testId, 100);
  console.log('2. 100 USDC (within):', r1.allowed, '| daily_remaining:', r1.daily_remaining);

  // 3. Exceeds per_tx_max
  const r2 = await checkLimits(testId, 600);
  console.log('3. 600 USDC (over per_tx):', r2.allowed, '|', r2.reason.slice(0, 65));

  // 4. Balance check (amount=0)
  const r3 = await checkLimits(testId, 0);
  console.log('4. 0 USDC (balance check):', r3.allowed, '| daily_remaining:', r3.daily_remaining);

  // 5. Risk scores
  function risk(isNew, amount, isVerified) {
    let s = 0;
    if (isNew) s += 30;
    if (amount > 100) s += 20;
    if (!isVerified) s += 15;
    return s;
  }
  console.log('5. Risk: new+large+unverified=', risk(true, 150, false),
    '| new+unverified=', risk(true, 50, false),
    '| known+verified=', risk(false, 50, true));
}
test().catch(console.error);
