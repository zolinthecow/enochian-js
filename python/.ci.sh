#!/usr/bin/env bash

set -e

echo "Running formatting and linting..."
ruff check .
ruff format .

echo "Running tests..."
pytest

echo "building package..."
python -m build
