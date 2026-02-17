import { MongoClient, ObjectId } from "mongodb";
import { anonymizeCustomer, Customer } from "../../src/anonymizer";

// E2E tests require a real MongoDB instance running
// Run with: docker-compose up -d mongodb
// Then: npm run test:e2e

const MONGODB_URI =
  process.env.TEST_DB_URI || "mongodb://localhost:27017/backend_test_e2e";

describe("E2E: MongoDB Anonymization", () => {
  let client: MongoClient;

  beforeAll(async () => {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    // Clean up collections before each test
    const db = client.db();
    const collections = await db.listCollections().toArray();
    for (const collection of collections) {
      await db.collection(collection.name).deleteMany({});
    }
  });

  it("should insert and anonymize customer data", async () => {
    const db = client.db();
    const customersCollection = db.collection<Customer>("customers");
    const anonymisedCollection = db.collection<Customer>(
      "customers_anonymised",
    );

    // Insert a customer
    const customer: Customer = {
      _id: new ObjectId(),
      firstName: "Alice",
      lastName: "Smith",
      email: "alice.smith@example.com",
      address: {
        line1: "456 Oak Ave",
        line2: "Unit 10",
        postcode: "67890",
        city: "Los Angeles",
        state: "CA",
        country: "US",
      },
      createdAt: new Date(),
    };

    await customersCollection.insertOne(customer);

    // Manually anonymize and insert (simulating sync service)
    const anonymized = anonymizeCustomer(customer);
    await anonymisedCollection.replaceOne(
      { _id: anonymized._id },
      anonymized,
      { upsert: true },
    );

    // Verify anonymized data
    const result = await anonymisedCollection.findOne({ _id: customer._id });

    expect(result).toBeDefined();
    expect(result!._id).toEqual(customer._id);
    expect(result!.firstName).not.toBe(customer.firstName);
    expect(result!.lastName).not.toBe(customer.lastName);
    expect(result!.email).toMatch(/^[a-zA-Z0-9]{8}@example\.com$/);
    expect(result!.address.city).toBe(customer.address.city);
    expect(result!.address.state).toBe(customer.address.state);
    expect(result!.address.country).toBe(customer.address.country);
  });

  it("should handle batch insert and anonymization", async () => {
    const db = client.db();
    const customersCollection = db.collection<Customer>("customers");
    const anonymisedCollection = db.collection<Customer>(
      "customers_anonymised",
    );

    // Insert multiple customers
    const customers: Customer[] = Array.from({ length: 10 }, (_, i) => ({
      _id: new ObjectId(),
      firstName: `First${i}`,
      lastName: `Last${i}`,
      email: `user${i}@test.com`,
      address: {
        line1: `${i} Street`,
        line2: `Apt ${i}`,
        postcode: `${i}0000`,
        city: "TestCity",
        state: "TS",
        country: "US",
      },
      createdAt: new Date(),
    }));

    await customersCollection.insertMany(customers);

    // Batch anonymize and insert
    const anonymizedBatch = customers.map((c) => anonymizeCustomer(c));
    await anonymisedCollection.bulkWrite(
      anonymizedBatch.map((doc) => ({
        replaceOne: {
          filter: { _id: doc._id },
          replacement: doc,
          upsert: true,
        },
      })),
    );

    // Verify all documents were anonymized
    const count = await anonymisedCollection.countDocuments({});
    expect(count).toBe(10);

    // Verify a sample document
    const sample = await anonymisedCollection.findOne({
      _id: customers[0]._id,
    });
    expect(sample).toBeDefined();
    expect(sample!.firstName).not.toBe("First0");
    expect(sample!.address.city).toBe("TestCity");
  });

  it("should update existing anonymized documents on upsert", async () => {
    const db = client.db();
    const customersCollection = db.collection<Customer>("customers");
    const anonymisedCollection = db.collection<Customer>(
      "customers_anonymised",
    );

    const customerId = new ObjectId();
    const customer: Customer = {
      _id: customerId,
      firstName: "Bob",
      lastName: "Johnson",
      email: "bob.johnson@mail.com",
      address: {
        line1: "789 Pine St",
        line2: "",
        postcode: "11111",
        city: "Chicago",
        state: "IL",
        country: "US",
      },
      createdAt: new Date(),
    };

    // First insert
    await customersCollection.insertOne(customer);
    const firstAnonymized = anonymizeCustomer(customer);
    await anonymisedCollection.replaceOne(
      { _id: firstAnonymized._id },
      firstAnonymized,
      { upsert: true },
    );

    // Update original customer
    customer.firstName = "Robert";
    await customersCollection.replaceOne({ _id: customerId }, customer);

    // Re-anonymize and upsert
    const updatedAnonymized = anonymizeCustomer(customer);
    await anonymisedCollection.replaceOne(
      { _id: updatedAnonymized._id },
      updatedAnonymized,
      { upsert: true },
    );

    // Verify only one document exists
    const count = await anonymisedCollection.countDocuments({
      _id: customerId,
    });
    expect(count).toBe(1);

    // Verify the document was updated
    const result = await anonymisedCollection.findOne({ _id: customerId });
    expect(result!.firstName).not.toBe("Bob");
    expect(result!.firstName).not.toBe("Robert");
    // But since "Robert" hashes differently, the anonymized version should be different
    expect(result!.firstName).not.toBe(firstAnonymized.firstName);
  });
});
