# MongoDB Customer Data Anonymization Service

This project implements a MongoDB synchronization service that copies customer data from a source collection to an anonymized collection, replacing sensitive personal information with deterministic pseudonymous values.

## Overview

The project consists of two main applications:

1. **app.ts** - A customer data generator that simulates an e-commerce store by continuously creating customer records using Faker library
2. **sync.ts** - A synchronization service that monitors changes in the customers collection and copies them to an anonymized collection

## Requirements

- **For Docker (Recommended):**
  - Docker
  - Docker Compose

- **For Local Development:**
  - Node.js (v16 or higher)
  - MongoDB (with replica set enabled)
  - npm package manager

## Quick Start with Docker Compose

The easiest way to run the project is using Docker Compose:

```bash
# Start all services (MongoDB + app + sync)
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down

# Stop and remove volumes (clean slate)
docker-compose down -v
```

This will start:
- MongoDB with replica set enabled on port 27017
- Customer generator (app)
- Synchronization service (sync)

## Local Installation

1. Install dependencies:
```bash
npm install
```

2. Configure the database connection:
```bash
cp .env.example .env
```

Edit the `.env` file and set the `DB_URI` variable to your MongoDB connection string:
```
DB_URI=mongodb://localhost:27017/backend_test
```

**Important:** MongoDB Change Streams require a replica set. For local development:
```bash
mongod --replSet rs0 --port 27017
# In another terminal:
mongosh --eval "rs.initiate()"
```

3. Build the project:
```bash
npm run build
```

## Usage

### Running with Docker Compose

```bash
# Start all services
docker-compose up -d

# View app logs
docker-compose logs -f app

# View sync logs
docker-compose logs -f sync

# Restart sync service
docker-compose restart sync

# Run full reindex
docker-compose run --rm sync node dist/sync.js --full-reindex
```

### Running Locally

#### Customer Generator (app.ts)

This application continuously generates and inserts customer records into the `customers` collection:

```bash
npm run start:app
```

The generator creates random batches of 1-10 customers every 200 milliseconds. Press `Ctrl+C` to stop the application.

#### Synchronization Service (sync.ts)

The sync service operates in two modes:

**Real-time Synchronization (Default):**

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

**Full Reindex Mode:**

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
│   ├── anonymizer.ts   # Anonymization functions (testable module)
│   ├── app.ts          # Customer data generator
│   └── sync.ts         # Synchronization service
├── tests/
│   ├── unit/           # Unit tests
│   │   └── anonymizer.test.ts
│   └── e2e/            # End-to-end tests
│       └── sync.test.ts
├── docker/
│   └── mongo-init.sh   # MongoDB initialization script
├── dist/               # Compiled JavaScript files (generated)
├── .env                # Environment configuration (not in git)
├── .env.example        # Example environment configuration
├── .dockerignore       # Docker ignore rules
├── .gitignore          # Git ignore rules
├── Dockerfile          # Docker image definition
├── docker-compose.yml  # Docker Compose configuration
├── eslint.config.mjs   # ESLint configuration
├── jest.config.ts      # Jest configuration for unit tests
├── jest-e2e.config.ts  # Jest configuration for e2e tests
├── package.json        # Project dependencies and scripts
├── tsconfig.json       # TypeScript configuration
└── README.md           # This file
```

## Development

### Build Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm run format` - Format code using Prettier (default config)
- `npm run lint` - Lint code with ESLint
- `npm run lint:fix` - Lint and auto-fix issues
- `npm run start:app` - Run the customer generator
- `npm run start:sync` - Run the sync service
- `npm run test` - Run all tests
- `npm run test:unit` - Run unit tests only
- `npm run test:e2e` - Run e2e tests (requires MongoDB running)
- `npm run test:coverage` - Run tests with coverage report

### Code Quality

The project uses:
- **ESLint** with TypeScript rules (no rule exceptions)
- **Prettier** with default configuration
- **Jest** for unit and e2e testing

Run before committing:
```bash
npm run lint
npm run format
npm run test:unit
```

### Running Tests

**Unit Tests:**
```bash
npm run test:unit
```

Unit tests cover the anonymization logic and don't require a database.

**E2E Tests:**

E2E tests require a real MongoDB instance with replica set enabled.

Using Docker:
```bash
# Start MongoDB
docker-compose up -d mongodb

# Run e2e tests
npm run test:e2e

# Clean up
docker-compose down
```

Using local MongoDB:
```bash
# Start MongoDB with replica set
mongod --replSet rs0 --port 27017

# In another terminal, initialize replica set
mongosh --eval "rs.initiate()"

# Run e2e tests
npm run test:e2e
```

### Building Docker Images

```bash
# Build the image
docker build -t backend-test .

# Or build with docker-compose
docker-compose build
```

## Troubleshooting

### Connection Issues

If you encounter MongoDB connection errors, verify:
- MongoDB is running and accessible
- The `DB_URI` in `.env` is correct (or environment variable in Docker)
- Network connectivity to the MongoDB instance
- **Replica set is initialized** (required for Change Streams)

#### Checking Replica Set Status:
```bash
# Using Docker Compose
docker-compose exec mongodb mongosh --eval "rs.status()"

# Using local MongoDB
mongosh --eval "rs.status()"
```

### Resume Token Issues

If the sync service fails to resume from the last position:
- Check the `resume_tokens` collection for the stored token
- In case of corruption, delete the document with `_id: "sync_resume_token"` to start fresh
```bash
mongosh backend_test --eval 'db.resume_tokens.deleteMany({})'
```

### Performance Considerations

- The customer generator can be CPU and I/O intensive; adjust the batch size or interval if needed
- MongoDB Change Streams require a replica set; the docker-compose setup handles this automatically
- Large collections may take time to reindex; monitor progress through console output

### Docker Issues

If containers fail to start:
```bash
# Check logs
docker-compose logs

# Restart services
docker-compose restart

# Clean restart
docker-compose down -v
docker-compose up -d
```

If MongoDB health check fails:
- Wait 30-60 seconds for replica set initialization
- Check MongoDB logs: `docker-compose logs mongodb`
- Verify replica set: `docker-compose exec mongodb mongosh --eval "rs.status()"`

## License

ISC
