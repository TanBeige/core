import { Container, Contracts, Utils } from "@arkecosystem/core-kernel";
import { Interfaces, Transactions } from "@arkecosystem/crypto";

import { NotSupportedForMultiSignatureWalletError, SecondSignatureAlreadyRegisteredError } from "../errors";
import { TransactionReader } from "../transaction-reader";
import { TransactionHandler, TransactionHandlerConstructor } from "./transaction";

// todo: revisit the implementation, container usage and arguments after core-database rework
// todo: replace unnecessary function arguments with dependency injection to avoid passing around references
@Container.injectable()
export class SecondSignatureTransactionHandler extends TransactionHandler {
    public getConstructor(): Transactions.TransactionConstructor {
        return Transactions.SecondSignatureRegistrationTransaction;
    }

    public dependencies(): ReadonlyArray<TransactionHandlerConstructor> {
        return [];
    }

    public walletAttributes(): ReadonlyArray<string> {
        return ["secondPublicKey"];
    }

    public async bootstrap(
        connection: Contracts.Database.Connection,
        walletRepository: Contracts.State.WalletRepository,
    ): Promise<void> {
        const reader: TransactionReader = await TransactionReader.create(connection, this.getConstructor());

        while (reader.hasNext()) {
            const transactions = await reader.read();

            for (const transaction of transactions) {
                const wallet: Contracts.State.Wallet = walletRepository.findByPublicKey(
                    Utils.assert.defined(transaction.senderPublicKey),
                );

                const asset: { signature: { publicKey: string } } = Utils.assert.defined(transaction.asset);

                wallet.setAttribute("secondPublicKey", Utils.assert.defined(asset.signature.publicKey));
            }
        }
    }

    public async isActivated(): Promise<boolean> {
        return true;
    }

    public async throwIfCannotBeApplied(
        transaction: Interfaces.ITransaction,
        wallet: Contracts.State.Wallet,
        databaseWalletRepository: Contracts.State.WalletRepository,
    ): Promise<void> {
        if (wallet.hasSecondSignature()) {
            throw new SecondSignatureAlreadyRegisteredError();
        }

        const senderWallet: Contracts.State.Wallet = databaseWalletRepository.findByPublicKey(
            Utils.assert.defined(transaction.data.senderPublicKey),
        );

        if (senderWallet.hasMultiSignature()) {
            throw new NotSupportedForMultiSignatureWalletError();
        }

        return super.throwIfCannotBeApplied(transaction, wallet, databaseWalletRepository);
    }

    public async canEnterTransactionPool(
        data: Interfaces.ITransactionData,
        pool: Contracts.TransactionPool.Connection,
        processor: Contracts.TransactionPool.Processor,
    ): Promise<boolean> {
        if (await this.typeFromSenderAlreadyInPool(data, pool, processor)) {
            return false;
        }

        return true;
    }

    public async applyToSender(
        transaction: Interfaces.ITransaction,
        walletRepository: Contracts.State.WalletRepository,
    ): Promise<void> {
        await super.applyToSender(transaction, walletRepository);

        const senderWallet: Contracts.State.Wallet = walletRepository.findByPublicKey(
            Utils.assert.defined(transaction.data.senderPublicKey),
        );

        const asset: { signature: { publicKey: string } } = Utils.assert.defined(transaction.data.asset);

        senderWallet.setAttribute("secondPublicKey", Utils.assert.defined(asset.signature.publicKey));
    }

    public async revertForSender(
        transaction: Interfaces.ITransaction,
        walletRepository: Contracts.State.WalletRepository,
    ): Promise<void> {
        await super.revertForSender(transaction, walletRepository);

        walletRepository
            .findByPublicKey(Utils.assert.defined(transaction.data.senderPublicKey))
            .forgetAttribute("secondPublicKey");
    }

    public async applyToRecipient(
        transaction: Interfaces.ITransaction,
        walletRepository: Contracts.State.WalletRepository,
    ): Promise<void> {}

    public async revertForRecipient(
        transaction: Interfaces.ITransaction,
        walletRepository: Contracts.State.WalletRepository,
    ): Promise<void> {}
}
