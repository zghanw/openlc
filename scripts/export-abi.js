import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const ARTIFACT_PATH = resolve("artifacts/contracts/OpenLCEscrow.sol/OpenLCEscrow.json");
const ABI_PATHS = [
  "backend/src/integrations/openlc-escrow.abi.json",
  "web/lib/openlc-escrow.abi.json",
];

function getAbi() {
  const artifact = JSON.parse(readFileSync(ARTIFACT_PATH, "utf-8"));
  return artifact.abi;
}

function readAbi(path) {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

function abiEqual(abi1, abi2) {
  return JSON.stringify(abi1) === JSON.stringify(abi2);
}

async function main() {
  const checkMode = process.argv.includes("--check");
  const sourceAbi = getAbi();

  if (checkMode) {
    console.log("Checking ABI files for drift...");
    let hasDrift = false;

    for (const path of ABI_PATHS) {
      const fileAbi = readAbi(path);
      if (!fileAbi) {
        console.error(`❌ ${path} not found`);
        hasDrift = true;
        continue;
      }

      if (!abiEqual(sourceAbi, fileAbi)) {
        console.error(`❌ ${path} differs from artifact`);
        hasDrift = true;
      } else {
        console.log(`✓ ${path} is up to date`);
      }
    }

    if (hasDrift) {
      console.error("\nABI drift detected. Run: npm run export-abi");
      process.exit(1);
    }
    console.log("\n✓ All ABI files match artifact");
    process.exit(0);
  } else {
    console.log("Exporting ABI to files...");
    const abiJson = JSON.stringify(sourceAbi, null, 2) + "\n";

    for (const path of ABI_PATHS) {
      writeFileSync(path, abiJson);
      console.log(`✓ Exported to ${path}`);
    }

    console.log("\n✓ ABI export complete");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
