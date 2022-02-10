pub mod instructions;
pub mod state;
pub mod errors;

use {anchor_lang::prelude::*, instructions::*};

declare_id!("mgrMbgLbusR19KEKMa9WsYDAeL94Tavgc9JHRB1CCGz");

#[program]
pub mod cardinal_token_manager {
    use super::*;

    pub fn init(ctx: Context<InitCtx>, bump: u8,mint: Pubkey, num_invalidators: u8) -> ProgramResult {
        init::handler(ctx, bump, mint, num_invalidators)
    }

    pub fn uninit(ctx: Context<UninitCtx>) -> ProgramResult {
        uninit::handler(ctx)
    }

    pub fn init_mint_counter(ctx: Context<InitMintCounterCtx>, bump: u8, mint: Pubkey) -> ProgramResult {
        init_mint_counter::handler(ctx, bump, mint)
    }

    pub fn set_payment_mint(ctx: Context<SetPaymentMintCtx>, payment_mint: Pubkey) -> ProgramResult {
        set_payment_mint::handler(ctx, payment_mint)
    }

    pub fn set_claim_approver(ctx: Context<SetClaimApproverCtx>, claim_approver: Pubkey) -> ProgramResult {
        set_claim_approver::handler(ctx, claim_approver)
    }

    pub fn set_transfer_authority(ctx: Context<SetTransferAuthorityCtx>, transfer_authority: Pubkey) -> ProgramResult {
        set_transfer_authority::handler(ctx, transfer_authority)
    }

    pub fn add_invalidator(ctx: Context<AddInvalidatorCtx>, invalidator: Pubkey) -> ProgramResult {
        add_invalidator::handler(ctx, invalidator)
    }

    pub fn create_claim_receipt(ctx: Context<CreateClaimReceiptCtx>, bump: u8, target: Pubkey) -> ProgramResult {
        create_claim_receipt::handler(ctx, bump, target)
    }

    pub fn create_transfer_receipt(ctx: Context<CreateTransferReceiptCtx>, bump: u8, target: Pubkey) -> ProgramResult {
        create_transfer_receipt::handler(ctx, bump, target)
    }

    pub fn issue(ctx: Context<IssueCtx>, ix: IssueIx) -> ProgramResult {
        issue::handler(ctx, ix)
    }

    pub fn unissue(ctx: Context<UnissueCtx>) -> ProgramResult {
        unissue::handler(ctx)
    }

    pub fn claim<'key, 'accounts, 'remaining, 'info>(ctx: Context<'key, 'accounts, 'remaining, 'info, ClaimCtx<'info>>) -> ProgramResult {
        claim::handler(ctx)
    }

    pub fn invalidate<'key, 'accounts, 'remaining, 'info>(ctx: Context<'key, 'accounts, 'remaining, 'info, InvalidateCtx<'info>>) -> ProgramResult {
        invalidate::handler(ctx)
    }

    pub fn create_mint_manager(ctx: Context<CreateMintManagerCtx>, bump: u8) -> ProgramResult {
        create_mint_manager::handler(ctx, bump)
    }

    pub fn close_mint_manager(ctx: Context<CloseMintManagerCtx>) -> ProgramResult {
        close_mint_manager::handler(ctx)
    }
}