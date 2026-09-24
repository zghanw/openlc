"use client";

/**
 * MetaMask wallet context: connect, network enforcement/switching, and message signing on ethers.
 * Modeled on Vol.1's proven useEscrow.ts (D:\Codes\BuildWeekHackathon\frontend\src\hooks\useEscrow.ts)
 * connect/switch/listener pattern, trimmed to what this app needs (no bounty-specific state).
 */
import { BrowserProvider, getAddress, isError, type Eip1193Provider, type JsonRpcSigner } from "ethers";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BOTCHAIN, BOTCHAIN_ADD_CHAIN_PARAMS } from "@/lib/chain";

type EthereumProvider = Eip1193Provider & {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

/** Same human sentences Vol.1's contract.ts uses for MetaMask's own error codes. */
export function describeConnectError(err: unknown): string {
  const code = (err as { code?: number } | undefined)?.code;
  if (code === 4001) return "Connection request rejected in MetaMask.";
  if (code === -32002) return "MetaMask already has a connection request open \u2014 check your browser toolbar for the MetaMask icon.";
  return "MetaMask didn't respond as expected. Click the MetaMask icon in your toolbar and connect this site directly, then reload.";
}

export function describeTxError(err: unknown): string {
  const e = err as { code?: number; info?: { error?: { message?: string } }; error?: { message?: string }; shortMessage?: string; reason?: string; message?: string } | undefined;
  if (e?.code === 4001) return "Transaction rejected in MetaMask.";
  const underlying = e?.info?.error?.message || e?.error?.message;
  return underlying || e?.shortMessage || e?.reason || e?.message || "Unknown error.";
}

type WalletContextValue = {
  /** Whether an EIP-1193 provider (MetaMask or similar) was detected in this browser. */
  hasWallet: boolean;
  account: string | null;
  chainId: number | null;
  isCorrectNetwork: boolean;
  connecting: boolean;
  switchingNetwork: boolean;
  error: string;
  connect: () => Promise<void>;
  /** Switches to BOT Chain, falling back to wallet_addEthereumChain on MetaMask's 4902 ("unrecognized chain"). */
  ensureBotChain: () => Promise<boolean>;
  signMessage: (message: string) => Promise<string>;
  /** Throws a clear message instead of a raw ethers error when no account is connected yet. */
  getSigner: () => Promise<JsonRpcSigner>;
  clearError: () => void;
};

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [hasWallet, setHasWallet] = useState(false);
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [switchingNetwork, setSwitchingNetwork] = useState(false);
  const [error, setError] = useState("");
  const providerRef = useRef<BrowserProvider | null>(null);

  // "any" tells ethers not to treat a runtime chain change as a fatal NETWORK_ERROR (its default
  // assumes the network never changes for the lifetime of a provider instance).
  const browserProvider = useCallback((): BrowserProvider => {
    if (!window.ethereum) throw new Error("No wallet found. Install MetaMask to use this app.");
    if (!providerRef.current) providerRef.current = new BrowserProvider(window.ethereum, "any");
    return providerRef.current;
  }, []);

  const refreshChainId = useCallback(async (): Promise<number | null> => {
    if (!window.ethereum) {
      setChainId(null);
      return null;
    }
    try {
      const hex = (await window.ethereum.request({ method: "eth_chainId" })) as string;
      const id = parseInt(hex, 16);
      setChainId(id);
      return id;
    } catch {
      setChainId(null);
      return null;
    }
  }, []);

  const activate = useCallback(
    async (accounts: string[]) => {
      if (!accounts || accounts.length === 0) {
        setAccount(null);
        return;
      }
      setAccount(accounts[0]);
      await refreshChainId();
    },
    [refreshChainId],
  );

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      setError("No wallet found. Install MetaMask to use this app.");
      return;
    }
    setConnecting(true);
    setError("");
    try {
      const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
      await activate(accounts);
    } catch (err) {
      setError(describeConnectError(err));
    } finally {
      setConnecting(false);
    }
  }, [activate]);

  const ensureBotChain = useCallback(async (): Promise<boolean> => {
    if (!window.ethereum) {
      setError("No wallet found. Install MetaMask to use this app.");
      return false;
    }
    setSwitchingNetwork(true);
    setError("");
    try {
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: BOTCHAIN.chainIdHex }],
        });
      } catch (switchErr) {
        if ((switchErr as { code?: number } | undefined)?.code === 4902) {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [BOTCHAIN_ADD_CHAIN_PARAMS],
          });
        } else {
          throw switchErr;
        }
      }
      const id = await refreshChainId();
      return id === BOTCHAIN.chainIdDec;
    } catch (err) {
      const code = (err as { code?: number } | undefined)?.code;
      setError(code === 4001 ? "Network switch rejected in MetaMask." : describeConnectError(err));
      return false;
    } finally {
      setSwitchingNetwork(false);
    }
  }, [refreshChainId]);

  const getSigner = useCallback(async (): Promise<JsonRpcSigner> => {
    if (!account) throw new Error("Connect MetaMask before signing.");
    return browserProvider().getSigner();
  }, [account, browserProvider]);

  const signMessage = useCallback(
    async (message: string): Promise<string> => {
      const signer = await getSigner();
      try {
        return await signer.signMessage(message);
      } catch (err) {
        // ethers' BrowserProvider turns MetaMask's EIP-1193 4001 into its own ACTION_REJECTED.
        const rejected = isError(err, "ACTION_REJECTED") || (err as { code?: number } | undefined)?.code === 4001;
        throw new Error(rejected ? "Signature request rejected in MetaMask." : describeConnectError(err));
      }
    },
    [getSigner],
  );

  // Pick up an already-authorized connection with no click needed, and keep account/chain in sync
  // as MetaMask reports changes. Cleaned up on unmount.
  useEffect(() => {
    const eth = typeof window !== "undefined" ? window.ethereum : undefined;
    setHasWallet(Boolean(eth));
    if (!eth) return;
    eth.request({ method: "eth_accounts" })
      .then((accounts) => activate(accounts as string[]))
      .catch(() => {});
    const onAccountsChanged = (...args: unknown[]) => void activate(args[0] as string[]);
    const onChainChanged = () => void refreshChainId();
    eth.on?.("accountsChanged", onAccountsChanged);
    eth.on?.("chainChanged", onChainChanged);
    return () => {
      eth.removeListener?.("accountsChanged", onAccountsChanged);
      eth.removeListener?.("chainChanged", onChainChanged);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<WalletContextValue>(
    () => ({
      hasWallet,
      account,
      chainId,
      isCorrectNetwork: chainId === BOTCHAIN.chainIdDec,
      connecting,
      switchingNetwork,
      error,
      connect,
      ensureBotChain,
      signMessage,
      getSigner,
      clearError: () => setError(""),
    }),
    [hasWallet, account, chainId, connecting, switchingNetwork, error, connect, ensureBotChain, signMessage, getSigner],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within a WalletProvider");
  return ctx;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}\u2026${address.slice(-4)}`;
}

/** MetaMask is connected to a different account than the one the session signed in with. */
export function isWalletMismatch(account?: string | null, sessionAddress?: string | null): boolean {
  return Boolean(account && sessionAddress) && !isSameAddress(account, sessionAddress);
}

/** Checksum-safe address equality (MetaMask and the backend don't always agree on casing). */
export function isSameAddress(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  try {
    return getAddress(a) === getAddress(b);
  } catch {
    return false;
  }
}
