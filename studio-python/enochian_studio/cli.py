import os
import sys
import logging
from pathlib import Path
import subprocess
from .installer import install_npm_dependencies
from nodejs import node, npm, npx

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def ensure_dependencies():
    """Ensure npm dependencies are installed"""
    package_dir = Path(__file__).parent
    node_modules = package_dir / "node_modules"

    if not node_modules.exists():
        logger.info("Node modules not found, installing dependencies...")
        install_npm_dependencies()

def main():
    """Entry point for the CLI command"""
    # Make sure dependencies are installed
    ensure_dependencies()

    # Get the path to the node script
    package_dir = Path(__file__).parent

    node_script = package_dir / 'node_modules' / '@zolinthecow' / 'enochian-studio' / '.output' / 'server' / 'index.mjs'

    if not node_script.exists():
        logger.error(f"Could not find Node.js script at {node_script}")
        sys.exit(1)

    try:
        # Run the node script
        node.run([str(node_script)], env={'PORT': '56765'}, check=True)
    except subprocess.CalledProcessError as e:
        logger.error(f"Error running Node.js script: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
