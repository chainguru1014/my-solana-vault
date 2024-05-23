import * as anchor from "@coral-xyz/anchor";
import { Program, web3, BN } from "@coral-xyz/anchor";
import { MySolanaVault } from "../target/types/my_solana_vault";
import {
  getAccount,
  getOrCreateAssociatedTokenAccount,
  createMint,
  mintTo
} from "@solana/spl-token";
import { assert, expect } from "chai";
import { Keypair } from "@solana/web3.js";

describe("Test", async () => {
  // Set up the provider
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  // Set up the program and wallet
  const pg = {
    program: anchor.workspace.MySolanaVault,
    wallet: provider.wallet,
    account1: Keypair.generate(),
    connection: provider.connection,
  };

  // Derive the user vault account PDA
  const userVaultAccount = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), pg.wallet.publicKey.toBuffer()],
    pg.program.programId
  )[0];

  // Derive the token account owner PDA
  let [tokenAccountOwnerPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("token_account_owner_pda"), pg.wallet.publicKey.toBuffer()],
    pg.program.programId
  );

  // Set up mint authority and token parameters
  const mintAuthority = pg.wallet.payer;
  const decimals = 9;
  const mintDecimals = Math.pow(10, decimals);
  let confirmOptions = {
    skipPreflight: true,
  };

  let SPLToken, tokenVault, tokenAccount, tokenAccountInfo;

  // Before all tests, set up the SPL token and accounts
  before(async () => {

    // Create a new mint
    SPLToken = await createMint(
      pg.connection,
      mintAuthority,
      pg.wallet.publicKey,
      pg.wallet.publicKey,
      decimals
    );
    console.log("New SPL Token Created!", SPLToken);

    // Derive the token vault account PDA
    [tokenVault] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("token_vault"), SPLToken.toBuffer(), pg.wallet.publicKey.toBuffer()],
      pg.program.programId
    );

    // Create or get the associated token account
    tokenAccount = await getOrCreateAssociatedTokenAccount(
      pg.connection,
      mintAuthority,
      SPLToken,
      pg.wallet.publicKey
    );
    
    // Get and log the initial token account info
    tokenAccountInfo = await getAccount(pg.connection, tokenAccount.address);
    console.log(
      "Owned token amount: " + tokenAccountInfo.amount / BigInt(mintDecimals)
    );

    // Mint some tokens to the token account
    await mintTo(pg.connection, mintAuthority, SPLToken, tokenAccount.address, pg.wallet.publicKey, 100 * mintDecimals);

    // Get and log the token account info after minting
    tokenAccountInfo = await getAccount(pg.connection, tokenAccount.address);
    console.log(
      "Owned token amount after mint: " + tokenAccountInfo.amount / BigInt(mintDecimals)
    );
  });

  it("Should register a user vault", async () => {
    try {
      await pg.program.methods
        .register()
        .accounts({
          userVaultAccount: userVaultAccount,
          signer: pg.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([pg.wallet.payer])
        .rpc();
      try {
        await pg.program.methods
          .register()
          .accounts({
            userVaultAccount: userVaultAccount,
            signer: pg.wallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([pg.wallet.payer])
          .rpc();
      } catch (error) {
        assert.equal(error.message, "failed to send transaction: Transaction simulation failed: Error processing Instruction 0: custom program error: 0x0");
      }
    } catch (error) {
      assert.equal(error.message, "failed to send transaction: Transaction simulation failed: Error processing Instruction 0: custom program error: 0x0");
    }
  });

  // Test case for depositing into the vault
  it("Deposit into Vault", async () => {
    const vaultBalance = await pg.connection.getBalance(userVaultAccount);

    const amount = new BN(100000000);
    // Send the deposit transaction
    const depositTx = await pg.program.methods
      .deposit(amount)
      .accounts({
        userVaultAccount: userVaultAccount,
        signer: pg.wallet.publicKey,
        systemProgram: web3.SystemProgram.programId,
      })
      .signers([pg.wallet.payer])
      .rpc();

    // Confirm the transaction
    await pg.connection.confirmTransaction(depositTx);

    const newVaultBalance = await pg.connection.getBalance(userVaultAccount);
    assert.equal(newVaultBalance, vaultBalance + 100000000);
  });

  // Test case for withdrawing from the vault
  it("Withdraw from vault", async () => {
    // Send the withdraw transaction
    const vaultBalance = await pg.connection.getBalance(userVaultAccount);

    const amount = new BN(100000000);
    const withdrawTx = await pg.program.methods
      .withdraw(amount)
      .accounts({
        userVaultAccount: userVaultAccount,
        signer: pg.wallet.publicKey,
        systemProgram: web3.SystemProgram.programId,
      })
      .signers([pg.wallet.payer])
      .rpc();

    // Confirm the transaction
    await pg.connection.confirmTransaction(withdrawTx);

    const newVaultBalance = await pg.connection.getBalance(userVaultAccount);
    assert.equal(newVaultBalance, vaultBalance - 100000000);
  });

  // Test case for failing withdraw to unregistered account
  it("Fail Deposit into Vault with unregistered user", async () => {
    try {
      const amount = new BN(100000000);
      // Send the deposit transaction
      await pg.program.methods
      .deposit(amount)
      .accounts({
        userVaultAccount: userVaultAccount,
        signer: pg.account1.publicKey,
        systemProgram: web3.SystemProgram.programId,
      })
      .signers([pg.wallet.payer])
      .rpc();
    } catch (error) {
      assert.equal(error.message, "Signature verification failed.\nMissing signature for public key [`" + pg.account1.publicKey.toBase58() + "`].");
    }
    try {
      const amount = new BN(100000000);
      // Send the deposit transaction
      await pg.program.methods
        .deposit(amount)
        .accounts({
          userVaultAccount: userVaultAccount,
          signer: pg.wallet.publicKey,
          systemProgram: web3.SystemProgram.programId,
        })
        .signers([pg.account1])
        .rpc();
    } catch (error) {
      assert.equal(error.message, "unknown signer: " + pg.account1.publicKey.toBase58());
    }
  });

  // Test case for failing withdraw to unregistered account
  it("Fail Withdraw to unregistered user", async () => {
    try {
      const amount = new BN(100000000);
      // Send the deposit transaction
      await pg.program.methods
      .withdraw(amount)
      .accounts({
        userVaultAccount: userVaultAccount,
        signer: pg.account1.publicKey,
        systemProgram: web3.SystemProgram.programId,
      })
      .signers([pg.wallet.payer])
      .rpc();
    } catch (error) {
      assert.equal(error.message, "Signature verification failed.\nMissing signature for public key [`" + pg.account1.publicKey.toBase58() + "`].");
    }
    try {
      const amount = new BN(100000000);
      // Send the deposit transaction
      await pg.program.methods
      .withdraw(amount)
      .accounts({
        userVaultAccount: userVaultAccount,
        signer: pg.wallet.publicKey,
        systemProgram: web3.SystemProgram.programId,
      })
      .signers([pg.account1])
      .rpc();
    } catch (error) {
      assert.equal(error.message, "unknown signer: " + pg.account1.publicKey.toBase58());
    }
  });

  // Test case for failing deposit due to insufficient funds
  it("Fail Deposit due to Insufficient Funds", async () => {
    try {
      const amount = new BN('1000000000000000000'); // Excessive amount
      
      await pg.program.methods
        .deposit(amount)
        .accounts({
          userVaultAccount: userVaultAccount,
          signer: pg.wallet.publicKey,
          systemProgram: web3.SystemProgram.programId,
        })
        .signers([pg.wallet.payer])
        .rpc();
    } catch (error) {
      assert.equal(error.error.errorMessage, "Insufficient Funds");
    }
  });

  // Test case for failing withdrawal due to insufficient funds
  it("Fail Withdraw due to Insufficient Funds", async () => {
    try {
      const amount = new BN('1000000000000000000'); // Excessive amount
      await pg.program.methods
        .withdraw(amount)
        .accounts({
          userVaultAccount: userVaultAccount,
          signer: pg.wallet.publicKey,
          systemProgram: web3.SystemProgram.programId,
        })
        .signers([pg.wallet.payer])
        .rpc();
    } catch (error) {
      assert.equal(error.error.errorMessage, "Insufficient Funds");
    }
  });

  // Test case for registering a token
  it("Register token", async () => {
    // Send the register token transaction
    let txHash = await pg.program.methods
      .registerToken()
      .accounts({
        tokenAccountOwnerPda: tokenAccountOwnerPda,
        vaultTokenAccount: tokenVault,
        senderTokenAccount: tokenAccount.address,
        mintOfTokenBeingSent: SPLToken,
        signer: pg.wallet.publicKey,
      })
      .signers([pg.wallet.payer])
      .rpc(confirmOptions);

    tokenAccountInfo = await getAccount(pg.connection, tokenAccount.address);
    assert.equal(tokenAccountInfo.amount / BigInt(mintDecimals), BigInt(100));
    tokenAccountInfo = await getAccount(pg.connection, tokenVault);
    assert.equal(tokenAccountInfo.amount / BigInt(mintDecimals), BigInt(0));
  });

  // Test case for registering a token
  it("Fail Register token without registered user", async () => {
    try {
      // Send the register token transaction
      await pg.program.methods
        .registerToken()
        .accounts({
          tokenAccountOwnerPda: tokenAccountOwnerPda,
          vaultTokenAccount: tokenVault,
          senderTokenAccount: tokenAccount.address,
          mintOfTokenBeingSent: SPLToken,
          signer: pg.wallet.publicKey,
        })
        .signers([pg.account1])
        .rpc(confirmOptions);
    } catch (error) {
      assert.equal(error.message, "unknown signer: " + pg.account1.publicKey.toBase58());
    }
  });

  // Test case for depositing SPL tokens
  it("Deposit SPL Token", async () => {
    // Send the deposit SPL token transaction
    let txHash = await pg.program.methods
      .depositToken(new anchor.BN(1 * mintDecimals))
      .accounts({
        tokenAccountOwnerPda: tokenAccountOwnerPda,
        vaultTokenAccount: tokenVault,
        senderTokenAccount: tokenAccount.address,
        mintOfTokenBeingSent: SPLToken,
        signer: pg.wallet.publicKey,
      })
      .signers([pg.wallet.payer])
      .rpc(confirmOptions);

    tokenAccountInfo = await getAccount(pg.connection, tokenAccount.address);
    assert.equal(tokenAccountInfo.amount / BigInt(mintDecimals), BigInt(99));
    tokenAccountInfo = await getAccount(pg.connection, tokenVault);
    assert.equal(tokenAccountInfo.amount / BigInt(mintDecimals), BigInt(1));
  });

  // Test case for withdrawing SPL tokens
  it("Withdraw SPL Token", async () => {
    // Send the withdraw SPL token transaction
    let txHash = await pg.program.methods
      .withdrawToken(new anchor.BN(1 * mintDecimals))
      .accounts({
        tokenAccountOwnerPda: tokenAccountOwnerPda,
        vaultTokenAccount: tokenVault,
        senderTokenAccount: tokenAccount.address,
        mintOfTokenBeingSent: SPLToken,
        signer: pg.wallet.publicKey,
      })
      .signers([pg.wallet.payer])
      .rpc(confirmOptions);

    tokenAccountInfo = await getAccount(pg.connection, tokenAccount.address);
    assert.equal(tokenAccountInfo.amount / BigInt(mintDecimals), BigInt(100));
    tokenAccountInfo = await getAccount(pg.connection, tokenVault);
    assert.equal(tokenAccountInfo.amount / BigInt(mintDecimals), BigInt(0));
  });

  // Test case for failing deposit spl token into vault without registered user
  it("Fail Deposit SPL Token into Vault without registered user", async () => {
    try {
      // Send the deposit transaction
      await pg.program.methods
        .depositToken(new anchor.BN(1 * mintDecimals))
        .accounts({
          tokenAccountOwnerPda: tokenAccountOwnerPda,
          vaultTokenAccount: tokenVault,
          senderTokenAccount: tokenAccount.address,
          mintOfTokenBeingSent: SPLToken,
          signer: pg.wallet.publicKey,
        })
        .signers([pg.account1])
        .rpc(confirmOptions);
    } catch (error) {
      assert.equal(error.message, "unknown signer: " + pg.account1.publicKey.toBase58());
    }
  });

  // Test case for failing withdraw spl token from vault without registered user
  it("Fail Withdraw SPL Token into Vault without registered user", async () => {
    try {
      // Send the deposit transaction
      await pg.program.methods
        .withdrawToken(new anchor.BN(1 * mintDecimals))
        .accounts({
          tokenAccountOwnerPda: tokenAccountOwnerPda,
          vaultTokenAccount: tokenVault,
          senderTokenAccount: tokenAccount.address,
          mintOfTokenBeingSent: SPLToken,
          signer: pg.wallet.publicKey,
        })
        .signers([pg.account1])
        .rpc(confirmOptions);
    } catch (error) {
      assert.equal(error.message, "unknown signer: " + pg.account1.publicKey.toBase58());
    }
  });

  // Test case for failing Deposit SPL Token due to Insufficient Balance
  it("Fail Deposit SPL Token due to Insufficient Balance", async () => {
    try {
      // Send the deposit SPL token transaction
      await pg.program.methods
        .depositToken(new anchor.BN(1000 * mintDecimals))
        .accounts({
          tokenAccountOwnerPda: tokenAccountOwnerPda,
          vaultTokenAccount: tokenVault,
          senderTokenAccount: tokenAccount.address,
          mintOfTokenBeingSent: SPLToken,
          signer: pg.wallet.publicKey,
        })
        .signers([pg.wallet.payer])
        .rpc(confirmOptions);
  
    } catch (error) {
      assert.equal(error.msg ? error.msg : error.error.errorMessage, "Insufficient Funds");
    }
  });

  // Test case for failing withdraw SPL Token due to Insufficient Balance
  it("Fail Withdraw SPL Token due to Insufficient Balance", async () => {
    try {
      // Send the withdraw SPL token transaction
      await pg.program.methods
        .withdrawToken(new anchor.BN(1000 * mintDecimals))
        .accounts({
          tokenAccountOwnerPda: tokenAccountOwnerPda,
          vaultTokenAccount: tokenVault,
          senderTokenAccount: tokenAccount.address,
          mintOfTokenBeingSent: SPLToken,
          signer: pg.wallet.publicKey,
        })
        .signers([pg.wallet.payer])
        .rpc(confirmOptions);
  
    } catch (error) {
      assert.equal(error.msg ? error.msg : error.error.errorMessage, "Insufficient Funds");
    }
  });

  // Test case for repeated deposits and withdrawals
  it("Repeated Token Operations", async () => {
    // Deposit tokens
    for (let i = 1; i <= 5; i++) {
      let txHash = await pg.program.methods
        .depositToken(new anchor.BN(1 * mintDecimals))
        .accounts({
          tokenAccountOwnerPda: tokenAccountOwnerPda,
          vaultTokenAccount: tokenVault,
          senderTokenAccount: tokenAccount.address,
          mintOfTokenBeingSent: SPLToken,
          signer: pg.wallet.publicKey,
        })
        .signers([pg.wallet.payer])
        .rpc(confirmOptions);

      tokenAccountInfo = await getAccount(pg.connection, tokenAccount.address);
      assert.equal(tokenAccountInfo.amount / BigInt(mintDecimals), BigInt(100 - i));
      tokenAccountInfo = await getAccount(pg.connection, tokenVault);
      assert.equal(tokenAccountInfo.amount / BigInt(mintDecimals), BigInt(i));
    }

    // Withdraw tokens
    for (let i = 1; i <= 5; i++) {
      let txHash = await pg.program.methods
        .withdrawToken(new anchor.BN(1 * mintDecimals))
        .accounts({
          tokenAccountOwnerPda: tokenAccountOwnerPda,
          vaultTokenAccount: tokenVault,
          senderTokenAccount: tokenAccount.address,
          mintOfTokenBeingSent: SPLToken,
          signer: pg.wallet.publicKey,
        })
        .signers([pg.wallet.payer])
        .rpc(confirmOptions);

      tokenAccountInfo = await getAccount(pg.connection, tokenAccount.address);
      assert.equal(tokenAccountInfo.amount / BigInt(mintDecimals), BigInt(95 + i));
      tokenAccountInfo = await getAccount(pg.connection, tokenVault);
      assert.equal(tokenAccountInfo.amount / BigInt(mintDecimals), BigInt(5 - i));
    }

  });
});
