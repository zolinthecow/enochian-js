#!/usr/bin/env bash

set -e

echo "Running pre-commit..."
pre-commit run --files ./**

echo "Running tests..."
pytest

echo "building package..."
python -m build
