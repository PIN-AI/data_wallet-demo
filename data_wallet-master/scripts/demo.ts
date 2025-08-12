import {
  SealClient,
  SessionKey,
  getAllowlistedKeyServers,
  EncryptedObject,
} from "@mysten/seal";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { WalrusClient } from "@mysten/walrus";
import * as fs from "fs";
import { fromHex } from "@mysten/sui/utils";

async function main() {
  const packageId =
    "0x178a15e9921f9988d7bf092b4252d203700e0de9e2384f80fbb9a5dae22ae26c";
  const moduleName = "access_policy";

  console.log("Demo: Alice encrypts data with Seal and uploads to Walrus");
  console.log("----------------------------------------------------");

  const suiClient = new SuiClient({ url: getFullnodeUrl("testnet") });
  const keyServerIds = await getAllowlistedKeyServers("testnet");
  const client = new SealClient({
    suiClient: suiClient as any,
    serverObjectIds: keyServerIds,
    verifyKeyServers: true,
  });

  const walrusClient = new WalrusClient({
    network: "testnet",
    suiClient: suiClient,
  });

  console.log("1. Setting up Alice and agent keypairs");
  const alicePrivateKey = "BtJfLV7MbPK05KQD6Q+8wxPqyRJx6MSHDiY6AjWuf9k=";
  const aliceKeyPair = Ed25519Keypair.fromSecretKey(
    Buffer.from(alicePrivateKey, "base64url")
  );
  console.log(`   Alice address: ${aliceKeyPair.toSuiAddress()}`);

  const emailAgentPk = "AtJfLV7MbPK05KQD6Q+8wxPqyRJx6MSHDiY6AjWuf9k=";
  const emailAgnetKeyPair = Ed25519Keypair.fromSecretKey(
    Buffer.from(emailAgentPk, "base64url")
  );
  console.log(`   Email agent address: ${emailAgnetKeyPair.toSuiAddress()}`);

  const discordAgentPk = "CtJfLV7MbPK05KQD6Q+8wxPqyRJx6MSHDiY6AjWuf9k=";
  const discordAgentKeyPair = Ed25519Keypair.fromSecretKey(
    Buffer.from(discordAgentPk, "base64url")
  );
  console.log(
    `   Discord agent address: ${discordAgentKeyPair.toSuiAddress()}`
  );

  console.log("\n2. Creating whitelists for Email and Discord agents");
  const { whitelistId: email_whitelistId, capId: email_capId } =
    await createNewWhitelistAndCap(emailAgnetKeyPair, packageId, suiClient);
  console.log(`   Email whitelist ID: ${email_whitelistId}`);

  const { whitelistId: discord_whitelistId, capId: discord_capId } =
    await createNewWhitelistAndCap(discordAgentKeyPair, packageId, suiClient);
  console.log(`   Discord whitelist ID: ${discord_whitelistId}`);

  const email_dataId = email_whitelistId;
  const discord_dataId = discord_whitelistId;

  console.log("\n3. Adding agents to their respective whitelists");
  await addAgentToWhitelist(
    emailAgnetKeyPair,
    email_whitelistId,
    email_capId,
    packageId,
    suiClient
  );
  console.log(`   Email agent added to email whitelist`);

  await addAgentToWhitelist(
    discordAgentKeyPair,
    discord_whitelistId,
    discord_capId,
    packageId,
    suiClient
  );
  console.log(`   Discord agent added to discord whitelist`);

  console.log("\n4. Reading data files to encrypt");
  const { discord: discordData, email: emailData } = await readDataFiles();
  console.log(`   Email data size: ${emailData.length} bytes`);
  console.log(`   Discord data size: ${discordData.length} bytes`);

  console.log("\n5. Encrypting data with Seal");
  const {
    encryptedObject: discordEncryptedObject,
    backupKey: discordBackupKey,
  } = await encryptData(discordData, discord_whitelistId, packageId, client);
  console.log(`   Discord data encrypted successfully`);

  const { encryptedObject: emailEncryptedObject, backupKey: emailBackupKey } =
    await encryptData(emailData, email_whitelistId, packageId, client);
  console.log(`   Email data encrypted successfully`);

  console.log("\n6. Combining encrypted data and uploading to Walrus");
  const combinedEncryptedData = {
    discord: Array.from(discordEncryptedObject),
    email: Array.from(emailEncryptedObject),
  };

  const combinedDataString = JSON.stringify(combinedEncryptedData);
  const combinedDataBuffer = Buffer.from(combinedDataString, "utf-8");
  const combinedData = new Uint8Array(combinedDataBuffer);
  console.log(`   Combined data size: ${combinedData.length} bytes`);

  let blobId = "";
  try {
    blobId = await uploadToWalrus(combinedData, aliceKeyPair, walrusClient);
    console.log(
      `   Data successfully uploaded to Walrus with blob ID: ${blobId}`
    );
  } catch (error) {
    console.error(`   Failed to upload to Walrus: ${error}`);
  }

  console.log("\n7. Retrieving encrypted data from Walrus");
  let retrievedEncryptedObject: Uint8Array = new Uint8Array();
  if (blobId) {
    try {
      retrievedEncryptedObject = await readFromWalrus(blobId, walrusClient);
      console.log(
        `   Data successfully retrieved from Walrus (${retrievedEncryptedObject.length} bytes)`
      );
    } catch (error) {
      console.error(`   Failed to read from Walrus: ${error}`);
    }
  }

  const { discord: walrusDiscordData, email: walrusEmailData } =
    extractEncryptedObjects(retrievedEncryptedObject);
  console.log(
    `   Data extracted: email (${walrusEmailData.length} bytes), discord (${walrusDiscordData.length} bytes)`
  );

  console.log("\n8. Email agent decrypting email data");
  const { txBytes, sessionKey } = await createSealApproveTransaction(
    emailAgnetKeyPair,
    packageId,
    moduleName,
    email_dataId,
    email_whitelistId,
    suiClient
  );

  try {
    const decryptedBytes = await client.decrypt({
      data: walrusEmailData,
      sessionKey,
      txBytes,
    });
    console.log(
      `   Email agent successfully decrypted email data (${decryptedBytes.length} bytes)`
    );
    const decryptedString = Buffer.from(decryptedBytes).toString("utf-8");
    console.log(
      `   Decrypted data preview: ${decryptedString.substring(0, 100)}...`
    );
  } catch (error) {
    console.error(`   Email agent failed to decrypt email data: ${error}`);
  }

  // add email agent to decrypt discord data 
  console.log(
    "\n9. Email agent attempting to decrypt discord data (should fail)"
  );
  try {
    const decryptedBytes = await client.decrypt({
      data: walrusDiscordData,
      sessionKey,
      txBytes,
    });
    console.log(
      `   Unexpected success: Email agent decrypted discord data (${decryptedBytes.length} bytes)`
    );
  } catch (error) {
    console.log(`   Expected failure: Email agent cannot decrypt discord data`);
    console.log(`   Error: ${error}`);
  }


  console.log("\n10. Discord agent decrypting discord data");
  const { txBytes: discordTxBytes, sessionKey: discordSessionKey } =
    await createSealApproveTransaction(
      discordAgentKeyPair,
      packageId,
      moduleName,
      discord_dataId,
      discord_whitelistId,
      suiClient
    );

  try {
    const decryptedBytes = await client.decrypt({
      data: walrusDiscordData,
      sessionKey: discordSessionKey,
      txBytes: discordTxBytes,
    });
    console.log(
      `   Discord agent successfully decrypted discord data (${decryptedBytes.length} bytes)`
    );
    const decryptedString = Buffer.from(decryptedBytes).toString("utf-8");
    console.log(
      `   Decrypted data preview: ${decryptedString.substring(0, 100)}...`
    );
  } catch (error) {
    console.error(`   Discord agent failed to decrypt discord data: ${error}`);
  }
}

