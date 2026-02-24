import { faker } from "@faker-js/faker";
import { generateCustomer } from "../../src/app";

// Mock faker
jest.mock("@faker-js/faker", () => ({
  faker: {
    person: {
      firstName: jest.fn(() => "John"),
      lastName: jest.fn(() => "Doe"),
    },
    internet: {
      email: jest.fn(() => "john.doe@example.com"),
    },
    location: {
      streetAddress: jest.fn(() => "123 Main St"),
      secondaryAddress: jest.fn(() => "Apt 4B"),
      zipCode: jest.fn(() => "12345"),
      city: jest.fn(() => "New York"),
      state: jest.fn(() => "NY"),
      countryCode: jest.fn(() => "US"),
    },
  },
}));

describe("App Module", () => {
  describe("generateCustomer", () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it("should generate a customer with all required fields", () => {
      const customer = generateCustomer();

      expect(customer.firstName).toBe("John");
      expect(customer.lastName).toBe("Doe");
      expect(customer.email).toBe("john.doe@example.com");
      expect(customer.address.line1).toBe("123 Main St");
      expect(customer.address.line2).toBe("Apt 4B");
      expect(customer.address.postcode).toBe("12345");
      expect(customer.address.city).toBe("New York");
      expect(customer.address.state).toBe("NY");
      expect(customer.address.country).toBe("US");
      expect(customer.createdAt).toBeInstanceOf(Date);
    });

    it("should call faker methods with correct parameters", () => {
      const mockFaker = require("@faker-js/faker").faker;

      // Reset mocks to track calls
      jest.clearAllMocks();

      generateCustomer();

      expect(mockFaker.person.firstName).toHaveBeenCalled();
      expect(mockFaker.person.lastName).toHaveBeenCalled();
      expect(mockFaker.internet.email).toHaveBeenCalled();
      expect(mockFaker.location.streetAddress).toHaveBeenCalled();
      expect(mockFaker.location.secondaryAddress).toHaveBeenCalled();
      expect(mockFaker.location.zipCode).toHaveBeenCalled();
      expect(mockFaker.location.city).toHaveBeenCalled();
      expect(mockFaker.location.state).toHaveBeenCalledWith({ abbreviated: true });
      expect(mockFaker.location.countryCode).toHaveBeenCalledWith("alpha-2");
    });

    it("should generate customer with valid address structure", () => {
      const customer = generateCustomer();

      expect(customer.address).toHaveProperty("line1");
      expect(customer.address).toHaveProperty("line2");
      expect(customer.address).toHaveProperty("postcode");
      expect(customer.address).toHaveProperty("city");
      expect(customer.address).toHaveProperty("state");
      expect(customer.address).toHaveProperty("country");

      expect(typeof customer.address.line1).toBe("string");
      expect(typeof customer.address.line2).toBe("string");
      expect(typeof customer.address.postcode).toBe("string");
      expect(typeof customer.address.city).toBe("string");
      expect(typeof customer.address.state).toBe("string");
      expect(typeof customer.address.country).toBe("string");
    });

    it("should generate customer with Date for createdAt", () => {
      const customer = generateCustomer();
      
      expect(customer.createdAt).toBeInstanceOf(Date);
      expect(customer.createdAt.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it("should generate customer matching Customer interface", () => {
      const customer = generateCustomer();

      // Verify types
      expect(typeof customer.firstName).toBe("string");
      expect(typeof customer.lastName).toBe("string");
      expect(typeof customer.email).toBe("string");
      expect(typeof customer.address).toBe("object");
      expect(customer.createdAt).toBeInstanceOf(Date);

      // Verify all address fields are present
      const requiredAddressFields = [
        "line1",
        "line2",
        "postcode",
        "city",
        "state",
        "country",
      ];
      requiredAddressFields.forEach((field) => {
        expect(customer.address).toHaveProperty(field);
      });
    });
  });

  describe("Customer data validation", () => {
    it("should generate email in valid format", () => {
      const customer = generateCustomer();
      
      expect(customer.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    });

    it("should generate non-empty strings for all text fields", () => {
      const customer = generateCustomer();

      expect(customer.firstName.length).toBeGreaterThan(0);
      expect(customer.lastName.length).toBeGreaterThan(0);
      expect(customer.email.length).toBeGreaterThan(0);
      expect(customer.address.line1.length).toBeGreaterThan(0);
      expect(customer.address.city.length).toBeGreaterThan(0);
      expect(customer.address.state.length).toBeGreaterThan(0);
      expect(customer.address.country.length).toBeGreaterThan(0);
    });
  });
});
