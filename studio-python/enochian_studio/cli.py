import os
import sys
import logging
from pathlib import Path
import subprocess
from .installer import install_npm_dependencies
from .node_runner import NodeRunner

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
    node_runner = NodeRunner()

    # Make sure dependencies are installed
    ensure_dependencies()

    # Get the path to the node script
    package_dir = Path(__file__).parent

    migrate_script = package_dir / 'node_modules' / '@zolinthecow' / 'enochian-studio' / 'migrate.js'
    node_script = package_dir / 'node_modules' / '@zolinthecow' / 'enochian-studio' / '.output' / 'server' / 'index.mjs'

    if not node_script.exists():
        logger.error(f"Could not find migrate script at {migrate_script}")
        sys.exit(1)
    if not node_script.exists():
        logger.error(f"Could not find server script at {node_script}")
        sys.exit(1)

    try:
        # Run the node script
        node_runner.run_script(str(migrate_script))
        node_runner.run_script(str(node_script), 'studio', env={'PORT': '56765'})
    except subprocess.CalledProcessError as e:
        logger.error(f"Error running Node.js script: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
