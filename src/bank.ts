import { createWalletClient, http, parseEther } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains' 
import 'dotenv/config'

// 1. Setup the Account
// Make sure your .env PRIVATE_KEY starts with "0x"
const privateKey = process.env.PRIVATE_KEY as `0x${string}`
const account = privateKeyToAccount(privateKey)

// 2. Setup the Client (Connects to the Blockchain)
const client = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(process.env.RPC_URL) // Uses your RPC or defaults if empty
})

// 3. The Pay Function
export async function pay(to: string, amount: string) {
  console.log(`💸 Sending ${amount} ETH to ${to}...`)
  
  try {
    const hash = await client.sendTransaction({
      to: to as `0x${string}`,
      value: parseEther(amount)
    })
    console.log(`✅ Paid! Transaction Hash: ${hash}`)
    // Return the hash so the bot can link to it later
    return hash;
  } catch (error) {
    console.error("❌ Transaction failed:", error)
  }
}

// 4. TEST RUN (Only runs if you execute this file directly)
// We check if this file is being run directly by node, not imported
if (require.main === module) {
    // Replace this address with your friend's wallet or your own secondary wallet
    pay("0x0000000000000000000000000000000000000000", "0.0001")
}