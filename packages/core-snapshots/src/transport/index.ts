import { Container, Contracts, Utils } from "@arkecosystem/core-kernel";
import { Managers } from "@arkecosystem/crypto";
import fs from "fs-extra";
import msgpack from "msgpack-lite";
import QueryStream from "pg-query-stream";
import zlib from "zlib";

import JSONStream from "JSONStream";

import * as utils from "../utils";
import { Codec } from "./codec";
import { canImportRecord, verifyData } from "./verification";

const fixData = (table, data) => {
    if (table === "blocks" && data.height === 1) {
        data.id = Managers.configManager.get("genesisBlock").id;
    }

    // For version=1 transactions the nonce is set automatically at database level (by a trigger
    // on the transactions table). However, the database library we use is upset if we don't
    // provide it, so supply a dummy value here.
    if (table === "transactions" && data.version === 1) {
        data.nonce = "0";
    }
};

export const exportTable = async (app: Contracts.Kernel.Application, table, options) => {
    const snapFileName = utils.getFilePath(table, options.meta.folder);
    const gzip = zlib.createGzip();
    await fs.ensureFile(snapFileName);

    app.log.info(
        `Starting to export table ${table} to folder ${
            options.meta.folder
        }, append:${!!options.blocks}, skipCompression: ${options.meta.skipCompression}`,
    );
    try {
        const snapshotWriteStream = fs.createWriteStream(snapFileName, options.blocks ? { flags: "a" } : {});
        const encodeStream = msgpack.createEncodeStream({ codec: Codec[table] });
        const qs = new QueryStream(options.queries[table]);

        const data = await options.database.db.stream(qs, s => {
            if (options.meta.skipCompression) {
                return s.pipe(encodeStream).pipe(snapshotWriteStream);
            }

            return s
                .pipe(encodeStream)
                .pipe(gzip)
                .pipe(snapshotWriteStream);
        });
        app.log.info(
            `Snapshot: ${table} done. ==> Total rows processed: ${data.processed}, duration: ${data.duration} ms`,
        );

        return {
            count: utils.calcRecordCount(app, table, data.processed, options.blocks),
            startHeight: utils.calcStartHeight(app, table, options.meta.startHeight, options.blocks),
            endHeight: options.meta.endHeight,
        };
    } catch (error) {
        app.terminate("Error while exporting data via query stream", error);
        return undefined;
    }
};

export const importTable = async (app: Contracts.Kernel.Application, table, options) => {
    const emitter = app.get<Contracts.Kernel.Events.EventDispatcher>(Container.Identifiers.EventDispatcherService);

    const sourceFile = utils.getFilePath(table, options.meta.folder);
    const gunzip = zlib.createGunzip();
    const decodeStream = msgpack.createDecodeStream({ codec: Codec[table] });
    app.log.info(
        `Starting to import table ${table} from ${sourceFile}, skipCompression: ${options.meta.skipCompression}`,
    );

    const readStream = options.meta.skipCompression
        ? fs.createReadStream(sourceFile).pipe(decodeStream)
        : fs
              .createReadStream(sourceFile)
              .pipe(gunzip)
              .pipe(decodeStream);

    let values: any[] = [];
    let prevData;
    let counter = 0;
    const saveData = async data => {
        if (data && data.length > 0) {
            const insert = options.database.pgp.helpers.insert(data, options.database.getColumnSet(table));
            emitter.dispatch("progress", { value: counter, table });
            values = [];
            return options.database.db.none(insert);
        }
    };

    emitter.dispatch("start", { count: options.meta[table].count });

    for await (const record of readStream) {
        counter++;

        fixData(table, record);

        if (!verifyData(app, table, record, prevData, options.verifySignatures)) {
            app.terminate(`Error verifying data. Payload ${JSON.stringify(record, undefined, 2)}`);
        }

        if (canImportRecord(table, record, options)) {
            values.push(record);
        }

        if (values.length % options.chunkSize === 0) {
            await saveData(values);
        }
        prevData = record;
    }

    if (values.length > 0) {
        await saveData(values);
    }

    emitter.dispatch("complete");
};

export const verifyTable = async (app: Contracts.Kernel.Application, table, options) => {
    const sourceFile = utils.getFilePath(table, options.meta.folder);
    const gunzip = zlib.createGunzip();
    const decodeStream = msgpack.createDecodeStream({ codec: Codec[table] });
    const readStream = options.meta.skipCompression
        ? fs.createReadStream(sourceFile).pipe(decodeStream)
        : fs
              .createReadStream(sourceFile)
              .pipe(gunzip)
              .pipe(decodeStream);

    app.log.info(`Starting to verify snapshot file ${sourceFile}`);
    let prevData;

    decodeStream.on("data", data => {
        fixData(table, data);
        if (!verifyData(app, table, data, prevData, options.verifySignatures)) {
            app.terminate(`Error verifying data. Payload ${JSON.stringify(data, undefined, 2)}`);
        }
        prevData = data;
    });

    readStream.on("finish", () => {
        app.log.info(`Snapshot file ${sourceFile} successfully verified`);
    });
};

export const backupTransactionsToJSON = async (app: Contracts.Kernel.Application, snapFileName, query, database) => {
    const transactionBackupPath = utils.getFilePath(snapFileName, "rollbackTransactions");
    await fs.ensureFile(transactionBackupPath);
    const snapshotWriteStream = fs.createWriteStream(transactionBackupPath);
    const qs = new QueryStream(query);

    try {
        const data = await database.db.stream(qs, s => s.pipe(JSONStream.stringify()).pipe(snapshotWriteStream));
        app.log.info(
            `${Utils.pluralize(
                "transaction",
                data.processed,
                true,
            )} from rollbacked blocks safely exported to file ${snapFileName}`,
        );
        return data;
    } catch (error) {
        app.terminate("Error while exporting data via query stream", error);
    }
};
