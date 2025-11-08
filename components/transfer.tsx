// components/ERC20Transfer.tsx
import { ConnectedWallet as PrivyWallet } from "@privy-io/react-auth";
import { useCallback, useState, useEffect } from "react";
import type { Address, Hex } from "viem";
import { encodeFunctionData } from "viem";
import { erc20Abi } from "../lib/abi/erc20";
import { useSmartEmbeddedWallet } from "../hooks/use-smart-embedded-wallet";
import { config } from "./config";

// Arbitrum 主网 ERC-20 代币
const ARBITRUM_MAINNET_TOKENS = {
  USDC: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as Address,
  USDT: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9" as Address,
  DAI: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1" as Address,
  WBTC: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f" as Address,
  WETH: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1" as Address,
  ARB: "0x912CE59144191C1204E64559FE8253a0e49E6548" as Address,
} as const;

interface ERC20TransferProps {
  embeddedWallet: PrivyWallet;
}

const getTokenInfo = (address: Address) => {
  switch (address) {
    case ARBITRUM_MAINNET_TOKENS.USDC:
      return { symbol: "USDC", decimals: 6 };
    case ARBITRUM_MAINNET_TOKENS.USDT:
      return { symbol: "USDT", decimals: 6 };
    case ARBITRUM_MAINNET_TOKENS.DAI:
      return { symbol: "DAI", decimals: 18 };
    case ARBITRUM_MAINNET_TOKENS.WBTC:
      return { symbol: "WBTC", decimals: 8 };
    case ARBITRUM_MAINNET_TOKENS.WETH:
      return { symbol: "WETH", decimals: 18 };
    case ARBITRUM_MAINNET_TOKENS.ARB:
      return { symbol: "ARB", decimals: 18 };
    default:
      return { symbol: "UNKNOWN", decimals: 18 };
  }
};

