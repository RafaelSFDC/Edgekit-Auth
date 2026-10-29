import * as jose from "jose";
import * as fs from "node:fs";
import * as path from "node:path";

async function main() {
  console.log("\n🔑 [Hono Auth] Generating ECDSA ES256 Key Pair...\n");

  const { privateKey, publicKey } = await jose.generateKeyPair("ES256", {
    extractable: true,
  });

  const privateKeyPem = await jose.exportPKCS8(privateKey);
  const publicKeyPem = await jose.exportSPKI(publicKey);

  // Format into single-line escaped strings for robust .env parsing
  const escapedPrivate = privateKeyPem.replace(/\r?\n/g, "\\n");
  const escapedPublic = publicKeyPem.replace(/\r?\n/g, "\\n");

  const rootDir = process.cwd();
  const envPath = path.join(rootDir, ".env");
  const envExamplePath = path.join(rootDir, ".env.example");

  const isForce = process.argv.includes("--force");
  let envUpdated = false;

  if (fs.existsSync(envPath)) {
    let content = fs.readFileSync(envPath, "utf-8");
    const hasExistingPrivate =
      /JWT_PRIVATE_KEY_PEM="[^"]+"/.test(content) ||
      /JWT_PRIVATE_KEY_PEM='[^']+'/.test(content) ||
      /JWT_PRIVATE_KEY_PEM=[^\s\r\n]+/.test(content);

    if (hasExistingPrivate && !isForce) {
      console.log(
        "⚠️  .env already contains JWT keys! Use '--force' to overwrite existing keys.\n"
      );
    } else {
      // Replace existing empty or placeholder keys
      if (/JWT_PRIVATE_KEY_PEM=.*(\r?\n|$)/.test(content)) {
        content = content.replace(
          /JWT_PRIVATE_KEY_PEM=.*(\r?\n|$)/,
          `JWT_PRIVATE_KEY_PEM="${escapedPrivate}"\n`
        );
      } else {
        content += `\nJWT_PRIVATE_KEY_PEM="${escapedPrivate}"\n`;
      }

      if (/JWT_PUBLIC_KEY_PEM=.*(\r?\n|$)/.test(content)) {
        content = content.replace(
          /JWT_PUBLIC_KEY_PEM=.*(\r?\n|$)/,
          `JWT_PUBLIC_KEY_PEM="${escapedPublic}"\n`
        );
      } else {
        content += `JWT_PUBLIC_KEY_PEM="${escapedPublic}"\n`;
      }

      fs.writeFileSync(envPath, content, "utf-8");
      envUpdated = true;
      console.log("✅ Updated existing .env with generated ES256 keys.");
    }
  } else if (fs.existsSync(envExamplePath)) {
    let exampleContent = fs.readFileSync(envExamplePath, "utf-8");

    exampleContent = exampleContent.replace(
      /JWT_PRIVATE_KEY_PEM=.*(\r?\n|$)/,
      `JWT_PRIVATE_KEY_PEM="${escapedPrivate}"\n`
    );
    exampleContent = exampleContent.replace(
      /JWT_PUBLIC_KEY_PEM=.*(\r?\n|$)/,
      `JWT_PUBLIC_KEY_PEM="${escapedPublic}"\n`
    );

    fs.writeFileSync(envPath, exampleContent, "utf-8");
    envUpdated = true;
    console.log("✅ Created .env from .env.example with generated ES256 keys.");
  } else {
    fs.writeFileSync(
      envPath,
      `JWT_PRIVATE_KEY_PEM="${escapedPrivate}"\nJWT_PUBLIC_KEY_PEM="${escapedPublic}"\n`,
      "utf-8"
    );
    envUpdated = true;
    console.log("✅ Created new .env file with generated ES256 keys.");
  }

  console.log("\n================ [PUBLIC KEY (SPKI PEM)] ================");
  console.log(publicKeyPem);
  console.log("========================================================\n");

  if (!envUpdated) {
    console.log("To manually configure in .env:");
    console.log(`JWT_PRIVATE_KEY_PEM="${escapedPrivate}"`);
    console.log(`JWT_PUBLIC_KEY_PEM="${escapedPublic}"\n`);
  }

  console.log("🚀 Production Setup (Cloudflare Workers Secrets):");
  console.log("Run the following commands to set your secrets in production:\n");
  console.log("  npx wrangler secret put JWT_PRIVATE_KEY_PEM");
  console.log("  npx wrangler secret put JWT_PUBLIC_KEY_PEM\n");
}

main().catch((err) => {
  console.error("❌ Failed to generate keys:", err);
  process.exit(1);
});
