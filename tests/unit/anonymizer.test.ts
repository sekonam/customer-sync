import { anonymize, anonymizeCustomer, Customer } from "../../src/anonymizer";
import { ObjectId } from "mongodb";

describe("Anonymizer", () => {
  describe("anonymize", () => {
    it("should generate an 8-character string", () => {
      const result = anonymize("test");
      expect(result).toHaveLength(8);
    });

    it("should generate alphanumeric characters only", () => {
      const result = anonymize("test");
      expect(result).toMatch(/^[a-zA-Z0-9]{8}$/);
    });

    it("should be deterministic (same input produces same output)", () => {
      const input = "teststring";
      const result1 = anonymize(input);
      const result2 = anonymize(input);
      expect(result1).toBe(result2);
    });

    it("should produce different outputs for different inputs", () => {
      const result1 = anonymize("input1");
      const result2 = anonymize("input2");
      expect(result1).not.toBe(result2);
    });

    it("should handle empty strings", () => {
      const result = anonymize("");
      expect(result).toHaveLength(8);
      expect(result).toMatch(/^[a-zA-Z0-9]{8}$/);
    });

    it("should handle special characters in input", () => {
      const result = anonymize("test@#$%^&*()");
      expect(result).toHaveLength(8);
      expect(result).toMatch(/^[a-zA-Z0-9]{8}$/);
    });
  });

  describe("anonymizeCustomer", () => {
    const mockCustomer: Customer = {
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
    };

    it("should anonymize firstName", () => {
      const result = anonymizeCustomer(mockCustomer);
      expect(result.firstName).not.toBe(mockCustomer.firstName);
      expect(result.firstName).toHaveLength(8);
      expect(result.firstName).toMatch(/^[a-zA-Z0-9]{8}$/);
    });

    it("should anonymize lastName", () => {
      const result = anonymizeCustomer(mockCustomer);
      expect(result.lastName).not.toBe(mockCustomer.lastName);
      expect(result.lastName).toHaveLength(8);
      expect(result.lastName).toMatch(/^[a-zA-Z0-9]{8}$/);
    });

    it("should anonymize email local part but keep domain", () => {
      const result = anonymizeCustomer(mockCustomer);
      expect(result.email).not.toBe(mockCustomer.email);
      expect(result.email).toMatch(/^[a-zA-Z0-9]{8}@example\.com$/);
    });

    it("should anonymize address line1", () => {
      const result = anonymizeCustomer(mockCustomer);
      expect(result.address.line1).not.toBe(mockCustomer.address.line1);
      expect(result.address.line1).toHaveLength(8);
      expect(result.address.line1).toMatch(/^[a-zA-Z0-9]{8}$/);
    });

    it("should anonymize address line2", () => {
      const result = anonymizeCustomer(mockCustomer);
      expect(result.address.line2).not.toBe(mockCustomer.address.line2);
      expect(result.address.line2).toHaveLength(8);
      expect(result.address.line2).toMatch(/^[a-zA-Z0-9]{8}$/);
    });

    it("should anonymize postcode", () => {
      const result = anonymizeCustomer(mockCustomer);
      expect(result.address.postcode).not.toBe(mockCustomer.address.postcode);
      expect(result.address.postcode).toHaveLength(8);
      expect(result.address.postcode).toMatch(/^[a-zA-Z0-9]{8}$/);
    });

    it("should preserve _id", () => {
      const result = anonymizeCustomer(mockCustomer);
      expect(result._id).toBe(mockCustomer._id);
    });

    it("should preserve city", () => {
      const result = anonymizeCustomer(mockCustomer);
      expect(result.address.city).toBe(mockCustomer.address.city);
    });

    it("should preserve state", () => {
      const result = anonymizeCustomer(mockCustomer);
      expect(result.address.state).toBe(mockCustomer.address.state);
    });

    it("should preserve country", () => {
      const result = anonymizeCustomer(mockCustomer);
      expect(result.address.country).toBe(mockCustomer.address.country);
    });

    it("should preserve createdAt", () => {
      const result = anonymizeCustomer(mockCustomer);
      expect(result.createdAt).toBe(mockCustomer.createdAt);
    });

    it("should be deterministic for the same customer", () => {
      const result1 = anonymizeCustomer(mockCustomer);
      const result2 = anonymizeCustomer(mockCustomer);
      expect(result1.firstName).toBe(result2.firstName);
      expect(result1.lastName).toBe(result2.lastName);
      expect(result1.email).toBe(result2.email);
      expect(result1.address.line1).toBe(result2.address.line1);
      expect(result1.address.line2).toBe(result2.address.line2);
      expect(result1.address.postcode).toBe(result2.address.postcode);
    });
  });
});
