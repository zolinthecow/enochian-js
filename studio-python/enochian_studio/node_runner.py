import os
import subprocess
import platform
import shutil
from pathlib import Path
import urllib.request
import tarfile
import zipfile

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

    def _download_node(self):
        system = platform.system().lower()
        arch = "x64" if platform.machine().endswith('64') else "x86"

        self.base_dir.mkdir(parents=True, exist_ok=True)

        if system == "windows":
            filename = f"node-v{self.node_version}-win-{arch}.zip"
            url = f"https://nodejs.org/dist/v{self.node_version}/{filename}"
        else:
            filename = f"node-v{self.node_version}-{system}-{arch}.tar.gz"
            url = f"https://nodejs.org/dist/v{self.node_version}/{filename}"

        downloaded_file = self.base_dir / filename
        print(f"Downloading Node.js {self.node_version}...")
        urllib.request.urlretrieve(url, downloaded_file)

        if system == "windows":
            with zipfile.ZipFile(downloaded_file, 'r') as zip_ref:
                zip_ref.extractall(self.base_dir)
        else:
            with tarfile.open(downloaded_file, 'r:gz') as tar_ref:
                tar_ref.extractall(self.base_dir)

        extracted_dir = next(self.base_dir.glob(f"node-v{self.node_version}-*"))
        extracted_dir.rename(self.node_dir)

        downloaded_file.unlink()

    def ensure_node_installed(self):
        if not self.node_binary.exists():
            self._download_node()

    def run_script(self, script_path, *args, env=None):
        self.ensure_node_installed()

        cmd = [str(self.node_binary), str(script_path)] + list(args)
        result = subprocess.run(
            cmd,
            text=True,
            env=env
        )

    def run_code(self, code):
        self.ensure_node_installed()

        cmd = [str(self.node_binary), '-e', code]
        result = subprocess.run(
            cmd,
            text=True
        )

    def npm(self, *args, cwd=None):
        """Run an npm command with provided arguments"""
        self.ensure_node_installed()

        cmd = [str(self.npm_binary)] + list(args)
        result = subprocess.run(
            cmd,
            text=True,
            cwd=cwd
        )
