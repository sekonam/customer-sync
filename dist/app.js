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
const mongodb_1 = require("mongodb");
const faker_1 = require("@faker-js/faker");
const dotenv = __importStar(require("dotenv"));
dotenv.config();
function generateCustomer() {
    return {
        firstName: faker_1.faker.person.firstName(),
        lastName: faker_1.faker.person.lastName(),
        email: faker_1.faker.internet.email(),
        address: {
            line1: faker_1.faker.location.streetAddress(),
            line2: faker_1.faker.location.secondaryAddress(),
            postcode: faker_1.faker.location.zipCode(),
            city: faker_1.faker.location.city(),
            state: faker_1.faker.location.state({ abbreviated: true }),
            country: faker_1.faker.location.countryCode("alpha-2"),
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
    const client = new mongodb_1.MongoClient(dbUri);
    try {
        await client.connect();
        console.log("Connected to MongoDB");
        const db = client.db();
        const customersCollection = db.collection("customers");
        // Generate and insert customers in batches forever
        while (true) {
            const batchSize = Math.floor(Math.random() * 10) + 1; // 1-10 customers
            const customers = [];
            for (let i = 0; i < batchSize; i++) {
                customers.push(generateCustomer());
            }
            await customersCollection.insertMany(customers);
            console.log(`Inserted ${batchSize} customers`);
            await new Promise((resolve) => setTimeout(resolve, 200));
        }
    }
    catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
}
void main();
