import { MongoClient, ObjectId } from "mongodb";
import { Customer, anonymizeCustomer } from "../../src/anonymizer";
import { insertBatch, fullReindex, realtimeSync } from "../../src/sync";

describe("E2E: Full Sync Flow", () => {
  let client: MongoClient;
  let dbUri: string;

  beforeAll(async () => {
    // Use environment variable or default to localhost
    dbUri = process.env.DB_URI || "mongodb://localhost:27017/backend_test";
    client = new MongoClient(dbUri, {
      directConnection: true,
      serverSelectionTimeoutMS: 30000,
    });
    
    try {
      await client.connect();
      console.log("Connected to MongoDB for E2E tests");
      
      // Wait a bit for replica set to be fully ready
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.error("Failed to connect to MongoDB:", error);
      throw error;
    }
  }, 60000); // Increase timeout to 60 seconds

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    // Clean up collections before each test
    const db = client.db();
    await db.collection("customers").deleteMany({});
    await db.collection("customers_anonymised").deleteMany({});
    await db.collection("resume_tokens").deleteMany({});
  });

  describe("Full Reindex Flow", () => {
    it("should process customers and create anonymized versions", async () => {
      const db = client.db();
      const customersCollection = db.collection<Customer>("customers");
      const anonymisedCollection = db.collection<Customer>("customers_anonymised");

      // Insert test customers
      const testCustomers: Customer[] = [
        {
          _id: new ObjectId(),
          firstName: "John",
          lastName: "Doe",
          email: "john.doe@example.com",
          address: {
            line1: "123 Main St",
            line2: "Apt 4B",
            postcode: "12345",
            city: "New York",
            state: "NY",
            country: "US",
          },
          createdAt: new Date("2023-01-01"),
        },
        {
          _id: new ObjectId(),
          firstName: "Jane",
          lastName: "Smith",
          email: "jane.smith@example.com",
          address: {
            line1: "456 Oak Ave",
            line2: "Suite 100",
            postcode: "67890",
            city: "Los Angeles",
            state: "CA",
            country: "US",
          },
          createdAt: new Date("2023-01-02"),
        },
        {
          _id: new ObjectId(),
          firstName: "Bob",
          lastName: "Johnson",
          email: "bob.j@test.org",
          address: {
            line1: "789 Pine Rd",
            line2: "",
            postcode: "11111",
            city: "Chicago",
            state: "IL",
            country: "US",
          },
          createdAt: new Date("2023-01-03"),
        },
      ];

      await customersCollection.insertMany(testCustomers);

      // Verify original data exists
      const originalCount = await customersCollection.countDocuments();
      expect(originalCount).toBe(3);

      // Run full reindex
      await fullReindex(client);

      // Verify anonymized data exists
      const anonymisedCount = await anonymisedCollection.countDocuments();
      expect(anonymisedCount).toBe(3);

      // Verify original data is unchanged
      const originalData = await customersCollection.find().toArray();
      expect(originalData).toHaveLength(3);
      expect(originalData[0].firstName).toBe("John");
      expect(originalData[1].firstName).toBe("Jane");
      expect(originalData[2].firstName).toBe("Bob");

      // Verify anonymized data is properly anonymized
      for (const originalCustomer of testCustomers) {
        const anonymized = await anonymisedCollection.findOne({
          _id: originalCustomer._id,
        });

        expect(anonymized).toBeDefined();
        expect(anonymized!._id).toEqual(originalCustomer._id);

        // Verify fields are anonymized
        expect(anonymized!.firstName).not.toBe(originalCustomer.firstName);
        expect(anonymized!.lastName).not.toBe(originalCustomer.lastName);
        expect(anonymized!.address.line1).not.toBe(originalCustomer.address.line1);
        expect(anonymized!.address.line2).not.toBe(originalCustomer.address.line2);
        expect(anonymized!.address.postcode).not.toBe(originalCustomer.address.postcode);

        // Verify anonymized fields have correct format
        expect(anonymized!.firstName).toHaveLength(8);
        expect(anonymized!.lastName).toHaveLength(8);
        expect(anonymized!.firstName).toMatch(/^[a-zA-Z0-9]{8}$/);
        expect(anonymized!.lastName).toMatch(/^[a-zA-Z0-9]{8}$/);

        // Verify preserved fields
        expect(anonymized!.address.city).toBe(originalCustomer.address.city);
        expect(anonymized!.address.state).toBe(originalCustomer.address.state);
        expect(anonymized!.address.country).toBe(originalCustomer.address.country);
        expect(anonymized!.createdAt).toEqual(originalCustomer.createdAt);

        // Verify email domain is preserved
        const originalDomain = originalCustomer.email.split("@")[1];
        const anonymizedDomain = anonymized!.email.split("@")[1];
        expect(anonymizedDomain).toBe(originalDomain);
      }
    });

    it("should handle large batch of customers", async () => {
      const db = client.db();
      const customersCollection = db.collection<Customer>("customers");
      const anonymisedCollection = db.collection<Customer>("customers_anonymised");

      // Insert 2500 customers (more than 2 batches)
      const testCustomers: Customer[] = [];
      for (let i = 0; i < 2500; i++) {
        testCustomers.push({
          _id: new ObjectId(),
          firstName: `FirstName${i}`,
          lastName: `LastName${i}`,
          email: `user${i}@example.com`,
          address: {
            line1: `${i} Street`,
            line2: `Unit ${i}`,
            postcode: `${10000 + i}`,
            city: "TestCity",
            state: "TS",
            country: "US",
          },
          createdAt: new Date(),
        });
      }

      await customersCollection.insertMany(testCustomers);

      // Run full reindex
      await fullReindex(client);

      // Verify all customers were processed
      const anonymisedCount = await anonymisedCollection.countDocuments();
      expect(anonymisedCount).toBe(2500);

      // Spot check a few random customers
      const sampleIds = [
        testCustomers[0]._id,
        testCustomers[500]._id,
        testCustomers[1500]._id,
        testCustomers[2499]._id,
      ];

      for (const id of sampleIds) {
        const anonymized = await anonymisedCollection.findOne({ _id: id });
        expect(anonymized).toBeDefined();
        expect(anonymized!.firstName).toHaveLength(8);
        expect(anonymized!.address.city).toBe("TestCity");
      }
    });

    it("should be deterministic - same input produces same output", async () => {
      const db = client.db();
      const customersCollection = db.collection<Customer>("customers");
      const anonymisedCollection = db.collection<Customer>("customers_anonymised");

      const testCustomer: Customer = {
        _id: new ObjectId(),
        firstName: "Alice",
        lastName: "Wonder",
        email: "alice@wonderland.com",
        address: {
          line1: "1 Rabbit Hole",
          line2: "",
          postcode: "99999",
          city: "Wonderland",
          state: "WL",
          country: "US",
        },
        createdAt: new Date("2023-01-01"),
      };

      await customersCollection.insertOne(testCustomer);

      // Run reindex first time
      await fullReindex(client);
      const firstResult = await anonymisedCollection.findOne({ _id: testCustomer._id });

      // Clear anonymized collection and run again
      await anonymisedCollection.deleteMany({});
      await fullReindex(client);
      const secondResult = await anonymisedCollection.findOne({ _id: testCustomer._id });

      // Both results should be identical
      expect(firstResult).toEqual(secondResult);
    });
  });

  describe("Real-time Sync Flow", () => {
    it("should sync new inserts in real-time", async () => {
      const db = client.db();
      const customersCollection = db.collection<Customer>("customers");
      const anonymisedCollection = db.collection<Customer>("customers_anonymised");

      // Create a separate client for sync to avoid closing the test client
      const syncClient = new MongoClient(dbUri, {
        directConnection: true,
      });
      await syncClient.connect();

      // Start real-time sync in background
      const syncPromise = realtimeSync(syncClient);

      // Wait for sync to initialize
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Insert a new customer
      const newCustomer: Customer = {
        _id: new ObjectId(),
        firstName: "Charlie",
        lastName: "Brown",
        email: "charlie@peanuts.com",
        address: {
          line1: "100 Peanuts Lane",
          line2: "",
          postcode: "55555",
          city: "Happiness",
          state: "HP",
          country: "US",
        },
        createdAt: new Date(),
      };

      await customersCollection.insertOne(newCustomer);

      // Wait for change stream to process
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Verify anonymized version exists
      const anonymized = await anonymisedCollection.findOne({ _id: newCustomer._id });
      expect(anonymized).toBeDefined();
      expect(anonymized!.firstName).not.toBe("Charlie");
      expect(anonymized!.firstName).toHaveLength(8);
      expect(anonymized!.address.city).toBe("Happiness");

      // Cleanup
      await syncClient.close();
    }, 15000);

    it("should sync updates in real-time", async () => {
      const db = client.db();
      const customersCollection = db.collection<Customer>("customers");
      const anonymisedCollection = db.collection<Customer>("customers_anonymised");

      // Insert initial customer
      const customer: Customer = {
        _id: new ObjectId(),
        firstName: "David",
        lastName: "Smith",
        email: "david@example.com",
        address: {
          line1: "200 Main St",
          line2: "",
          postcode: "12345",
          city: "Springfield",
          state: "IL",
          country: "US",
        },
        createdAt: new Date(),
      };

      await customersCollection.insertOne(customer);

      // Create a separate client for sync
      const syncClient = new MongoClient(dbUri, {
        directConnection: true,
      });
      await syncClient.connect();

      // Start real-time sync
      const syncPromise = realtimeSync(syncClient);
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Update the customer
      await customersCollection.updateOne(
        { _id: customer._id },
        { $set: { firstName: "Dave", address: { ...customer.address, line1: "201 Main St" } } }
      );

      // Wait for sync
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Verify updated anonymized version
      const anonymized = await anonymisedCollection.findOne({ _id: customer._id });
      expect(anonymized).toBeDefined();
      expect(anonymized!.firstName).not.toBe("Dave");
      expect(anonymized!.address.line1).not.toBe("201 Main St");
      expect(anonymized!.address.city).toBe("Springfield");

      // Cleanup
      await syncClient.close();
    }, 15000);
  });

  describe("Data Integrity", () => {
    it("should maintain referential integrity by _id", async () => {
      const db = client.db();
      const customersCollection = db.collection<Customer>("customers");
      const anonymisedCollection = db.collection<Customer>("customers_anonymised");

      // Insert multiple customers
      const customers: Customer[] = [];
      for (let i = 0; i < 10; i++) {
        customers.push({
          _id: new ObjectId(),
          firstName: `Customer${i}`,
          lastName: `User${i}`,
          email: `customer${i}@test.com`,
          address: {
            line1: `Address ${i}`,
            line2: "",
            postcode: `1000${i}`,
            city: "TestCity",
            state: "TC",
            country: "US",
          },
          createdAt: new Date(),
        });
      }

      await customersCollection.insertMany(customers);
      await fullReindex(client);

      // Verify each original customer has corresponding anonymized version
      for (const customer of customers) {
        const original = await customersCollection.findOne({ _id: customer._id });
        const anonymized = await anonymisedCollection.findOne({ _id: customer._id });

        expect(original).toBeDefined();
        expect(anonymized).toBeDefined();
        expect(original!._id).toEqual(anonymized!._id);
      }
    });

    it("should not leak original data into anonymized collection", async () => {
      const db = client.db();
      const customersCollection = db.collection<Customer>("customers");
      const anonymisedCollection = db.collection<Customer>("customers_anonymised");

      const sensitiveCustomer: Customer = {
        _id: new ObjectId(),
        firstName: "Sensitive",
        lastName: "Information",
        email: "sensitive@secret.com",
        address: {
          line1: "Secret Location",
          line2: "Confidential",
          postcode: "00000",
          city: "SecretCity",
          state: "SC",
          country: "US",
        },
        createdAt: new Date(),
      };

      await customersCollection.insertOne(sensitiveCustomer);
      await fullReindex(client);

      const anonymized = await anonymisedCollection.findOne({ _id: sensitiveCustomer._id });

      // Verify sensitive data is not present
      expect(anonymized!.firstName).not.toBe("Sensitive");
      expect(anonymized!.lastName).not.toBe("Information");
      expect(anonymized!.email).not.toContain("sensitive");
      expect(anonymized!.address.line1).not.toBe("Secret Location");
      expect(anonymized!.address.line2).not.toBe("Confidential");
      expect(anonymized!.address.postcode).not.toBe("00000");

      // Verify preserved data is still correct
      expect(anonymized!.address.city).toBe("SecretCity");
      expect(anonymized!.address.state).toBe("SC");
      expect(anonymized!.address.country).toBe("US");
    });
  });
});
