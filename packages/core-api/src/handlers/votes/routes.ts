import Hapi from "@hapi/hapi";

import { VotesController } from "./controller";
import * as Schema from "./schema";

export const registerRoutes = (server: Hapi.Server): void => {
    const controller = server.app.app.resolve(VotesController);
    server.bind(controller);

    server.route({
        method: "GET",
        path: "/votes",
        handler: controller.index,
        options: {
            validate: Schema.index,
        },
    });

    server.route({
        method: "GET",
        path: "/votes/{id}",
        handler: controller.show,
        options: {
            validate: Schema.show,
        },
    });
};
