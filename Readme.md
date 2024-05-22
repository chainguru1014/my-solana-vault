# Solana Vault

Solana program that will allow a user to register with it. Upon registration a user will be assigned a Vault.
The user Vault will naturally accept depositing SOL, implemented a method through which the user will be able to withdraw SOL from the Vault.
Also, the Vault might hold arbitrary tokens. Implemented a method for registering a token account with the Vault and another method for withdrawing tokens from the Vault.

Implemented using Anchor, along with the typescript unit tests

## Environment Setup


#### Localnet
```
anchor build
solana program extend 7JyjS3abUPSoXoV4au3skH1sd8GA9YBQzy5UakmGziGd 100000
anchor deploy
anchor test --skip-local-validator
```
