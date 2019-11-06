import Hapi from "@hapi/hapi";

import { NodeController } from "./controller";
import * as Schema from "./schema";

export const registerRoutes = (server: Hapi.Server): void => {
    const controller = server.app.app.resolve(NodeController);
    server.bind(controller);

    server.route({
        method: "GET",
        path: "/node/status",
        handler: controller.status,
    });

    server.route({
        method: "GET",
        path: "/node/syncing",
        handler: controller.syncing,
    });

    server.route({
        method: "GET",
        path: "/node/configuration",
        handler: controller.configuration,
    });

    server.route({
        method: "GET",
        path: "/node/configuration/crypto",
        handler: controller.configurationCrypto,
    });

    server.route({
        method: "GET",
        path: "/node/fees",
        handler: controller.fees,
        options: {
            validate: Schema.fees,
        },
    });

    // if (app.network() === "testnet" || process.env.CORE_API_DEBUG_ENDPOINT_ENABLED) {
    //     server.route({
    //         method: "GET",
    //         path: "/node/debug",
    //         handler: controller.debug,
    //         options: {
    //             validate: Schema.debug,
    //         },
    //     });
    // }
};
