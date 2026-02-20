import { createWalletClient, http, parseUnits, createPublicClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'
import 'dotenv/config'

// USDC on Base Sepolia
const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const
const USDC_DECIMALS = 6

const ERC20_TRANSFER_ABI = [{
  name: 'transfer',
  type: 'function',
  inputs: [
    { name: 'to', type: 'address' },
    { name: 'amount', type: 'uint256' }
  ],
  outputs: [{ type: 'bool' }],
}] as const

const privateKey = process.env.PRIVATE_KEY as `0x${string}`
const account = privateKeyToAccount(privateKey)

const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(process.env.RPC_URL)
})

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.RPC_URL)
})

export async function pay(to: string, amount: string) {
  console.log(`💸 Sending ${amount} USDC to ${to}...`)
  try {
    const hash = await walletClient.writeContract({
      address: USDC_ADDRESS,
      abi: ERC20_TRANSFER_ABI,
      functionName: 'transfer',
      args: [to as `0x${string}`, parseUnits(amount, USDC_DECIMALS)]
    })
    console.log(`✅ Paid! Transaction Hash: ${hash}`)
    return hash
  } catch (error) {
    console.error('❌ Transaction failed:', error)
    throw error
  }
}

export async function getBalance(address: string) {
  const balance = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: [{
      name: 'balanceOf',
      type: 'function',
      inputs: [{ name: 'account', type: 'address' }],
      outputs: [{ type: 'uint256' }],
    }] as const,
    functionName: 'balanceOf',
    args: [address as `0x${string}`]
  })
  // Return human-readable USDC amount
  return (Number(balance) / 10 ** USDC_DECIMALS).toFixed(2)
}

if (require.main === module) {
  pay('0x0000000000000000000000000000000000000000', '0.01')
}