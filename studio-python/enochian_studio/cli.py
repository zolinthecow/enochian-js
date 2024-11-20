import os
import sys
import logging
import argparse
import signal
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


class ServerProcess:
    """Wrapper class to manage the server process"""

    def __init__(self, process: subprocess.Popen):
        self.process = process
        self.pid = process.pid

    def kill(self):
        """Kill the server process and its children"""
        if sys.platform == "win32":
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(self.pid)], capture_output=True
            )
        else:
            try:
                pgid = os.getpgid(self.pid)
                os.killpg(pgid, signal.SIGTERM)
            except ProcessLookupError:
                logger.warning(f"Process {self.pid} already terminated")


def start_server(port: int = 56765) -> ServerProcess:
    """Start the Enochian studio server
    Args:
        port (int): Port number to run the server on. Defaults to 56765.
    Returns:
        ServerProcess: Object containing the server process information and control methods
    """
    import pprint
    import traceback

    pprint.pp(traceback.format_stack())

    node_runner = NodeRunner()
    node_runner.ensure_node_installed()
    ensure_dependencies()

    package_dir = Path(__file__).parent
    migrate_script = package_dir / "node_modules" / "enochian-studio" / "migrate.js"
    node_script = (
        package_dir
        / "node_modules"
        / "enochian-studio"
        / ".output"
        / "server"
        / "index.mjs"
    )

    if not migrate_script.exists():
        logger.error(f"Could not find migrate script at {migrate_script}")
        sys.exit(1)
    if not node_script.exists():
        logger.error(f"Could not find server script at {node_script}")
        sys.exit(1)

    try:
        # Run migrations first (using the standard run_script method)
        node_runner.run_script(str(migrate_script))

        # Start the server in a new process group
        env = os.environ.copy()
        env["PORT"] = str(port)

        cmd = [str(node_runner.node_binary), str(node_script), "studio"]

        if sys.platform == "win32":
            process = subprocess.Popen(
                cmd, env=env, creationflags=subprocess.CREATE_NEW_PROCESS_GROUP
            )
        else:
            process = subprocess.Popen(
                cmd, env=env, preexec_fn=os.setsid  # Create new process group
            )

        logger.info(f"Server started on port {port} with PID {process.pid}")
        return ServerProcess(process)

    except subprocess.CalledProcessError as e:
        logger.error(f"Error running Node.js script: {e}")
        sys.exit(1)


def main():
    """Entry point for the CLI command"""
    parser = argparse.ArgumentParser(description="Start the Enochian studio server")
    parser.add_argument(
        "--PORT",
        type=int,
        default=56765,
        help="Port to run the server on (default: 56765)",
    )

    args = parser.parse_args()
    server = start_server(port=args.PORT)

    def signal_handler(signum, frame):
        logger.info("Shutting down server...")
        server.kill()
        sys.exit(0)

    # Register signal handlers
    signal.signal(signal.SIGINT, signal_handler)  # Handles Ctrl+C
    signal.signal(signal.SIGTERM, signal_handler)  # Handles termination request

    try:
        # Keep the main process running
        while True:
            server.process.poll()
            if server.process.returncode is not None:
                logger.info("Server process terminated")
                break
            signal.pause()
    except KeyboardInterrupt:
        # This ensures we handle Ctrl+C even if signal.pause() is interrupted
        signal_handler(signal.SIGINT, None)


if __name__ == "__main__":
    main()
