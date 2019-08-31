import { app, Container, Contracts } from "@arkecosystem/core-kernel";
import { flags } from "@oclif/command";

import { setUpLite } from "../../helpers/replay";
import { CommandFlags } from "../../types";
import { BaseCommand } from "../command";

export class ReplayCommand extends BaseCommand {
    public static description = "replay the blockchain from the local database";

    public static flags: CommandFlags = {
        ...BaseCommand.flagsNetwork,
        targetHeight: flags.integer({
            description: "the target height to replay to. If not set, defaults to last block in database.",
            default: -1,
        }),
        suffix: flags.string({
            hidden: true,
            default: "replay",
        }),
    };

    public async run(): Promise<void> {
        const { flags } = await this.parseWithNetwork(ReplayCommand);

        await setUpLite(flags);

        if (!app.isBound(Container.Identifiers.BlockchainService)) {
            this.error("The @arkecosystem/core-blockchain plugin is not installed.");
        }

        await app
            .get<Contracts.Blockchain.Blockchain>(Container.Identifiers.BlockchainService)
            .replay(flags.targetHeight);
    }
}
