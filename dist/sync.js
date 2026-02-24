"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.insertBatch = insertBatch;
exports.fullReindex = fullReindex;
exports.realtimeSync = realtimeSync;
const mongodb_1 = require("mongodb");
const dotenv = __importStar(require("dotenv"));
const anonymizer_1 = require("./anonymizer");
dotenv.config();
async function insertBatch(collection, batch) {
    if (batch.length === 0)
        return;
    try {
        await collection.bulkWrite(batch.map((doc) => ({
            replaceOne: {
                filter: { _id: doc._id },
                replacement: doc,
                upsert: true,
            },
        })));
        console.log(`Inserted/updated ${batch.length} anonymized customers`);
    }
    catch (error) {
        console.error("Error inserting batch:", error);
        throw error;
    }
}
async function fullReindex(client) {
    const db = client.db();
    const customersCollection = db.collection("customers");
    const anonymisedCollection = db.collection("customers_anonymised");
    console.log("Starting full reindex...");
    let processedCount = 0;
    let batch = [];
    const BATCH_SIZE = 1000;
    const cursor = customersCollection.find({});
    for await (const customer of cursor) {
        const anonymized = (0, anonymizer_1.anonymizeCustomer)(customer);
        batch.push(anonymized);
        if (batch.length >= BATCH_SIZE) {
            await insertBatch(anonymisedCollection, batch);
            processedCount += batch.length;
            batch = [];
        }
    }
    // Insert remaining documents
    if (batch.length > 0) {
        await insertBatch(anonymisedCollection, batch);
        processedCount += batch.length;
    }
    console.log(`Full reindex completed. Processed ${processedCount} customers`);
}
async function realtimeSync(client) {
    const db = client.db();
    const customersCollection = db.collection("customers");
    const anonymisedCollection = db.collection("customers_anonymised");
    const resumeTokenCollection = db.collection("resume_tokens");
    // Try to get the last resume token
    const resumeTokenDoc = await resumeTokenCollection.findOne({
        _id: "sync_resume_token",
    });
    const resumeAfter = resumeTokenDoc?.token;
    if (resumeAfter) {
        console.log("Resuming from last position");
    }
    else {
        console.log("Starting fresh sync");
    }
    let batch = [];
    let batchTimer = null;
    const BATCH_SIZE = 1000;
    const BATCH_TIMEOUT = 1000; // 1 second
    const flushBatch = async (currentResumeToken) => {
        if (batchTimer) {
            clearTimeout(batchTimer);
            batchTimer = null;
        }
        if (batch.length > 0) {
            await insertBatch(anonymisedCollection, batch);
            batch = [];
        }
        // Save resume token after successful batch insert
        if (currentResumeToken) {
            await resumeTokenCollection.updateOne({ _id: "sync_resume_token" }, { $set: { token: currentResumeToken } }, { upsert: true });
        }
    };
    const resetBatchTimer = (currentResumeToken) => {
        if (batchTimer) {
            clearTimeout(batchTimer);
        }
        batchTimer = setTimeout(() => {
            void flushBatch(currentResumeToken);
        }, BATCH_TIMEOUT);
    };
    console.log("Watching for changes in customers collection...");
    const changeStream = customersCollection.watch([], {
        fullDocument: "updateLookup",
        resumeAfter: resumeAfter,
    });
    changeStream.on("change", (change) => {
        void (async () => {
            try {
                const validOperations = ["insert", "update", "replace"];
                if (validOperations.includes(change.operationType) && "fullDocument" in change && change.fullDocument) {
                    const anonymized = (0, anonymizer_1.anonymizeCustomer)(change.fullDocument);
                    batch.push(anonymized);
                    if (batch.length >= BATCH_SIZE) {
                        await flushBatch(change._id);
                    }
                    else {
                        resetBatchTimer(change._id);
                    }
                }
            }
            catch (error) {
                console.error("Error processing change:", error);
            }
        })();
    });
    changeStream.on("error", (error) => {
        console.error("Change stream error:", error);
        // Only exit if not in test mode
        if (process.env.NODE_ENV !== "test") {
            process.exit(1);
        }
    });
    // Handle graceful shutdown
    process.on("SIGINT", () => {
        void (async () => {
            console.log("\nShutting down gracefully...");
            const lastResumeToken = changeStream.resumeToken;
            await flushBatch(lastResumeToken || undefined);
            await changeStream.close();
            await client.close();
            process.exit(0);
        })();
    });
}
async function main() {
    const dbUri = process.env.DB_URI;
    if (!dbUri) {
        console.error("DB_URI environment variable is not set");
        process.exit(1);
    }
    const isFullReindex = process.argv.includes("--full-reindex");
    const client = new mongodb_1.MongoClient(dbUri);
    try {
        await client.connect();
        console.log("Connected to MongoDB");
        if (isFullReindex) {
            await fullReindex(client);
            await client.close();
            console.log("Full reindex completed successfully");
            process.exit(0);
        }
        else {
            await realtimeSync(client);
        }
    }
    catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
}
// Only run main if this file is executed directly (not imported)
if (require.main === module) {
    void main();
}
