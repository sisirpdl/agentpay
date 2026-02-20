"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const accounts_1 = require("viem/accounts");
const crypto_js_1 = __importDefault(require("crypto-js"));
const encryptedKey = 'U2FsdGVkX1+DfmiAy+kJnOlU7pQ4hx5puYwp5A82Id8rZceurpUZ/uyGUOPJD16vuIIKqqY2nkQwY8VfYiIKxzigEAs/j9Dt7ZKVYAFt+LqWJ4XGGLrGUVlZ8ITtVhcJ';
const bytes = crypto_js_1.default.AES.decrypt(encryptedKey, process.env.ENCRYPTION_SECRET);
const privateKey = bytes.toString(crypto_js_1.default.enc.Utf8);
const account = (0, accounts_1.privateKeyToAccount)(privateKey);
console.log('Derived address:', account.address);