async function uploadToWalrus(
  data: Uint8Array,
  keypair: Ed25519Keypair,
  walrusClient: WalrusClient
): Promise<string> {
  const epochs = 1;
  const cost = await walrusClient.storageCost(data.length, epochs);
  console.log(`   Storage cost: ${cost}`);

  const maxRetries = 3;
  let attempt = 0;
  let lastError: any;

  while (attempt < maxRetries) {
    try {
      const { blobId } = await walrusClient.writeBlob({
        blob: data,
        deletable: true,
        epochs,
        signer: keypair,
      });
      return blobId;
    } catch (err) {
      lastError = err;
      attempt++;
      console.warn(`writeBlob attempt ${attempt} failed. Retrying...`, err);
    }
  }

  throw new Error(`writeBlob failed after ${maxRetries} attempts: ${lastError}`);
}

function extractEncryptedObjects(combinedData: Uint8Array): {
  discord: Uint8Array;
  email: Uint8Array;
} {
  const dataString = Buffer.from(combinedData).toString("utf-8");
  const parsed = JSON.parse(dataString);

  return {
    discord: new Uint8Array(parsed.discord),
    email: new Uint8Array(parsed.email),
  };
}

async function readFromWalrus(
  blobId: string,
  walrusClient: WalrusClient
): Promise<Uint8Array> {
  const blob = await walrusClient.readBlob({ blobId });
  return blob;
}

