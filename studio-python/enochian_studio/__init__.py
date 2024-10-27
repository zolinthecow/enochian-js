from importlib.metadata import version
from .cli import main as run_node_script

__version__ = version("enochian-studio")
__all__ = ["run_node_script"]
