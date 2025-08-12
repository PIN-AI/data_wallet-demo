# Data Wallet Demo

This project demonstrates a prototype of a "data wallet" using Sui and Walrus. It showcases how user data can be encrypted such that only specific authorized agents can decrypt it, leveraging on-chain access control policies.

## Video


https://github.com/user-attachments/assets/767f9d5e-0e50-4e4a-851d-351068b54446



## How it Works

The core concept involves:

1.  **Access Policy Smart Contract**: A Sui Move smart contract (`contracts/access_policy/sources/access_policy.move`) manages access control. It allows creating whitelists and associating them with specific data identifiers.
2.  **Encryption (SEAL)**: User data is encrypted using the `@mysten/seal` library. The encryption is tied to a unique `dataId`.
3.  **Authorization**: Before an agent can decrypt data, it must perform an on-chain transaction calling the `seal_approve` function in the access policy contract. This function verifies if the agent's address is on the whitelist for the `dataId`.
4.  **Decryption**: If authorized, the agent receives a session key, allowing it to decrypt the data using `@mysten/seal`.
5.  **Storage (Walrus)**: Encrypted data is stored on and retrieved from the Walrus storage network.

The `scripts/demo.ts` file demonstrates this entire workflow end-to-end.

## Prerequisites

*   Node.js and npm installed.

## Setup

1.  Navigate to the `data_wallet-master` directory: `cd data_wallet-master`
2.  Install dependencies: `npm install`

## Running the Demo

1.  Ensure the `packageId` in `scripts/demo.ts` matches the deployed `access_policy` contract on the target Sui network (currently configured for Testnet).
2.  Run the demo: `npm run demo`

This will execute the full demo, including:
*   Setting up keypairs for Alice (owner) and agents.
*   Creating whitelists for email and discord agents.
*   Adding agents to their respective whitelists.
*   Reading sample data (`data/discord.json`, `data/email_1.json`).
*   Encrypting the data.
*   Uploading encrypted data to Walrus.
*   Retrieving encrypted data from Walrus.
*   Demonstrating successful decryption by the correct agent.
*   Demonstrating failed decryption by an unauthorized agent.

## Project Structure

*   `contracts/access_policy`: Sui Move smart contract for access control.
*   `data/`: Sample user data files for encryption.
*   `scripts/demo.ts`: Main demo script.
*   `package.json`: Project dependencies and scripts.
