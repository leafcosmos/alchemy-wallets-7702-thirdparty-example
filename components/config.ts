import { type Address, toHex } from "viem";
export const config = {
  policyId: process.env.NEXT_PUBLIC_PAY_ERC20_POLICY_ID!,
  gasToken: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as Address, // USDC on Arbitrum
  approveBelow: toHex(100000n), // 0.1 USDC
  approveAmount: toHex(10000000n), // 10 USDC
};