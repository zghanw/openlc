import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join, resolve } from "path";

const ABI_PATHS = [
  "backend/src/integrations/openlc-escrow.abi.json",
  "web/lib/openlc-escrow.abi.json",
];

function findArtifact() {
  const artifactsDir = resolve("artifacts");
  const matches = [];

  function walkDir(dir) {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          walkDir(fullPath);
        } else if (entry.name === "OpenLCEscrow.json") {
          // Skip debug files
          if (!entry.name.endsWith(".dbg.json")) {
            matches.push(fullPath);
          }
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }
  }

  walkDir(artifactsDir);

  if (matches.length === 0) {
    console.error("❌ No artifact found — run `npm run compile` first");
    process.exit(1);
  }

  if (matches.length > 1) {
    console.error("❌ Multiple OpenLCEscrow.json artifacts found:");
    matches.forEach((m) => console.error(`   ${m}`));
    process.exit(1);
  }

  return matches[0];
}

function getAbiContent() {
  const artifactPath = findArtifact();
  const artifact = JSON.parse(readFileSync(artifactPath, "utf-8"));
  const abi = artifact.abi;
  return JSON.stringify(abi, null, 2) + "\n";
}

function readFileContent(path) {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

async function main() {
  const checkMode = process.argv.includes("--check");
  const expectedContent = getAbiContent();

  if (checkMode) {
    console.log("Checking ABI files for drift...");
    let hasDrift = false;

    for (const path of ABI_PATHS) {
      const fileContent = readFileContent(path);
      if (!fileContent) {
        console.error(`❌ ${path} not found`);
        hasDrift = true;
        continue;
      }

      if (fileContent !== expectedContent) {
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

    for (const path of ABI_PATHS) {
      writeFileSync(path, expectedContent);
      console.log(`✓ Exported to ${path}`);
    }

    console.log("\n✓ ABI export complete");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
