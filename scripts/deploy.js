import hre from "hardhat";
import { writeFileSync, mkdirSync } from "fs";
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
  const { ethers, networkConfig } = connection;

  const chainId = Number(networkConfig.chainId);
  console.log(`Deploying to network (expected chain ID ${chainId})...`);

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

  if (balance === 0n) {
    console.error(`❌ Deployer has no BOT. Fund ${deployer.address} before deploying.`);
    process.exit(1);
  }

  const escrow = await ethers.deployContract("OpenLCEscrow");
  await escrow.waitForDeployment();

  const address = await escrow.getAddress();
  const deploymentTransaction = escrow.deploymentTransaction();
  if (!deploymentTransaction) throw new Error("Deployment transaction is unavailable.");
  const receipt = await deploymentTransaction.wait();
  if (!receipt) throw new Error("Deployment receipt is unavailable.");

  const deployBlock = receipt.blockNumber;
  const txHash = receipt.hash;
  const explorer = EXPLORERS[chainId];
  const slug = NETWORK_SLUGS[chainId];

  console.log(`✓ OpenLCEscrow deployed to: ${address}`);
  console.log(`✓ Deploy block: ${deployBlock}`);
  console.log(`✓ Tx hash: ${txHash}`);
  if (explorer) {
    console.log(`✓ Explorer: ${explorer}/address/${address}`);
  }

  // Write deployment JSON
  mkdirSync("deployments", { recursive: true });
  const deploymentData = {
    network: networkConfig.name,
    chainId,
    contract: "OpenLCEscrow",
    address,
    deployBlock,
    txHash,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    explorer: explorer ? `${explorer}/address/${address}` : null,
  };

  const deploymentFile = join("deployments", `${slug}.json`);
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
