import hre from "hardhat";
import { writeFileSync, mkdirSync, existsSync, readFileSync, copyFileSync } from "fs";
import { join } from "path";

const EXPLORERS = {
  968: "https://scan.bohr.life",
  677: "https://scan.botchain.ai",
};

const NETWORK_SLUGS = {
  968: "botchain-testnet",
  677: "botchain-mainnet",
};

async function main() {
  const connection = await hre.network.create();
  const { ethers, networkConfig, networkName } = connection;

  const chainId = Number(networkConfig.chainId);
  console.log(`Deploying to network (expected chain ID ${chainId})...`);

  // Verify chain is mapped
  if (!NETWORK_SLUGS[chainId] || !EXPLORERS[chainId]) {
    console.error(`❌ Chain ID ${chainId} is not configured. Supported chains: 968 (testnet), 677 (mainnet).`);
    process.exit(1);
  }

  // Mainnet guard
  if (chainId === 677) {
    const confirmMainnet = process.env.CONFIRM_MAINNET;
    if (confirmMainnet !== "yes") {
      console.error("❌ Mainnet deployment requires CONFIRM_MAINNET=yes environment variable");
      process.exit(1);
    }
  }

  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance: ${ethers.formatEther(balance)} BOT`);

  // Estimate gas cost
  const factory = await ethers.getContractFactory("OpenLCEscrow");
  const deployTx = factory.getDeployTransaction();
  let estimatedGas;
  try {
    estimatedGas = await ethers.provider.estimateGas(deployTx);
  } catch (e) {
    console.error(`❌ Failed to estimate gas: ${e.message}`);
    process.exit(1);
  }

  const feeData = await ethers.provider.getFeeData();
  const gasPrice = feeData.gasPrice || ethers.parseUnits("20", "gwei");
  const estimatedCost = (estimatedGas * gasPrice * 12n) / 10n; // 20% buffer
  const estimatedCostBOT = ethers.formatEther(estimatedCost);

  if (balance < estimatedCost) {
    console.error(
      `❌ Insufficient balance. Required: ${estimatedCostBOT} BOT (estimated with 20% buffer). Available: ${ethers.formatEther(balance)} BOT.`
    );
    process.exit(1);
  }

  // Check for existing deployment BEFORE deploying
  const slug = NETWORK_SLUGS[chainId];
  const deploymentFile = join("deployments", `${slug}.json`);

  if (existsSync(deploymentFile)) {
    const existing = JSON.parse(readFileSync(deploymentFile, "utf-8"));
    const existingAddress = existing.address;
    const existingTxHash = existing.txHash;
    const existingBlock = existing.deployBlock;

    if (process.env.ALLOW_REDEPLOY !== "yes") {
      console.error(
        `❌ Deployment record already exists at ${deploymentFile}:\n` +
          `   Address: ${existingAddress}\n` +
          `   TxHash: ${existingTxHash}\n` +
          `To re-deploy and overwrite, set ALLOW_REDEPLOY=yes and retry.`
      );
      process.exit(1);
    }

    // Backup old file
    const backupFile = join("deployments", `${slug}.${existingBlock}.json`);
    copyFileSync(deploymentFile, backupFile);
    console.log(`✓ Backed up previous record to ${backupFile}`);
  }

  const escrow = await ethers.deployContract("OpenLCEscrow");
  await escrow.waitForDeployment();

  const address = await escrow.getAddress();
  const deploymentTransaction = escrow.deploymentTransaction();
  if (!deploymentTransaction) throw new Error("Deployment transaction is unavailable.");

  // Print immediately before waiting for receipt
  const txHash = deploymentTransaction.hash;
  console.log(`Deploy tx submitted: ${txHash}`);
  console.log(`Contract address: ${address}`);
  console.log(`Waiting for the receipt...`);

  const receipt = await deploymentTransaction.wait();
  if (!receipt) throw new Error("Deployment receipt is unavailable.");

  const deployBlock = receipt.blockNumber;
  const explorer = EXPLORERS[chainId];

  console.log(`✓ OpenLCEscrow deployed to: ${address}`);
  console.log(`✓ Deploy block: ${deployBlock}`);
  console.log(`✓ Tx hash: ${txHash}`);
  if (explorer) {
    console.log(`✓ Explorer: ${explorer}/address/${address}`);
  }

  // Write deployment JSON
  mkdirSync("deployments", { recursive: true });

  const deploymentData = {
    network: networkName,
    chainId,
    contract: "OpenLCEscrow",
    address,
    deployBlock,
    txHash,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    explorer: `${explorer}/address/${address}`,
  };

  writeFileSync(deploymentFile, JSON.stringify(deploymentData, null, 2) + "\n");
  console.log(`✓ Deployment JSON written to ${deploymentFile}`);

  // Print env vars for other packages
  console.log("\nEnvironment variables for integration:");
  console.log(`OPENLC_ESCROW_ADDRESS=${address}`);
  console.log(`OPENLC_ESCROW_DEPLOY_BLOCK=${deployBlock}`);
  console.log(`NEXT_PUBLIC_OPENLC_ESCROW_ADDRESS=${address}`);
  console.log(`NEXT_PUBLIC_OPENLC_ESCROW_DEPLOY_BLOCK=${deployBlock}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
