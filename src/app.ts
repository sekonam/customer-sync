import { MongoClient } from "mongodb";
import { faker } from "@faker-js/faker";
import * as dotenv from "dotenv";

dotenv.config();

interface Customer {
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

function generateCustomer(): Customer {
  return {
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    email: faker.internet.email(),
    address: {
      line1: faker.location.streetAddress(),
      line2: faker.location.secondaryAddress(),
      postcode: faker.location.zipCode(),
      city: faker.location.city(),
      state: faker.location.state({ abbreviated: true }),
      country: faker.location.countryCode("alpha-2"),
    },
    createdAt: new Date(),
  };
}

async function main() {
  const dbUri = process.env.DB_URI;
  if (!dbUri) {
    console.error("DB_URI environment variable is not set");
    process.exit(1);
  }

  const client = new MongoClient(dbUri);

  try {
    await client.connect();
    console.log("Connected to MongoDB");

    const db = client.db();
    const customersCollection = db.collection<Customer>("customers");

    // Generate and insert customers in batches forever
    while (true) {
      const batchSize = Math.floor(Math.random() * 10) + 1; // 1-10 customers
      const customers: Customer[] = [];

      for (let i = 0; i < batchSize; i++) {
        customers.push(generateCustomer());
      }

      await customersCollection.insertMany(customers);
      console.log(`Inserted ${batchSize} customers`);

      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

void main();
