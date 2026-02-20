import 'dotenv/config';
import { searchRecipients } from './db';

async function test() {
  const results = await searchRecipients('coffee');
  console.log('DB connected. Found:', results[0]?.name);
}

test().catch(console.error);
