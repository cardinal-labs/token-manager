import { createMintIxs, executeTransaction, findAta } from "@cardinal/common";
import { init } from "@cardinal/payment-manager/dist/cjs/instruction";
import { findPaymentManagerAddress } from "@cardinal/payment-manager/dist/cjs/pda";
import {
  CreateMasterEditionV3,
  CreateMetadataV2,
  DataV2,
  MasterEdition,
  Metadata,
} from "@metaplex-foundation/mpl-token-metadata";
import { Wallet } from "@project-serum/anchor";
import { getAccount } from "@solana/spl-token";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import { BN } from "bn.js";
import { expect } from "chai";

import {
  withAcceptListing,
  withCreateListing,
  withInitMarketplace,
  withInitTransferAuthority,
  withWhitelistMarektplaces,
  withWrapToken,
} from "../../src";
import { findTokenManagerAddress } from "../../src/programs/tokenManager/pda";
import {
  getListing,
  getMarketplaceByName,
  getTransferAuthorityByName,
} from "../../src/programs/transferAuthority/accounts";
import { findMarketplaceAddress } from "../../src/programs/transferAuthority/pda";
import { getProvider } from "../workspace";

describe("Allowed markeptlaces for transfer authority", () => {
  const transferAuthorityName = `lst-auth-${Math.random()}`;
  const marketplaceName = `mrkt-${Math.random()}`;

  const lister = Keypair.generate();
  const buyer = Keypair.generate();

  const rentalMint: Keypair = Keypair.generate();
  const rentalPaymentAmount = new BN(100);

  const paymentManagerName = `pm-${Math.random()}`;
  const feeCollector = Keypair.generate();
  const MAKER_FEE = new BN(500);
  const TAKER_FEE = new BN(0);
  const BASIS_POINTS_DIVISOR = new BN(10000);

  before(async () => {
    const provider = getProvider();

    const feeCollectorInfo = await provider.connection.requestAirdrop(
      feeCollector.publicKey,
      LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(feeCollectorInfo);
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
      rentalMint.publicKey,
      lister.publicKey
    );
    transaction.instructions = ixs;
    await executeTransaction(
      provider.connection,
      transaction,
      new Wallet(lister)
    );

    const metadataId = await Metadata.getPDA(rentalMint.publicKey);
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
        mint: rentalMint.publicKey,
        mintAuthority: lister.publicKey,
      }
    );

    const masterEditionId = await MasterEdition.getPDA(rentalMint.publicKey);
    const masterEditionTx = new CreateMasterEditionV3(
      { feePayer: lister.publicKey },
      {
        edition: masterEditionId,
        metadata: metadataId,
        updateAuthority: lister.publicKey,
        mint: rentalMint.publicKey,
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

    const [paymentManagerId] = await findPaymentManagerAddress(
      paymentManagerName
    );
    const ix = init(provider.connection, provider.wallet, paymentManagerName, {
      paymentManagerId: paymentManagerId,
      feeCollector: feeCollector.publicKey,
      makerFeeBasisPoints: MAKER_FEE.toNumber(),
      takerFeeBasisPoints: TAKER_FEE.toNumber(),
      includeSellerFeeBasisPoints: true,
      authority: provider.wallet.publicKey,
      payer: provider.wallet.publicKey,
    });
    const pmtx = new Transaction();
    pmtx.add(ix);
    await executeTransaction(provider.connection, pmtx, provider.wallet);
  });

  it("Create Transfer Authority", async () => {
    const provider = getProvider();
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
    const provider = getProvider();
    const wrapTransaction = new Transaction();

    await withWrapToken(
      wrapTransaction,
      provider.connection,
      new Wallet(lister),
      rentalMint.publicKey,
      { transferAuthorityName: transferAuthorityName }
    );
    await executeTransaction(
      provider.connection,
      wrapTransaction,
      new Wallet(lister)
    );
    const mintTokenAccountId = await findAta(
      rentalMint.publicKey,
      lister.publicKey,
      true
    );
    const mintTokenAccount = await getAccount(
      provider.connection,
      mintTokenAccountId
    );
    expect(mintTokenAccount.amount.toString()).to.equal("1");
    expect(mintTokenAccount.isFrozen).to.be.true;
  });

  it("Create Marketplace", async () => {
    const provider = getProvider();
    const transaction = new Transaction();

    await withInitMarketplace(
      transaction,
      provider.connection,
      provider.wallet,
      marketplaceName,
      paymentManagerName
    );
    await executeTransaction(provider.connection, transaction, provider.wallet);

    const checkMarketplace = await getMarketplaceByName(
      provider.connection,
      marketplaceName
    );

    expect(checkMarketplace.parsed.name).to.eq(marketplaceName);
    const [paymentManagerId] = await findPaymentManagerAddress(
      paymentManagerName
    );
    expect(checkMarketplace.parsed.paymentManager.toString()).to.eq(
      paymentManagerId.toString()
    );
    expect(checkMarketplace.parsed.authority.toString()).to.eq(
      provider.wallet.publicKey.toString()
    );
  });

  it("Whitelist random marketplace", async () => {
    const provider = getProvider();
    const transaction = new Transaction();

    await withWhitelistMarektplaces(
      transaction,
      provider.connection,
      provider.wallet,
      transferAuthorityName,
      ["some-random-name"]
    );
    await executeTransaction(provider.connection, transaction, provider.wallet);

    const checkTransferAuthority = await getTransferAuthorityByName(
      provider.connection,
      transferAuthorityName
    );
    const [marketplaceId] = await findMarketplaceAddress("some-random-name");
    expect(checkTransferAuthority.parsed.allowedMarketplaces).to.be.eql([
      marketplaceId,
    ]);
  });

  it("Fail to Create Listing", async () => {
    const provider = getProvider();
    const transaction = new Transaction();

    await withCreateListing(
      transaction,
      provider.connection,
      new Wallet(lister),
      rentalMint.publicKey,
      marketplaceName,
      rentalPaymentAmount
    );
    expect(
      executeTransaction(provider.connection, transaction, provider.wallet)
    ).to.throw();
  });

  it("Whitelist proper marketplace", async () => {
    const provider = getProvider();
    const transaction = new Transaction();

    await withWhitelistMarektplaces(
      transaction,
      provider.connection,
      provider.wallet,
      transferAuthorityName,
      [marketplaceName, "some-random-name"]
    );
    await executeTransaction(provider.connection, transaction, provider.wallet);

    const checkTransferAuthority = await getTransferAuthorityByName(
      provider.connection,
      transferAuthorityName
    );
    const [randomMarketplaceId] = await findMarketplaceAddress(
      "some-random-name"
    );
    const [marketplaceId] = await findMarketplaceAddress(marketplaceName);

    const marketplaces = (
      checkTransferAuthority.parsed.allowedMarketplaces as PublicKey[]
    ).map((m) => m.toString());
    expect(marketplaces).to.include(marketplaceId.toString());
    expect(marketplaces).to.include(randomMarketplaceId.toString());
  });

  it("Create Listing", async () => {
    const provider = getProvider();
    const transaction = new Transaction();

    await withCreateListing(
      transaction,
      provider.connection,
      new Wallet(lister),
      rentalMint.publicKey,
      marketplaceName,
      rentalPaymentAmount
    );
    await executeTransaction(
      provider.connection,
      transaction,
      new Wallet(lister)
    );

    const checkListing = await getListing(
      provider.connection,
      rentalMint.publicKey
    );

    expect(checkListing.parsed.lister.toString()).to.eq(
      lister.publicKey.toString()
    );
    const [tokenManagerId] = await findTokenManagerAddress(
      rentalMint.publicKey
    );
    expect(checkListing.parsed.tokenManager.toString()).to.eq(
      tokenManagerId.toString()
    );
    const [marketplaceId] = await findMarketplaceAddress(marketplaceName);
    expect(checkListing.parsed.marketplace.toString()).to.eq(
      marketplaceId.toString()
    );
    expect(checkListing.parsed.paymentAmount.toNumber()).to.eq(
      rentalPaymentAmount.toNumber()
    );
    expect(checkListing.parsed.paymentMint.toString()).to.eq(
      PublicKey.default.toString()
    );
  });

  it("Accept Listing", async () => {
    const provider = getProvider();
    const transaction = new Transaction();
    const checkListing = await getListing(
      provider.connection,
      rentalMint.publicKey
    );
    const listingInfo = await provider.connection.getAccountInfo(
      checkListing.pubkey
    );

    const beforeListerAmount =
      (await provider.connection.getAccountInfo(lister.publicKey))?.lamports ||
      0;
    const beforeFeeCollectorAmount =
      (await provider.connection.getAccountInfo(feeCollector.publicKey))
        ?.lamports || 0;

    await withAcceptListing(
      transaction,
      provider.connection,
      new Wallet(buyer),
      buyer.publicKey,
      rentalMint.publicKey,
      checkListing.parsed.paymentAmount,
      checkListing.parsed.paymentMint
    );
    await executeTransaction(
      provider.connection,
      transaction,
      new Wallet(buyer)
    );

    const buyerMintTokenAccountId = await findAta(
      rentalMint.publicKey,
      buyer.publicKey,
      true
    );
    const buyerRentalMintTokenAccount = await getAccount(
      provider.connection,
      buyerMintTokenAccountId
    );
    expect(buyerRentalMintTokenAccount.amount.toString()).to.eq("1");
    expect(buyerRentalMintTokenAccount.isFrozen).to.be.true;

    const makerFee = rentalPaymentAmount
      .mul(MAKER_FEE)
      .div(BASIS_POINTS_DIVISOR);
    const takerFee = rentalPaymentAmount
      .mul(TAKER_FEE)
      .div(BASIS_POINTS_DIVISOR);
    const totalFees = makerFee.add(takerFee);

    const listerInfo = await provider.connection.getAccountInfo(
      lister.publicKey
    );
    expect(listerInfo?.lamports).to.eq(
      beforeListerAmount +
        rentalPaymentAmount.sub(makerFee).toNumber() +
        (listingInfo?.lamports || 0)
    );

    const feeCollectorInfo = await provider.connection.getAccountInfo(
      feeCollector.publicKey
    );
    expect(feeCollectorInfo?.lamports).to.eq(
      beforeFeeCollectorAmount + totalFees.toNumber()
    );
  });
});
