import { Providers } from "@arkecosystem/core-kernel";

import { database } from "./database";
import { startListeners } from "./listener";
import { startServer } from "./server";

export class ServiceProvider extends Providers.ServiceProvider {
    public async register(): Promise<void> {
        if (!this.config().get("enabled")) {
            this.app.log.info("Webhooks are disabled");
            return;
        }

        database.make();

        startListeners();

        this.app.bind("webhooks").toConstantValue(await startServer(this.config().get("server")));
        this.app.bind("webhooks.options").toConstantValue(this.config().all());
    }

    public async dispose(): Promise<void> {
        if (this.config().get("enabled")) {
            this.app.log.info("Stopping Webhook API");

            await this.app.get<any>("webhooks").stop();
        }
    }
}
