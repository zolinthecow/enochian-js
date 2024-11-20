import os
import subprocess
import logging
from pathlib import Path
from .node_runner import NodeRunner

logger = logging.getLogger(__name__)


def install_npm_dependencies():
    """Install npm dependencies in the package directory"""
    package_dir = Path(__file__).parent
    node_modules = package_dir / "node_modules"

    logger.info(f"Installing npm dependencies in {package_dir}")

    # Create package.json if it doesn't exist
    package_json = package_dir / "package.json"
    if not package_json.exists():
        package_json.write_text(
            """{
          "name": "enochian-studio-npm-deps",
          "version": "1.0.0",
          "private": true,
          "dependencies": {
            "enochian-studio": "0.0.5"
          }
        }"""
        )

    try:
        node_runner = NodeRunner()
        node_runner.npm("install", cwd=str(package_dir))
        logger.info(f"Successfully installed npm dependencies in {node_modules}")
    except subprocess.CalledProcessError as e:
        logger.error(f"Failed to install npm dependencies: {e}")
        raise
    except FileNotFoundError:
        logger.error("npm not found. Please ensure Node.js is installed")
        raise