async function createSealApproveTransaction(
  keypair: Ed25519Keypair,
  packageId: string,
  moduleName: string,
  dataId: string,
  whitelistId: string,
  suiClient: SuiClient
) {
  const clientAddress = keypair.toSuiAddress();

  const sessionKey = new SessionKey({
    address: clientAddress,
    packageId: packageId,
    ttlMin: 10,
  });

  const message = sessionKey.getPersonalMessage();
  const signature = await keypair.signPersonalMessage(message);

  sessionKey.setPersonalMessageSignature(signature.signature);

  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::${moduleName}::seal_approve`,
    arguments: [tx.pure.vector("u8", fromHex(dataId)), tx.object(whitelistId)],
  });
  tx.setGasBudget(10000000);

  const txBytes = await tx.build({
    client: suiClient,
    onlyTransactionKind: true,
  });

  const txDigest = await suiClient.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
  });
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const txResult = await suiClient.getTransactionBlock({
    digest: txDigest.digest,
    options: { showEffects: true },
  });

  return { txBytes, sessionKey };
}

async function readJsonFile(filePath: string): Promise<Uint8Array> {
  try {
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const jsonData = JSON.parse(fileContent);
    const jsonString = JSON.stringify(jsonData);
    const buffer = Buffer.from(jsonString, "utf-8");
    const data = new Uint8Array(buffer);
    return data;
  } catch (error) {
    throw error;
  }
}

async function readDataFiles(): Promise<{
  discord: Uint8Array;
  email: Uint8Array;
}> {
  const discordData = await readJsonFile("./data/discord.json");
  const emailData = await readJsonFile("./data/email_1.json");

  return {
    discord: discordData,
    email: emailData,
  };
}

async function encryptData(
  data: Uint8Array,
  whitelistId: string,
  packageId: string,
  client: SealClient
): Promise<{ encryptedObject: Uint8Array; backupKey: Uint8Array }> {
  const dataId = whitelistId;

  const { encryptedObject, key: backupKey } = await client.encrypt({
    threshold: 1,
    packageId: packageId,
    id: dataId,
    data: data,
  });

  return { encryptedObject, backupKey };
}

async function createNewWhitelistAndCap(
  keypair: Ed25519Keypair,
  packageId: string,
  suiClient: SuiClient
): Promise<{ whitelistId: string; capId: string }> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::access_policy::create_whitelist_entry`,
    arguments: [],
  });
  tx.setGasBudget(10000000);

  const txResult = await suiClient.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
    options: {
      showEffects: true,
      showObjectChanges: true,
    },
  });

  const whitelistIdResult = txResult.objectChanges?.find((change) => {
    if (change.type === "created") {
      return change.objectType.includes(
        `${packageId}::access_policy::Whitelist`
      );
    }
    return false;
  }) as any;

  const whitelistId = whitelistIdResult?.objectId;
  if (!whitelistId) {
    throw new Error("Failed to extract whitelist ID from transaction result");
  }

  const capIdResult = txResult.objectChanges?.find((change) => {
    if (change.type === "created") {
      return change.objectType.includes(`${packageId}::access_policy::Cap`);
    }
    return false;
  }) as any;

  const capId = capIdResult?.objectId;
  if (!capId) {
    throw new Error("Failed to extract cap ID from transaction result");
  }

  return { whitelistId, capId };
}

async function addAgentToWhitelist(
  keypair: Ed25519Keypair,
  whitelistId: string,
  capId: string,
  packageId: string,
  suiClient: SuiClient
): Promise<void> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::access_policy::add`,
    arguments: [
      tx.object(whitelistId),
      tx.object(capId),
      tx.pure.address(keypair.toSuiAddress()),
    ],
  });
  tx.setGasBudget(10000000);

  const txResult = await suiClient.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
    options: {
      showEffects: true,
    },
  });
}

main().catch((error) => {
  console.error("Demo failed with error:", error);
});
