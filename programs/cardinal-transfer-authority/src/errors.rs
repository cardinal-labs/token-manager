use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid token manager for this transfer authority")]
    InvalidTokenManager,
    #[msg("Invalid lister")]
    InvalidLister,
    #[msg("Invalid payment mint")]
    InvalidPaymentMint,
    #[msg("Invalid marketplace")]
    InvalidMarketplace,
    #[msg("Invalid buyer payment token account")]
    InvalidBuyerPaymentTokenAccount,
    #[msg("Invalid buyer mint token account")]
    InvalidBuyerMintTokenAccount,
    #[msg("Invalid offer token account")]
    InvalidOfferTokenAccount,
    #[msg("Invalid payment manager")]
    InvalidPaymentManager,
    #[msg("Invalid mint")]
    InvalidMint,
    #[msg("Invalid fee collector")]
    InvalidFeeCollector,
    #[msg("Invalid lister payment token account")]
    InvalidListerPaymentTokenAccount,
    #[msg("Invalid lister mint token account")]
    InvalidListerMintTokenAccount,
}
