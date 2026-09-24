/**
 * BOT Chain network config, the escrow contract's address/deploy block (fail-closed when unset),
 * explorer links, and exact decimal-string <-> wei conversions for the native BOT asset.
 *
 * Never do `Math.round(value * 10 ** 18)` anywhere in this app: it silently loses precision past
 * about 15 significant digits. `parseBot`/`formatBot` below go through ethers' string-based
 * decimal math instead, which is exact at any magnitude.
 */
export { formatBot, parseBot } from "./units.mjs";

export type BotChainNetwork = {
  chainIdDec: number;
  chainIdHex: string;
  chainName: string;
  rpcUrl: string;
  explorerBase: string;
  getBotLabel: string;
  getBotUrl: string;
};

export const NETWORKS: Record<number, BotChainNetwork> = {
  968: {
    chainIdDec: 968,
    chainIdHex: "0x3c8",
    chainName: "BOT Chain Testnet",
    rpcUrl: "https://rpc.bohr.life",
    explorerBase: "https://scan.bohr.life",
    getBotLabel: "Get testnet BOT",
    getBotUrl: "https://faucet.botchain.ai/basic",
  },
  677: {
    chainIdDec: 677,
    chainIdHex: "0x2a5",
    chainName: "BOT Chain",
    rpcUrl: "https://rpc.botchain.ai",
    explorerBase: "https://scan.botchain.ai",
    getBotLabel: "Get BOT on BOT Chain DEX",
    getBotUrl: "https://dex.botchain.ai",
  },
};

const configuredChainId = Number((process.env.NEXT_PUBLIC_BOTCHAIN_CHAIN_ID ?? "").trim() || NaN);

/** True only when NEXT_PUBLIC_BOTCHAIN_CHAIN_ID is set to a network in NETWORKS. escrowConfigured
 *  requires it: a build with a testnet escrow address and no chain id must not send real BOT to
 *  an address that has no contract on mainnet. */
export const configuredChainKnown = NETWORKS[configuredChainId] !== undefined;

/** The network this deployment targets. Shows BOT Chain mainnet (677) on an unset or unknown
 *  value, for display only: chain actions stay disabled then (see configuredChainKnown). */
export const BOTCHAIN: BotChainNetwork = NETWORKS[configuredChainId] ?? NETWORKS[677];

/** The exact object MetaMask's `wallet_addEthereumChain` expects for this network. */
export const BOTCHAIN_ADD_CHAIN_PARAMS = {
  chainId: BOTCHAIN.chainIdHex,
  chainName: BOTCHAIN.chainName,
  nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
  rpcUrls: [BOTCHAIN.rpcUrl],
  blockExplorerUrls: [BOTCHAIN.explorerBase],
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const configuredEscrowAddress = (process.env.NEXT_PUBLIC_OPENLC_ESCROW_ADDRESS ?? "").trim();
const configuredDeployBlock = Number(process.env.NEXT_PUBLIC_OPENLC_ESCROW_DEPLOY_BLOCK ?? "0");

export const ESCROW_ADDRESS = /^0x[0-9a-fA-F]{40}$/.test(configuredEscrowAddress)
  ? configuredEscrowAddress
  : ZERO_ADDRESS;

export const ESCROW_DEPLOY_BLOCK =
  Number.isSafeInteger(configuredDeployBlock) && configuredDeployBlock > 0 ? configuredDeployBlock : 0;

/** Fails closed: every chain action must check this and refuse with a visible reason rather than
 *  throwing a raw error at click time when the deployment has no escrow address configured yet. */
export const escrowConfigured = configuredChainKnown && ESCROW_ADDRESS !== ZERO_ADDRESS && ESCROW_DEPLOY_BLOCK > 0;

export const ESCROW_NOT_CONFIGURED_REASON =
  "The escrow contract is not configured for this deployment yet (NEXT_PUBLIC_BOTCHAIN_CHAIN_ID / NEXT_PUBLIC_OPENLC_ESCROW_ADDRESS / NEXT_PUBLIC_OPENLC_ESCROW_DEPLOY_BLOCK). Chain actions are disabled until it is.";

/** Throws the same fail-closed message every escrow action should surface when unconfigured. */
export function requireEscrowConfigured(): void {
  if (!escrowConfigured) throw new Error(ESCROW_NOT_CONFIGURED_REASON);
}

export function explorerTxUrl(hash: string): string {
  return `${BOTCHAIN.explorerBase}/tx/${hash}`;
}

export function explorerAddressUrl(address: string): string {
  return `${BOTCHAIN.explorerBase}/address/${address}`;
}
