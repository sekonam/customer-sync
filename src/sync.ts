import {
  MongoClient,
  ChangeStreamDocument,
  ResumeToken,
  ObjectId,
  Collection,
} from "mongodb";
import * as dotenv from "dotenv";
import * as crypto from "crypto";

dotenv.config();

interface Customer {
  _id: ObjectId;
  firstName: string;
  lastName: string;
  email: string;
  address: {
    line1: string;
    line2: string;
    postcode: string;
    city: string;
    state: string;
    country: string;
  };
  createdAt: Date;
}

interface ResumeTokenDoc {
  _id: string;
  token: ResumeToken;
}

// Generate deterministic 8-character string from input
function anonymize(input: string): string {
  const hash = crypto.createHash("sha256").update(input).digest("hex");
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";

  for (let i = 0; i < 8; i++) {
    const index = parseInt(hash.substr(i * 2, 2), 16) % chars.length;
    result += chars[index];
  }

  return result;
}

function anonymizeCustomer(customer: Customer): Customer {
  const emailParts = customer.email.split("@");
  const anonymizedEmailPrefix = anonymize(emailParts[0]);
  const anonymizedEmail = `${anonymizedEmailPrefix}@${emailParts[1]}`;

  return {
    ...customer,
    firstName: anonymize(customer.firstName),
    lastName: anonymize(customer.lastName),
    email: anonymizedEmail,
    address: {
      ...customer.address,
      line1: anonymize(customer.address.line1),
      line2: anonymize(customer.address.line2),
      postcode: anonymize(customer.address.postcode),
    },
  };
}

async function insertBatch(
  collection: Collection<Customer>,
  batch: Customer[],
): Promise<void> {
  if (batch.length === 0) return;

  try {
    await collection.bulkWrite(
      batch.map((doc) => ({
        replaceOne: {
          filter: { _id: doc._id },
          replacement: doc,
          upsert: true,
        },
      })),
    );
    console.log(`Inserted/updated ${batch.length} anonymized customers`);
  } catch (error) {
    console.error("Error inserting batch:", error);
    throw error;
  }
}

async function fullReindex(client: MongoClient): Promise<void> {
  const db = client.db();
  const customersCollection = db.collection<Customer>("customers");
  const anonymisedCollection = db.collection<Customer>("customers_anonymised");

  console.log("Starting full reindex...");

  let processedCount = 0;
  let batch: Customer[] = [];
  const BATCH_SIZE = 1000;

  const cursor = customersCollection.find({});

  for await (const customer of cursor) {
    const anonymized = anonymizeCustomer(customer);
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

async function realtimeSync(client: MongoClient): Promise<void> {
  const db = client.db();
  const customersCollection = db.collection<Customer>("customers");
  const anonymisedCollection = db.collection<Customer>("customers_anonymised");
  const resumeTokenCollection = db.collection<ResumeTokenDoc>("resume_tokens");

  // Try to get the last resume token
  const resumeTokenDoc = await resumeTokenCollection.findOne({
    _id: "sync_resume_token",
  });
  const resumeAfter = resumeTokenDoc?.token;

  if (resumeAfter) {
    console.log("Resuming from last position");
  } else {
    console.log("Starting fresh sync");
  }

  let batch: Customer[] = [];
  let batchTimer: NodeJS.Timeout | null = null;
  const BATCH_SIZE = 1000;
  const BATCH_TIMEOUT = 1000; // 1 second

  const flushBatch = async (currentResumeToken?: ResumeToken) => {
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
      await resumeTokenCollection.updateOne(
        { _id: "sync_resume_token" },
        { $set: { token: currentResumeToken } },
        { upsert: true },
      );
    }
  };

  const resetBatchTimer = (currentResumeToken: ResumeToken) => {
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

  changeStream.on("change", (change: ChangeStreamDocument<Customer>) => {
    void (async () => {
      try {
        let customer: Customer | null = null;

        if (change.operationType === "insert" && change.fullDocument) {
          customer = change.fullDocument;
        } else if (change.operationType === "update" && change.fullDocument) {
          customer = change.fullDocument;
        } else if (change.operationType === "replace" && change.fullDocument) {
          customer = change.fullDocument;
        }

        if (customer) {
          const anonymized = anonymizeCustomer(customer);
          batch.push(anonymized);

          if (batch.length >= BATCH_SIZE) {
            await flushBatch(change._id);
          } else {
            resetBatchTimer(change._id);
          }
        }
      } catch (error) {
        console.error("Error processing change:", error);
      }
    })();
  });

  changeStream.on("error", (error) => {
    console.error("Change stream error:", error);
    process.exit(1);
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

  const client = new MongoClient(dbUri);

  try {
    await client.connect();
    console.log("Connected to MongoDB");

    if (isFullReindex) {
      await fullReindex(client);
      await client.close();
      console.log("Full reindex completed successfully");
      process.exit(0);
    } else {
      await realtimeSync(client);
    }
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

void main();
