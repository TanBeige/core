import "@packages/core-test-framework/src/matchers";

import { Contracts } from "@arkecosystem/core-kernel";
import { Identities } from "@arkecosystem/crypto";
import { generateMnemonic } from "bip39";

import { snoozeForBlock, TransactionFactory } from "@packages/core-test-framework/src/utils";
import secrets from "@packages/core-test-framework/src/internal/secrets.json";
import * as support from "./__support__";

const { passphrase } = support.passphrases;

let app: Contracts.Kernel.Application;
beforeAll(async () => (app = await support.setUp()));
afterAll(async () => await support.tearDown());

describe("Transaction Forging - Business registration", () => {
    describe("Signed with 1 Passphrase", () => {
        it("should broadcast, accept and forge it [Signed with 1 Passphrase]", async () => {
            // Initial Funds
            const initialFunds = TransactionFactory.init(app)
                .transfer(Identities.Address.fromPassphrase(passphrase), 50 * 1e8)
                .withPassphrase(secrets[0])
                .createOne();

            await expect(initialFunds).toBeAccepted();
            await snoozeForBlock(1);
            await expect(initialFunds.id).toBeForged();

            // Registering a business
            const businessRegistration = TransactionFactory.init(app)
                .businessRegistration({
                    name: "ark",
                    website: "ark.io",
                })
                .withPassphrase(passphrase)
                .createOne();

            await expect(businessRegistration).toBeAccepted();
            await snoozeForBlock(1);
            await expect(businessRegistration.id).toBeForged();
        });

        it("should be rejected, because wallet is already a business [Signed with 1 Passphrase]", async () => {
            // Registering a business again
            const businessRegistration = TransactionFactory.init(app)
                .businessRegistration({
                    name: "ark",
                    website: "ark.io",
                })
                .withPassphrase(passphrase)
                .createOne();

            await expect(businessRegistration).toBeRejected();
            await snoozeForBlock(1);
            await expect(businessRegistration.id).not.toBeForged();
        });
    });

    describe("Signed with 2 Passphrases", () => {
        // Prepare a fresh wallet for the tests
        const passphrase = generateMnemonic();
        const secondPassphrase = generateMnemonic();

        it("should broadcast, accept and forge it [Signed with 2 Passphrases]", async () => {
            // Initial Funds
            const initialFunds = TransactionFactory.init(app)
                .transfer(Identities.Address.fromPassphrase(passphrase), 150 * 1e8)
                .withPassphrase(secrets[0])
                .createOne();

            await expect(initialFunds).toBeAccepted();
            await snoozeForBlock(1);
            await expect(initialFunds.id).toBeForged();

            // Register a second passphrase
            const secondSignature = TransactionFactory.init(app)
                .secondSignature(secondPassphrase)
                .withPassphrase(passphrase)
                .createOne();

            await expect(secondSignature).toBeAccepted();
            await snoozeForBlock(1);
            await expect(secondSignature.id).toBeForged();

            // Registering a business
            const businessRegistration = TransactionFactory.init(app)
                .businessRegistration({
                    name: "ark",
                    website: "ark.io",
                })
                .withPassphrase(passphrase)
                .withSecondPassphrase(secondPassphrase)
                .createOne();

            await expect(businessRegistration).toBeAccepted();
            await snoozeForBlock(1);
            await expect(businessRegistration.id).toBeForged();
        });

        it("should be rejected, because wallet is already a business [Signed with 2 Passphrases]", async () => {
            // Registering a business again
            const businessRegistration = TransactionFactory.init(app)
                .businessRegistration({
                    name: "ark",
                    website: "ark.io",
                })
                .withPassphrase(passphrase)
                .withSecondPassphrase(secondPassphrase)
                .createOne();

            await expect(businessRegistration).toBeRejected();
            await snoozeForBlock(1);
            await expect(businessRegistration.id).not.toBeForged();
        });
    });

    describe("Signed with multi signature [3 of 5]", () => {
        // Multi signature wallet data
        const passphrase = generateMnemonic();
        const registerPassphrases = [passphrase, secrets[1], secrets[2], secrets[3], secrets[4]];
        const signPassphrases = [passphrase, secrets[1], secrets[2]];
        const participants = [
            Identities.PublicKey.fromPassphrase(registerPassphrases[0]),
            Identities.PublicKey.fromPassphrase(registerPassphrases[1]),
            Identities.PublicKey.fromPassphrase(registerPassphrases[2]),
            Identities.PublicKey.fromPassphrase(registerPassphrases[3]),
            Identities.PublicKey.fromPassphrase(registerPassphrases[4]),
        ];
        let multiSigAddress;
        let multiSigPublicKey;
        it("should broadcast, accept and forge it [3 of 5]", async () => {
            // Initial Funds
            const initialFunds = TransactionFactory.init(app)
                .transfer(Identities.Address.fromPassphrase(passphrase), 50 * 1e8)
                .withPassphrase(secrets[0])
                .createOne();

            await expect(initialFunds).toBeAccepted();
            await snoozeForBlock(1);
            await expect(initialFunds.id).toBeForged();

            // Registering a multi-signature wallet
            const multiSignature = TransactionFactory.init(app)
                .multiSignature(participants, 3)
                .withPassphrase(passphrase)
                .withPassphraseList(registerPassphrases)
                .createOne();

            await expect(multiSignature).toBeAccepted();
            await snoozeForBlock(1);
            await expect(multiSignature.id).toBeForged();

            // Send funds to multi signature wallet
            multiSigAddress = Identities.Address.fromMultiSignatureAsset(multiSignature.asset.multiSignature);
            multiSigPublicKey = Identities.PublicKey.fromMultiSignatureAsset(multiSignature.asset.multiSignature);

            const multiSignatureFunds = TransactionFactory.init(app)
                .transfer(multiSigAddress, 100 * 1e8)
                .withPassphrase(secrets[0])
                .createOne();

            await expect(multiSignatureFunds).toBeAccepted();
            await snoozeForBlock(1);
            await expect(multiSignatureFunds.id).toBeForged();

            // Registering a business
            const businessRegistration = TransactionFactory.init(app)
                .businessRegistration({
                    name: "ark",
                    website: "ark.io",
                })
                .withSenderPublicKey(multiSigPublicKey)
                .withPassphraseList(signPassphrases)
                .createOne();

            await expect(businessRegistration).toBeAccepted();
            await snoozeForBlock(1);
            await expect(businessRegistration.id).toBeForged();
        });

        it("should be rejected, because wallet is already a business [3 of 5]", async () => {
            // Registering a business again
            const businessRegistration = TransactionFactory.init(app)
                .businessRegistration({
                    name: "ark",
                    website: "ark.io",
                })
                .withSenderPublicKey(multiSigPublicKey)
                .withPassphraseList(signPassphrases)
                .createOne();

            await expect(businessRegistration).toBeRejected();
            await snoozeForBlock(1);
            await expect(businessRegistration.id).not.toBeForged();
        });
    });
});
