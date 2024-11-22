#!/usr/bin/env bash

set -e

echo "Running formatters..."
black .
isort .

echo "Running linter..."
ruff check .

echo "Running type checker..."
mypy .

echo "Running tests..."
pytest

echo "building package..."
python -m build
