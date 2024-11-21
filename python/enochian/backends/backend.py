from abc import ABC, abstractmethod
from typing import Dict, Iterator, List, Optional, Union

from enochian.api import GenerateReqInput, GenerateRespSingle, Message


class Backend(ABC):
    @abstractmethod
    def set_model(self, params: Dict) -> None:
        pass

    @abstractmethod
    def gen(
        self, messages: List[Message], gen_input: Optional[GenerateReqInput] = None
    ) -> Union[GenerateRespSingle, Iterator[GenerateRespSingle]]:
        pass

    @abstractmethod
    def get_prompt(self, messages: List[Message]) -> str:
        pass

    @abstractmethod
    def clone(self) -> "Backend":
        pass

    @abstractmethod
    def get_token_count(self, messages: List[Message]) -> int:
        pass
