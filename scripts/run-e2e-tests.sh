#!/bin/bash

# E2E Test Runner Script
# This script helps run e2e tests with proper MongoDB setup

set -e

echo "🚀 Starting E2E Tests for Backend Test Project"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        echo -e "${RED}❌ Docker is not running. Please start Docker and try again.${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Docker is running${NC}"
}

# Function to clean up containers
cleanup() {
    echo ""
    echo -e "${YELLOW}🧹 Cleaning up test containers...${NC}"
    docker-compose -f docker-compose.test.yml down -v > /dev/null 2>&1 || true
    echo -e "${GREEN}✓ Cleanup complete${NC}"
}

# Parse command line arguments
MODE=${1:-docker}

if [ "$MODE" = "local" ]; then
    echo -e "${YELLOW}📝 Running tests against local MongoDB${NC}"
    echo "   Make sure MongoDB is running on localhost:27017"
    echo ""
    
    # Check if MongoDB is accessible
    if ! nc -z localhost 27017 2>/dev/null; then
        echo -e "${RED}❌ Cannot connect to MongoDB on localhost:27017${NC}"
        echo "   Please start MongoDB or use 'docker' mode"
        exit 1
    fi
    
    echo -e "${GREEN}✓ MongoDB is accessible${NC}"
    echo ""
    echo "🧪 Running E2E tests..."
    npm run test:e2e:local
    
elif [ "$MODE" = "docker" ]; then
    echo -e "${YELLOW}🐳 Running tests with Docker Compose${NC}"
    echo ""
    
    check_docker
    
    # Ensure we clean up on exit
    trap cleanup EXIT
    
    echo ""
    echo "🏗️  Building and starting test environment..."
    npm run test:e2e:docker
    
else
    echo -e "${RED}❌ Invalid mode: $MODE${NC}"
    echo ""
    echo "Usage: $0 [docker|local]"
    echo ""
    echo "  docker - Run tests in Docker containers (default)"
    echo "  local  - Run tests against local MongoDB instance"
    exit 1
fi

echo ""
echo -e "${GREEN}✅ E2E Tests completed successfully!${NC}"
