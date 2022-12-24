import {
  createMintIxs,
  executeTransaction,
  findAta,
  getProvider,
} from "@cardinal/common";
import { withInit } from "@cardinal/payment-manager/dist/cjs/transaction";
import {
  CreateMasterEditionV3,
  CreateMetadataV2,
  DataV2,
  MasterEdition,
  Metadata,
} from "@metaplex-foundation/mpl-token-metadata";
import { Wallet } from "@project-serum/anchor";
import { getAccount } from "@solana/spl-token";
import type { PublicKey } from "@solana/web3.js";
import { Keypair, LAMPORTS_PER_SOL, Transaction } from "@solana/web3.js";
import { BN } from "bn.js";
import { expect } from "chai";

import {
  withInitTransferAuthority,
  withRelease,
  withWrapToken,
} from "../../src";
import { getTokenManager } from "../../src/programs/tokenManager/accounts";
import { findTokenManagerAddress } from "../../src/programs/tokenManager/pda";
import { getTransferAuthorityByName } from "../../src/programs/transferAuthority/accounts";
import { findTransferAuthorityAddress } from "../../src/programs/transferAuthority/pda";

describe("Release wrapped token", () => {
  const transferAuthorityName = `lst-auth-${Math.random()}`;

  const lister = Keypair.generate();
  const buyer = Keypair.generate();
  const tokenMint: Keypair = Keypair.generate();
  let listerTokenAccountId: PublicKey;

  const paymentManagerName = `pm-${Math.random()}`;
  const feeCollector = Keypair.generate();
  const MAKER_FEE = new BN(500);
  const TAKER_FEE = new BN(0);

  beforeAll(async () => {
    const provider = await getProvider();

    const airdropLister = await provider.connection.requestAirdrop(
      lister.publicKey,
      LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropLister);
    const airdropBuyer = await provider.connection.requestAirdrop(
      buyer.publicKey,
      LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropBuyer);

    // create rental mint
    const transaction = new Transaction();
    const [ixs] = await createMintIxs(
      provider.connection,
      tokenMint.publicKey,
      lister.publicKey
    );
    listerTokenAccountId = await findAta(
      tokenMint.publicKey,
      lister.publicKey,
      true
    );
    transaction.instructions = ixs;
    await executeTransaction(
      provider.connection,
      transaction,
      new Wallet(lister)
    );

    const metadataId = await Metadata.getPDA(tokenMint.publicKey);
    const metadataTx = new CreateMetadataV2(
      { feePayer: lister.publicKey },
      {
        metadata: metadataId,
        metadataData: new DataV2({
          name: "test",
          symbol: "TST",
          uri: "http://test/",
          sellerFeeBasisPoints: 10,
          creators: null,
          collection: null,
          uses: null,
        }),
        updateAuthority: lister.publicKey,
        mint: tokenMint.publicKey,
        mintAuthority: lister.publicKey,
      }
    );

    const masterEditionId = await MasterEdition.getPDA(tokenMint.publicKey);
    const masterEditionTx = new CreateMasterEditionV3(
      { feePayer: lister.publicKey },
      {
        edition: masterEditionId,
        metadata: metadataId,
        updateAuthority: lister.publicKey,
        mint: tokenMint.publicKey,
        mintAuthority: lister.publicKey,
        maxSupply: new BN(1),
      }
    );
    const tx = new Transaction();
    tx.instructions = [
      ...metadataTx.instructions,
      ...masterEditionTx.instructions,
    ];
    await executeTransaction(provider.connection, tx, new Wallet(lister));

    const pmtx = new Transaction();
    await withInit(pmtx, provider.connection, provider.wallet, {
      paymentManagerName: paymentManagerName,
      feeCollectorId: feeCollector.publicKey,
      makerFeeBasisPoints: MAKER_FEE.toNumber(),
      takerFeeBasisPoints: TAKER_FEE.toNumber(),
      includeSellerFeeBasisPoints: true,
      royaltyFeeShare: new BN(0),
      payer: provider.wallet.publicKey,
    });
    await executeTransaction(provider.connection, pmtx, provider.wallet);
  });

  it("Create Transfer Authority", async () => {
    const provider = await getProvider();
    const transaction = new Transaction();

    await withInitTransferAuthority(
      transaction,
      provider.connection,
      provider.wallet,
      transferAuthorityName
    );
    await executeTransaction(provider.connection, transaction, provider.wallet);

    const checkTransferAuthority = await getTransferAuthorityByName(
      provider.connection,
      transferAuthorityName
    );

    expect(checkTransferAuthority.parsed.name).to.eq(transferAuthorityName);
    expect(checkTransferAuthority.parsed.authority.toString()).to.eq(
      provider.wallet.publicKey.toString()
    );
    expect(checkTransferAuthority.parsed.allowedMarketplaces).to.be.null;
  });

  it("Wrap Token", async () => {
    const provider = await getProvider();
    const wrapTransaction = new Transaction();
    const [transferAuthorityId] = await findTransferAuthorityAddress(
      transferAuthorityName
    );

    await withWrapToken(
      wrapTransaction,
      provider.connection,
      new Wallet(lister),
      tokenMint.publicKey,
      {
        transferAuthorityName: transferAuthorityName,
        creator: transferAuthorityId,
      }
    );
    await executeTransaction(
      provider.connection,
      wrapTransaction,
      new Wallet(lister)
    );
    const mintTokenAccountId = await findAta(
      tokenMint.publicKey,
      lister.publicKey,
      true
    );
    const mintTokenAccount = await getAccount(
      provider.connection,
      mintTokenAccountId
    );
    expect(mintTokenAccount.amount.toString()).to.equal("1");
    expect(mintTokenAccount.isFrozen).to.be.true;

    const [tokenManagerId] = await findTokenManagerAddress(tokenMint.publicKey);
    const tokenManagerData = await getTokenManager(
      provider.connection,
      tokenManagerId
    );
    expect(
      tokenManagerData.parsed.invalidators
        .map((inv) => inv.toString())
        .toString()
    ).to.eq([transferAuthorityId.toString()].toString());
  });

  it("Release token", async () => {
    const provider = await getProvider();
    const transaction = new Transaction();

    const [transferAuthorityId] = await findTransferAuthorityAddress(
      transferAuthorityName
    );

    await withRelease(
      transaction,
      provider.connection,
      new Wallet(lister),
      tokenMint.publicKey,
      transferAuthorityId,
      listerTokenAccountId
    );
    await executeTransaction(
      provider.connection,
      transaction,
      new Wallet(lister)
    );

    const mintTokenAccountId = await findAta(
      tokenMint.publicKey,
      lister.publicKey,
      true
    );
    const mintTokenAccount = await getAccount(
      provider.connection,
      mintTokenAccountId
    );
    expect(mintTokenAccount.amount.toString()).to.equal("1");
    expect(mintTokenAccount.isFrozen).to.be.false;
  });
});
