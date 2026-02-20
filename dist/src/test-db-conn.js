"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const db_1 = require("./db");
async function test() {
    const results = await (0, db_1.searchRecipients)('coffee');
    console.log('DB connected. Found:', results[0]?.name);
}
test().catch(console.error);
