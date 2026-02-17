#!/bin/bash
# This script ensures MongoDB replica set is initialized
# It runs as part of the docker-entrypoint-initdb.d initialization

echo "MongoDB initialization script starting..."
echo "Replica set will be initialized via healthcheck"
