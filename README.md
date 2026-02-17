# MongoDB Customer Data Anonymization Service

This project implements a MongoDB synchronization service that copies customer data from a source collection to an anonymized collection, replacing sensitive personal information with deterministic pseudonymous values.

## Overview

The project consists of two main applications:

1. **app.ts** - A customer data generator that simulates an e-commerce store by continuously creating customer records using Faker library
2. **sync.ts** - A synchronization service that monitors changes in the customers collection and copies them to an anonymized collection

## Requirements

- Node.js (v16 or higher)
- MongoDB (local or remote instance)
- npm or yarn package manager

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd backend_test
```

2. Install dependencies:
```bash
npm install
```

3. Configure the database connection:
```bash
cp .env.example .env
```

Edit the `.env` file and set the `DB_URI` variable to your MongoDB connection string:
```
DB_URI=mongodb://localhost:27017/backend_test
```

4. Build the project:
```bash
npm run build
```

## Usage

### Running the Customer Generator (app.ts)

This application continuously generates and inserts customer records into the `customers` collection:

```bash
npm run start:app
```

The generator creates random batches of 1-10 customers every 200 milliseconds. Press `Ctrl+C` to stop the application.

### Running the Synchronization Service (sync.ts)

The sync service operates in two modes:

#### Real-time Synchronization (Default)

Monitors the `customers` collection for new and updated documents and synchronizes them to `customers_anonymised`:

```bash
npm run start:sync
```

Features:
- Watches for changes using MongoDB Change Streams
- Accumulates batches of up to 1,000 documents
- Automatically inserts batches after 1 second if the batch size is not reached
- Stores resume tokens to continue from the last position after restart
- Handles graceful shutdown with `Ctrl+C`

#### Full Reindex Mode

Processes all existing documents in the `customers` collection and copies them to `customers_anonymised`:

```bash
npm run start:sync -- --full-reindex
```

Features:
- Processes all documents in batches of 1,000
- Exits with code 0 upon successful completion
- Can run in parallel with real-time synchronization

## Data Anonymization

The sync service anonymizes the following fields:
- `firstName` - replaced with 8-character pseudonymous string
- `lastName` - replaced with 8-character pseudonymous string
- `email` - local part (before @) is replaced with 8-character pseudonymous string
- `address.line1` - replaced with 8-character pseudonymous string
- `address.line2` - replaced with 8-character pseudonymous string
- `address.postcode` - replaced with 8-character pseudonymous string

The following fields remain unchanged:
- `_id` - preserved to maintain document identity
- `address.city`
- `address.state`
- `address.country`
- `createdAt`

Anonymization uses a deterministic pseudo-random algorithm based on SHA-256 hashing, ensuring the same input always produces the same output.

## Database Collections

### customers
Source collection containing original customer data with the following structure:

```javascript
{
  "_id": ObjectId("..."),
  "firstName": "Cindy",
  "lastName": "Doyle",
  "email": "Cindy.Doyle@hotmail.com",
  "address": {
    "line1": "34801 Kurt Spur",
    "line2": "Suite 028",
    "postcode": "45081",
    "city": "Hailieberg",
    "state": "NY",
    "country": "US"
  },
  "createdAt": ISODate("2022-12-11T19:08:41.683Z")
}
```

### customers_anonymised
Target collection containing anonymized customer data:

```javascript
{
  "_id": ObjectId("..."),
  "firstName": "Lba7yaBf",
  "lastName": "mn1aMji3",
  "email": "V83AkoCj@hotmail.com",
  "address": {
    "line1": "cHyd22Ji",
    "line2": "pPa0Ui3b",
    "postcode": "oO15sD6F",
    "city": "Hailieberg",
    "state": "NY",
    "country": "US"
  },
  "createdAt": ISODate("2023-03-20T19:08:41.683Z")
}
```

### resume_tokens
Internal collection used by the sync service to store resume tokens for change stream continuity.

## Project Structure

```
backend_test/
├── src/
│   ├── app.ts          # Customer data generator
│   └── sync.ts         # Synchronization service
├── dist/               # Compiled JavaScript files (generated)
├── .env                # Environment configuration (not in git)
├── .env.example        # Example environment configuration
├── .gitignore          # Git ignore rules
├── package.json        # Project dependencies and scripts
├── tsconfig.json       # TypeScript configuration
└── README.md           # This file
```

## Development

### Build Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm run format` - Format code using Prettier
- `npm run start:app` - Run the customer generator
- `npm run start:sync` - Run the sync service

### Code Formatting

The project uses Prettier with default configuration. Run `npm run format` before committing changes.

## Troubleshooting

### Connection Issues

If you encounter MongoDB connection errors, verify:
- MongoDB is running and accessible
- The `DB_URI` in `.env` is correct
- Network connectivity to the MongoDB instance

### Resume Token Issues

If the sync service fails to resume from the last position:
- Check the `resume_tokens` collection for the stored token
- In case of corruption, delete the document with `_id: "sync_resume_token"` to start fresh

### Performance Considerations

- The customer generator can be CPU and I/O intensive; adjust the batch size or interval if needed
- MongoDB Change Streams require a replica set; use `mongod --replSet rs0` for local development
- Large collections may take time to reindex; monitor progress through console output

## License

ISC
