import * as crypto from "crypto";
import { ObjectId } from "mongodb";

export interface Customer {
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

// Generate deterministic 8-character string from input
export function anonymize(input: string): string {
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

export function anonymizeCustomer(customer: Customer): Customer {
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