export const ERC20Transfer = ({ embeddedWallet }: ERC20TransferProps) => {
  const [tokenAddress, setTokenAddress] = useState<Address>(
    ARBITRUM_MAINNET_TOKENS.USDC
  );
  const [recipient, setRecipient] = useState<Address>("" as Address);
  const [amount, setAmount] = useState("");
  const [isTransferring, setIsTransferring] = useState(false);
  const [error, setError] = useState<string>();
  const [transactionHash, setTransactionHash] = useState<string>();

  // 直接使用 useSmartEmbeddedWallet 返回的 client
  const { client } = useSmartEmbeddedWallet({ embeddedWallet });

  // 调试信息
  useEffect(() => {
    console.log("ERC20Transfer - Client status:", {
      hasClient: !!client,
      clientType: client?.constructor?.name,
      clientMethods: client ? Object.keys(client) : [],
    });
  }, [client]);

  const transferERC20 = useCallback(async () => {
    if (!client) {
      setError("智能钱包客户端未连接");
      return;
    }

    if (!recipient || !recipient.match(/^0x[a-fA-F0-9]{40}$/)) {
      setError("请输入有效的接收方地址");
      return;
    }

    const tokenInfo = getTokenInfo(tokenAddress);
    const amountNum = parseFloat(amount);

    if (isNaN(amountNum) || amountNum <= 0) {
      setError("请输入有效的转账金额");
      return;
    }

    setIsTransferring(true);
    setError(undefined);

    try {
      // 计算精确的金额
      const amountInWei = BigInt(
        Math.floor(amountNum * Math.pow(10, tokenInfo.decimals))
      );

      // 构建转账数据
      const transferData = encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [recipient, amountInWei],
      });

      console.log(
        `[7702] 开始转账: ${amount} ${tokenInfo.symbol} 到 ${recipient}`
      );
      console.log(`[7702] 使用客户端方法:`, Object.keys(client));

      let hash: string;

      try {
        const {
          preparedCallIds: [callId],
        } = await client.sendCalls({
          // capabilities: {
          //   eip7702Auth: true,
          // },
          capabilities: {
            eip7702Auth: true,
            paymasterService: {
              policyId: config.policyId,
              erc20: {
                tokenAddress: config.gasToken,
                postOpSettings: {
                  autoApprove: {
                    below: config.approveBelow,
                    amount: config.approveAmount,
                  },
                },
              },
            },
          },
          from: embeddedWallet.address as Address,
          calls: [
            {
              to: tokenAddress,
              data: transferData,
            },
          ],
        });
        if (!callId) {
          throw new Error("Missing call id");
        }

        const { receipts } = await client.waitForCallsStatus({ id: callId });
        if (!receipts?.length) {
          throw new Error("Missing transaction receipts");
        }
        const [receipt] = receipts;
        if (receipt?.status !== "success") {
          throw new Error("Transaction failed");
        }
        hash = receipt.transactionHash;
        console.log(`[7702] 交易发送成功: ${hash}`);
        // setStatus({ status: "success", txHash: receipt.transactionHash });
        setTransactionHash(receipt.transactionHash);
      } catch (err: any) {
        console.error("[7702] 转账失败:", err);
        setError(err || "转账失败");
      }

      // 重置表单
      setAmount("");
      setRecipient("" as Address);
    } catch (err: any) {
      console.error("[7702] 转账失败:", err);
      setError(err.message || "转账失败");
    } finally {
      setIsTransferring(false);
    }
  }, [client, tokenAddress, recipient, amount]);

  const setExampleRecipient = () => {
    setRecipient("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" as Address);
  };

  const setSmallAmount = () => {
    const tokenInfo = getTokenInfo(tokenAddress);
    if (tokenInfo.symbol === "USDC" || tokenInfo.symbol === "USDT") {
      setAmount("1");
    } else if (tokenInfo.symbol === "WBTC") {
      setAmount("0.001");
    } else {
      setAmount("0.01");
    }
  };

  const tokenInfo = getTokenInfo(tokenAddress);
  const transactionUrl = transactionHash
    ? `https://arbiscan.io/tx/${transactionHash}`
    : undefined;

  return (
    <div className="flex flex-col gap-6 p-6 border border-blue-200 rounded-lg bg-blue-50">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          ERC-20 转账 (Alchemy 7702)
        </h2>

        {/* 连接状态 */}
        <div className="mb-4 p-3 bg-green-100 border border-green-300 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  client ? "bg-green-500" : "bg-yellow-500"
                }`}
              ></div>
              <span className="text-sm font-medium text-green-800">
                {client ? "Alchemy 7702 已连接" : "初始化中..."}
              </span>
            </div>
            <code className="text-xs text-green-700 bg-green-200 px-2 py-1 rounded">
              {embeddedWallet.address.slice(0, 8)}... → 0x6900...E139
            </code>
          </div>
        </div>

        {/* 代币选择 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            选择代币
          </label>
          <select
            value={tokenAddress}
            onChange={(e) => setTokenAddress(e.target.value as Address)}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            disabled={!client}
          >
            <option value={ARBITRUM_MAINNET_TOKENS.USDC}>USDC</option>
            <option value={ARBITRUM_MAINNET_TOKENS.USDT}>USDT</option>
            <option value={ARBITRUM_MAINNET_TOKENS.DAI}>DAI</option>
            <option value={ARBITRUM_MAINNET_TOKENS.WBTC}>WBTC</option>
            <option value={ARBITRUM_MAINNET_TOKENS.WETH}>WETH</option>
            <option value={ARBITRUM_MAINNET_TOKENS.ARB}>ARB</option>
          </select>
        </div>

        {/* 接收地址 */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-medium text-gray-700">
              接收方地址
            </label>
            <button
              type="button"
              onClick={setExampleRecipient}
              className="text-xs text-blue-600 hover:text-blue-800"
              disabled={!client}
            >
              使用示例地址
            </button>
          </div>
          <input
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value as Address)}
            placeholder="0x..."
            className="w-full p-3 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            disabled={!client}
          />
        </div>

        {/* 转账金额 */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-medium text-gray-700">
              转账金额
            </label>
            <button
              type="button"
              onClick={setSmallAmount}
              className="text-xs text-blue-600 hover:text-blue-800"
              disabled={!client}
            >
              小额测试
            </button>
          </div>
          <input
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            disabled={!client}
          />
          <p className="text-xs text-gray-500 mt-1">
            {tokenInfo.symbol} (小数位数: {tokenInfo.decimals})
          </p>
        </div>

        {/* 错误显示 */}
        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-lg">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {/* 发送按钮 */}
        <button
          onClick={transferERC20}
          disabled={isTransferring || !client || !recipient || !amount}
          className={`w-full py-3 px-4 rounded-lg font-semibold text-white transition-colors ${
            isTransferring || !client || !recipient || !amount
              ? "bg-blue-400 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {!client
            ? "初始化中..."
            : isTransferring
            ? `发送 ${tokenInfo.symbol}...`
            : `使用 7702 转账 ${tokenInfo.symbol}`}
        </button>
      </div>

      {/* 交易成功显示 */}
      {transactionUrl && (
        <section className="bg-green-50 rounded-xl p-6 border border-green-200">
          <h2 className="text-lg font-semibold text-green-900 mb-4">
            ✅ {tokenInfo.symbol} 转账成功!
          </h2>
          <p className="text-green-700 mb-4">
            通过 Alchemy 7702 代理成功转账 {amount} {tokenInfo.symbol}。
          </p>
          <a
            href={transactionUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-blue-600 hover:text-blue-800 text-sm"
          >
            在 Arbiscan 上查看交易详情 →
          </a>
        </section>
      )}
    </div>
  );
};
