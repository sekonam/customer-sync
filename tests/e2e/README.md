# E2E Tests

## Overview

End-to-end tests for the backend test project that verify the full synchronization flow between the original customer database and the anonymized database.

## Test Coverage

### Full Reindex Flow
- **Process customers**: Verifies that customers are processed and anonymized versions are created
- **Large batch handling**: Tests processing of 2500+ customers in batches
- **Deterministic anonymization**: Ensures same input produces same output

### Real-time Sync Flow
- **New inserts**: Verifies that newly inserted customers are automatically synced and anonymized
- **Updates**: Tests that customer updates trigger re-anonymization

### Data Integrity
- **Referential integrity**: Ensures _id references are maintained between original and anonymized collections
- **Data isolation**: Verifies that sensitive data doesn't leak into anonymized collection

## Running E2E Tests

### Prerequisites
- Docker (for running tests in containers)
- MongoDB 7.0 with replica set support
- Node.js 18+

### Local Execution

Run tests against a local MongoDB instance:

```bash
# Start MongoDB test container
npm run docker:test:up

# Run e2e tests
npm run test:e2e:local

# Clean up
npm run docker:test:down
```

### Docker Execution

Run tests in a fully containerized environment:

```bash
npm run test:e2e:docker
```

Or use the helper script:

```bash
./scripts/run-e2e-tests.sh docker
```

### Manual Execution

```bash
# Set MongoDB connection string
export DB_URI=mongodb://localhost:27018/backend_test

# Run tests
npm run test:e2e
```

## Test Structure

- `sync-flow.test.ts`: Main e2e test file covering the entire sync workflow
- `setup.ts`: Test setup configuration (sets NODE_ENV=test)

## Configuration

- **Test timeout**: 30 seconds (configurable in jest-e2e.config.ts)
- **Workers**: 1 (tests run sequentially to avoid conflicts)
- **MongoDB**: Uses tmpfs for fast I/O in Docker
- **Port**: MongoDB test instance runs on port 27018 (to avoid conflicts)

## Verification Points

Each test verifies:
1. **Original data existence**: Confirms data exists in the source collection
2. **Anonymized data existence**: Verifies anonymized versions are created
3. **Data transformation**: Checks that sensitive fields are properly anonymized
4. **Data preservation**: Ensures non-sensitive fields (city, state, country, createdAt) are preserved
5. **Format validation**: Confirms anonymized fields match expected format (8 alphanumeric characters)
6. **Email domain preservation**: Verifies email domains remain intact
