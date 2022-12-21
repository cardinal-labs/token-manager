import type { AccountData } from "@cardinal/common";
import { withFindOrInitAssociatedTokenAccount } from "@cardinal/common";
import {
  Edition,
  MetadataProgram,
} from "@metaplex-foundation/mpl-token-metadata";
import type { Wallet } from "@project-serum/anchor/dist/cjs/provider";
import { getAccount } from "@solana/spl-token";
import type {
  AccountMeta,
  Connection,
  PublicKey,
  Transaction,
} from "@solana/web3.js";

import type { TokenManagerData } from ".";
import { InvalidationType, TokenManagerKind, TokenManagerState } from ".";
import { findMintManagerId, findTransferReceiptId } from "./pda";

export const getRemainingAccountsForKind = async (
  mintId: PublicKey,
  tokenManagerKind: TokenManagerKind
): Promise<AccountMeta[]> => {
  if (
    tokenManagerKind === TokenManagerKind.Managed ||
    tokenManagerKind === TokenManagerKind.Permissioned
  ) {
    const [mintManagerId] = await findMintManagerId(mintId);
    return [
      {
        pubkey: mintManagerId,
        isSigner: false,
        isWritable: true,
      },
    ];
  } else if (tokenManagerKind === TokenManagerKind.Edition) {
    const editionId = await Edition.getPDA(mintId);
    return [
      {
        pubkey: editionId,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: MetadataProgram.PUBKEY,
        isSigner: false,
        isWritable: false,
      },
    ];
  } else {
    return [];
  }
};

export const withRemainingAccountsForReturn = async (
  transaction: Transaction,
  connection: Connection,
  wallet: Wallet,
  tokenManagerData: AccountData<TokenManagerData>,
  allowOwnerOffCurve = true
): Promise<AccountMeta[]> => {
  const { issuer, mint, claimApprover, invalidationType, receiptMint, state } =
    tokenManagerData.parsed;
  if (
    invalidationType === InvalidationType.Vest &&
    state === TokenManagerState.Issued
  ) {
    if (!claimApprover) throw "Claim approver must be set";
    const claimApproverTokenAccountId =
      await withFindOrInitAssociatedTokenAccount(
        transaction,
        connection,
        mint,
        claimApprover,
        wallet.publicKey,
        allowOwnerOffCurve
      );
    return [
      {
        pubkey: claimApproverTokenAccountId,
        isSigner: false,
        isWritable: true,
      },
    ];
  } else if (
    invalidationType === InvalidationType.Return ||
    state === TokenManagerState.Issued
  ) {
    if (receiptMint) {
      const receiptMintLargestAccount =
        await connection.getTokenLargestAccounts(receiptMint);

      // get holder of receipt mint
      const receiptTokenAccountId = receiptMintLargestAccount.value[0]?.address;
      if (!receiptTokenAccountId) throw new Error("No token accounts found");
      const receiptTokenAccount = await getAccount(
        connection,
        receiptTokenAccountId
      );

      // get ATA for this mint of receipt mint holder
      const returnTokenAccountId = await withFindOrInitAssociatedTokenAccount(
        transaction,
        connection,
        mint,
        receiptTokenAccount.owner,
        wallet.publicKey,
        allowOwnerOffCurve
      );
      return [
        {
          pubkey: returnTokenAccountId,
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: receiptTokenAccountId,
          isSigner: false,
          isWritable: true,
        },
      ];
    } else {
      const issuerTokenAccountId = await withFindOrInitAssociatedTokenAccount(
        transaction,
        connection,
        mint,
        issuer,
        wallet.publicKey,
        allowOwnerOffCurve
      );
      return [
        {
          pubkey: issuerTokenAccountId,
          isSigner: false,
          isWritable: true,
        },
      ];
    }
  } else {
    return [];
  }
};

export const getRemainingAccountsForTransfer = async (
  transferAuthority: PublicKey | null,
  tokenManagerId: PublicKey
): Promise<AccountMeta[]> => {
  if (transferAuthority) {
    const [transferReceiptId] = await findTransferReceiptId(tokenManagerId);
    return [
      {
        pubkey: transferReceiptId,
        isSigner: false,
        isWritable: true,
      },
    ];
  } else {
    return [];
  }
};
