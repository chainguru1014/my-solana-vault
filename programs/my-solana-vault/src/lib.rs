// Import necessary modules and dependencies from the Anchor framework and Solana program library
use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token::{Mint, Token, TokenAccount, Transfer, transfer};

// Declare the program ID
declare_id!("7JyjS3abUPSoXoV4au3skH1sd8GA9YBQzy5UakmGziGd");

// Error Messages
#[error_code]
pub enum MyError {
    #[msg("Insufficient Funds")]
    InsufficientFunds
}

// Define the main program module
#[program]
pub mod my_solana_vault {
    use super::*;

    // Define the register function
    pub fn register(_ctx: Context<Register>) -> Result<()> {
        msg!("User registered with vault");
        Ok(())
    }

    // Define the deposit function
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        
        require!(ctx.accounts.signer.to_account_info().lamports() >= amount, MyError::InsufficientFunds); 

        // Transfer lamports from the signer to the user's vault account
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.signer.to_account_info(),
                    to: ctx.accounts.user_vault_account.to_account_info(),
                },
            ),
            amount,
        )?;

        Ok(())
    }

    // Define the withdraw function
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {

        require!(ctx.accounts.user_vault_account.to_account_info().lamports() >= amount, MyError::InsufficientFunds); 
        
        // Transfer lamports from the user's vault account to signer
        **ctx.accounts.user_vault_account.try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.signer.try_borrow_mut_lamports()? += amount;

        Ok(())
    }

    // Define a function to register a token (empty function for now)
    pub fn register_token(_ctx: Context<RegisterToken>) -> Result<()> {
        Ok(())
    }

    // Define a function to deposit tokens into the vault
    pub fn deposit_token(ctx: Context<TransferAccounts>, amount: u64) -> Result<()> {
    
        require!(ctx.accounts.sender_token_account.amount >= amount, MyError::InsufficientFunds);

        // Create a transfer instruction for the token transfer
        let transfer_instruction = Transfer {
            from: ctx.accounts.sender_token_account.to_account_info(),
            to: ctx.accounts.vault_token_account.to_account_info(),
            authority: ctx.accounts.signer.to_account_info(),
        };
    
        // Create a CPI context for the transfer
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            transfer_instruction,
        );
    
        // Perform the token transfer
        anchor_spl::token::transfer(cpi_ctx, amount)?;
    
        Ok(())
    }

    // Define a function to withdraw tokens from the vault
    pub fn withdraw_token(ctx: Context<TransferAccounts>, amount: u64) -> Result<()> {
    
        require!(ctx.accounts.vault_token_account.amount >= amount, MyError::InsufficientFunds);

        // Create a transfer instruction for the token transfer
        let transfer_instruction = Transfer {
            from: ctx.accounts.vault_token_account.to_account_info(),
            to: ctx.accounts.sender_token_account.to_account_info(),
            authority: ctx.accounts.token_account_owner_pda.to_account_info(),
        };
    
        // Get the bump seed for the PDA
        let bump = ctx.bumps.token_account_owner_pda;
        let binding = ctx.accounts.signer.key();
        let seeds = &[b"token_account_owner_pda".as_ref(), binding.as_ref(), &[bump]];
        let signer = &[&seeds[..]];
    
        // Create a CPI context with the PDA signer
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            transfer_instruction,
            signer,
        );
    
        // Perform the token transfer
        transfer(cpi_ctx, amount)?;
    
        Ok(())
    }
}

// Define the accounts structure for the register function
#[derive(Accounts)]
pub struct Register<'info> {
    #[account(init, payer = owner, seeds=[b"vault", owner.key().as_ref()], bump, space = 8)]
    /// CHECK: This is not dangerous because this is native account
    pub user_vault_account: AccountInfo<'info>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// Define the accounts structure for the deposit function
#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut, seeds=[b"vault", signer.key().as_ref()], bump)]
    /// CHECK: This is not dangerous because this is native account
    pub user_vault_account: AccountInfo<'info>,
    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// Define the accounts structure for the withdraw function
#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut, seeds=[b"vault", signer.key().as_ref()], bump)]
    /// CHECK: This is not dangerous because this is native account
    pub user_vault_account: AccountInfo<'info>,
    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// Define the accounts structure for the register token function
#[derive(Accounts)]
pub struct RegisterToken<'info> {
    // Derived PDAs
    #[account(init_if_needed, payer = owner, seeds=[b"token_account_owner_pda", owner.key().as_ref()], bump, space = 8)]
    /// CHECK: This is not dangerous because this is native account
    token_account_owner_pda: AccountInfo<'info>,

    #[account(
        init_if_needed,
        payer = owner,
        seeds=[b"token_vault", mint_of_token_being_sent.key().as_ref(), owner.key().as_ref()],
        token::mint=mint_of_token_being_sent,
        token::authority=token_account_owner_pda,
        bump
    )]
    vault_token_account: Account<'info, TokenAccount>,

    mint_of_token_being_sent: Account<'info, Mint>,

    #[account(mut)]
    owner: Signer<'info>,
    system_program: Program<'info, System>,
    token_program: Program<'info, Token>,
    rent: Sysvar<'info, Rent>,
}

// Define the accounts structure for the token transfer functions
#[derive(Accounts)]
pub struct TransferAccounts<'info> {
    // Derived PDAs
    #[account(mut, seeds=[b"token_account_owner_pda", signer.key().as_ref()], bump)]
    /// CHECK: This is not dangerous because this is native account
    token_account_owner_pda: AccountInfo<'info>,

    #[account(mut,
        seeds=[b"token_vault", mint_of_token_being_sent.key().as_ref(), signer.key().as_ref()],
        bump,
        token::mint=mint_of_token_being_sent,
        token::authority=token_account_owner_pda,
    )]
    vault_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    sender_token_account: Account<'info, TokenAccount>,

    mint_of_token_being_sent: Account<'info, Mint>,

    #[account(mut)]
    signer: Signer<'info>,
    system_program: Program<'info, System>,
    token_program: Program<'info, Token>,
    rent: Sysvar<'info, Rent>,
}