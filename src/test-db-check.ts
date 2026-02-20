import 'dotenv/config';
import { privateKeyToAccount } from 'viem/accounts';
import CryptoJS from 'crypto-js';

const encryptedKey = 'U2FsdGVkX1+DfmiAy+kJnOlU7pQ4hx5puYwp5A82Id8rZceurpUZ/uyGUOPJD16vuIIKqqY2nkQwY8VfYiIKxzigEAs/j9Dt7ZKVYAFt+LqWJ4XGGLrGUVlZ8ITtVhcJ';

const bytes = CryptoJS.AES.decrypt(encryptedKey, process.env.ENCRYPTION_SECRET!);
const privateKey = bytes.toString(CryptoJS.enc.Utf8) as `0x${string}`;

const account = privateKeyToAccount(privateKey);
console.log('Derived address:', account.address);