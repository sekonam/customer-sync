import { MongoClient, Collection, ChangeStream } from "mongodb";
import { Customer, anonymizeCustomer } from "../../src/anonymizer";
import { insertBatch, fullReindex, realtimeSync } from "../../src/sync";

// Mock modules
jest.mock("mongodb");
jest.mock("../../src/anonymizer");

describe("Sync Module", () => {
  let mockClient: jest.Mocked<MongoClient>;
  let mockDb: any;
  let mockCustomersCollection: jest.Mocked<Collection<Customer>>;
  let mockAnonymisedCollection: jest.Mocked<Collection<Customer>>;
  let mockResumeTokenCollection: jest.Mocked<Collection<any>>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock collections
    mockCustomersCollection = {
      find: jest.fn(),
      watch: jest.fn(),
      bulkWrite: jest.fn(),
    } as any;

    mockAnonymisedCollection = {
      bulkWrite: jest.fn(),
    } as any;

    mockResumeTokenCollection = {
      findOne: jest.fn(),
      updateOne: jest.fn(),
    } as any;

    mockDb = {
      collection: jest.fn((name: string) => {
        if (name === "customers") return mockCustomersCollection;
        if (name === "customers_anonymised") return mockAnonymisedCollection;
        if (name === "resume_tokens") return mockResumeTokenCollection;
      }),
    };

    mockClient = {
      db: jest.fn(() => mockDb),
      connect: jest.fn(),
      close: jest.fn(),
    } as any;
  });

  describe("insertBatch", () => {
    it("should not perform bulk write when batch is empty", async () => {
      await insertBatch(mockAnonymisedCollection, []);
      
      expect(mockAnonymisedCollection.bulkWrite).not.toHaveBeenCalled();
    });

    it("should perform bulk write with correct operations", async () => {
      const batch: Customer[] = [
        {
          _id: "123" as any,
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          address: {
            line1: "123 Main St",
            line2: "",
            postcode: "12345",
            city: "NYC",
            state: "NY",
            country: "US",
          },
          createdAt: new Date(),
        },
      ];

      mockAnonymisedCollection.bulkWrite.mockResolvedValue({} as any);

      await insertBatch(mockAnonymisedCollection, batch);

      expect(mockAnonymisedCollection.bulkWrite).toHaveBeenCalledWith(
        expect.arrayContaining([
          {
            replaceOne: {
              filter: { _id: "123" },
              replacement: batch[0],
              upsert: true,
            },
          },
        ])
      );
    });

    it("should throw error when bulk write fails", async () => {
      const batch: Customer[] = [
        {
          _id: "123" as any,
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          address: {
            line1: "123 Main St",
            line2: "",
            postcode: "12345",
            city: "NYC",
            state: "NY",
            country: "US",
          },
          createdAt: new Date(),
        },
      ];

      const error = new Error("Database error");
      mockAnonymisedCollection.bulkWrite.mockRejectedValue(error);

      await expect(insertBatch(mockAnonymisedCollection, batch)).rejects.toThrow(
        "Database error"
      );
    });
  });

  describe("fullReindex", () => {
    it("should process all customers in batches", async () => {
      const mockCustomers = [
        {
          _id: "1",
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          address: {
            line1: "123 Main St",
            line2: "",
            postcode: "12345",
            city: "NYC",
            state: "NY",
            country: "US",
          },
          createdAt: new Date(),
        },
        {
          _id: "2",
          firstName: "Jane",
          lastName: "Smith",
          email: "jane@example.com",
          address: {
            line1: "456 Oak Ave",
            line2: "",
            postcode: "67890",
            city: "LA",
            state: "CA",
            country: "US",
          },
          createdAt: new Date(),
        },
      ];

      // Mock the cursor
      const mockCursor = {
        [Symbol.asyncIterator]: async function* () {
          for (const customer of mockCustomers) {
            yield customer;
          }
        },
      };

      mockCustomersCollection.find.mockReturnValue(mockCursor as any);
      mockAnonymisedCollection.bulkWrite.mockResolvedValue({} as any);
      
      // Mock anonymizeCustomer to return a modified version
      (anonymizeCustomer as jest.Mock).mockImplementation((customer: Customer) => ({
        ...customer,
        firstName: "anonymized",
      }));

      await fullReindex(mockClient);

      expect(mockCustomersCollection.find).toHaveBeenCalledWith({});
      expect(mockAnonymisedCollection.bulkWrite).toHaveBeenCalled();
      expect(anonymizeCustomer).toHaveBeenCalledTimes(2);
    });
  });

  describe("realtimeSync", () => {
    let mockChangeStream: any;

    beforeEach(() => {
      mockChangeStream = {
        on: jest.fn(),
        close: jest.fn(),
        resumeToken: null,
      };

      mockCustomersCollection.watch.mockReturnValue(mockChangeStream);
      mockResumeTokenCollection.findOne.mockResolvedValue(null);
    });

    it("should setup change stream with correct options", async () => {
      // Start realtimeSync in background (it doesn't return immediately)
      const syncPromise = realtimeSync(mockClient);

      // Wait for async operations to settle
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockCustomersCollection.watch).toHaveBeenCalledWith(
        [],
        {
          fullDocument: "updateLookup",
          resumeAfter: undefined,
        }
      );

      // The realtimeSync function doesn't return, so we can't await it normally
      // Just verify the watch was called
    });

    it("should resume from last token if available", async () => {
      const mockToken = { _data: "some-token" };
      mockResumeTokenCollection.findOne.mockResolvedValue({
        _id: "sync_resume_token",
        token: mockToken,
      });

      const syncPromise = realtimeSync(mockClient);
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockResumeTokenCollection.findOne).toHaveBeenCalledWith({
        _id: "sync_resume_token",
      });
      expect(mockCustomersCollection.watch).toHaveBeenCalledWith(
        [],
        expect.objectContaining({
          resumeAfter: mockToken,
        })
      );
    });

    it("should register change and error handlers", async () => {
      const syncPromise = realtimeSync(mockClient);
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockChangeStream.on).toHaveBeenCalledWith("change", expect.any(Function));
      expect(mockChangeStream.on).toHaveBeenCalledWith("error", expect.any(Function));
    });
  });
});
