import os
import time
import errno
import subprocess
import platform
import shutil
from pathlib import Path
import urllib.request
import tarfile
import zipfile

class FileLock:
    def __init__(self, lock_file):
        self.lock_file = Path(lock_file)
        self.fd = None

    def acquire(self, timeout=30, check_interval=0.1):
        start_time = time.time()
        while True:
            try:
                # Try to create the lockfile exclusively
                self.fd = os.open(str(self.lock_file), os.O_CREAT | os.O_EXCL | os.O_RDWR)
                # Lock was successfully acquired
                break
            except OSError as e:
                if e.errno != errno.EEXIST:
                    raise
                if time.time() - start_time >= timeout:
                    raise TimeoutError("Could not acquire lock")
                time.sleep(check_interval)

    def release(self):
        if self.fd is not None:
            os.close(self.fd)
            try:
                os.unlink(str(self.lock_file))
            except OSError:
                pass
            self.fd = None

    def __enter__(self):
        self.acquire()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.release()

class NodeRunner:
    def __init__(self, node_version="22.9.0"):
        self.node_version = node_version
        self.base_dir = Path(__file__).parent / ".node_runner"
        self.node_dir = self.base_dir / f"node-{node_version}"
        self.node_binary = self._get_node_binary_path()
        self.npm_binary = self._get_npm_binary_path()

    def _get_node_binary_path(self):
        system = platform.system().lower()
        if system == "windows":
            return self.node_dir / "node.exe"
        return self.node_dir / "bin" / "node"

    def _get_npm_binary_path(self):
        system = platform.system().lower()
        if system == "windows":
            return self.node_dir / "npm.cmd"
        return self.node_dir / "bin" / "npm"

    def _get_bin_dir(self):
        system = platform.system().lower()
        if system == "windows":
            return self.node_dir
        return self.node_dir / "bin"

    def _get_enhanced_env(self):
        """Create a new environment dict with the node bin directory added to PATH"""
        env = os.environ.copy()
        bin_dir = str(self._get_bin_dir())

        # Get the path separator based on the system
        path_sep = ';' if platform.system().lower() == 'windows' else ':'

        # Add bin_dir to the beginning of PATH
        if 'PATH' in env:
            env['PATH'] = f"{bin_dir}{path_sep}{env['PATH']}"
        else:
            env['PATH'] = bin_dir

        return env

    def _download_node(self):
        system = platform.system().lower()
        arch = "x64" if platform.machine().endswith('64') else "x86"
        self.base_dir.mkdir(parents=True, exist_ok=True)

        # Create a lock file in the base directory
        lock_file = self.base_dir / ".node_download.lock"

        with FileLock(lock_file):
            # Check if Node.js is already downloaded and extracted
            if self.node_dir.exists():
                print("Node dir exists, cleaning up...")
                if self.node_dir.is_file:
                    self.node_dir.unlink()
                else:
                    shutil.rmtree(self.node_dir)

            if system == "windows":
                filename = f"node-v{self.node_version}-win-{arch}.zip"
                url = f"https://nodejs.org/dist/v{self.node_version}/{filename}"
            else:
                filename = f"node-v{self.node_version}-{system}-{arch}.tar.gz"
                url = f"https://nodejs.org/dist/v{self.node_version}/{filename}"

            downloaded_file = self.base_dir / filename
            print(f"Downloading Node.js {self.node_version} to {downloaded_file}...")

            try:
                urllib.request.urlretrieve(url, downloaded_file)

                if system == "windows":
                    with zipfile.ZipFile(downloaded_file, 'r') as zip_ref:
                        zip_ref.extractall(self.base_dir)
                else:
                    with tarfile.open(downloaded_file, 'r:gz') as tar_ref:
                        tar_ref.extractall(self.base_dir)

                if system == "windows":
                    extracted_dir = self.base_dir / filename[:-4]
                else:
                    extracted_dir = self.base_dir / filename[:-7]
                # Use replace instead of rename to handle cases where the target directory exists
                extracted_dir.replace(self.node_dir)
            finally:
                # Clean up the downloaded file even if extraction fails
                if downloaded_file.exists():
                    downloaded_file.unlink()

    def ensure_node_installed(self):
        if not self.node_binary.is_file() or not self.npm_binary.is_file():
            self._download_node()

    def run_script(self, script_path, *args, env=None):
        self.ensure_node_installed()

        final_env = self._get_enhanced_env()
        if env:
            final_env.update(env)

        cmd = [str(self.node_binary), str(script_path)] + list(args)
        result = subprocess.run(
            cmd,
            text=True,
            env=final_env
        )

    def run_code(self, code):
        self.ensure_node_installed()

        cmd = [str(self.node_binary), '-e', code]
        result = subprocess.run(
            cmd,
            text=True,
            env=self._get_enhanced_env()
        )

    def npm(self, *args, cwd=None):
        """Run an npm command with provided arguments"""
        self.ensure_node_installed()


        cmd = [str(self.npm_binary)] + list(args)
        result = subprocess.run(
            cmd,
            text=True,
            cwd=cwd,
            env=self._get_enhanced_env()
        )
