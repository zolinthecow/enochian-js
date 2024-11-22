from typing import Any, Callable, Dict, List, Optional, Union

from pydantic import BaseModel, Field
from typing_extensions import Literal


class Tool(BaseModel):
    function: Callable[..., Any]
    name: str
    params: Optional[Any] = None
    description: Optional[str] = None


class DebugInfo(BaseModel):
    base_url: str = Field(..., alias="baseUrl")
    port: int
    debug_name: Optional[str] = Field(None, alias="debugName")
    debug_prompt_id: Optional[str] = Field(None, alias="debugPromptID")


class MessageMetadata(BaseModel):
    id: Optional[str] = None
    probably_prefix_cached: Optional[bool] = Field(None, alias="probablyPrefixCached")
    prel: Optional[int] = None
    type: Optional[str] = None
    extra_fields: Dict[str, Any] = Field(default_factory=dict)


class Message(MessageMetadata):
    role: Literal["user", "assistant", "system"]
    content: str


class SamplingParams(BaseModel):
    max_new_tokens: Optional[int] = None
    stop: Optional[Union[str, List[str]]] = None
    stop_token_ids: Optional[List[int]] = None
    temperature: Optional[float] = None
    top_p: Optional[float] = None
    top_k: Optional[int] = None
    min_p: Optional[float] = None
    ignore_eos: Optional[bool] = None
    skip_special_tokens: Optional[bool] = None
    spaces_between_special_tokens: Optional[bool] = None
    regex: Optional[str] = None
    n: Optional[int] = None
    json_schema: Optional[str] = None
    pydantic_model: Optional[BaseModel] = None
    frequency_penalty: Optional[float] = Field(None, ge=-2, le=2)
    presence_penalty: Optional[float] = Field(None, ge=-2, le=2)
    repetition_penalty: Optional[float] = Field(None, ge=0, le=2)
    min_new_tokens: Optional[int] = Field(None, ge=0)


class GenerateReqInputBase(BaseModel):
    text: Optional[Union[str, List[str]]] = None
    input_ids: Optional[Union[List[int], List[List[int]]]] = None
    image_data: Optional[Union[str, List[str]]] = None
    sampling_params: Optional[SamplingParams] = None
    rid: Optional[Union[str, List[str]]] = None
    return_logprob: Optional[bool] = None
    logprob_start_len: Optional[int] = None
    top_logprobs_num: Optional[int] = None
    return_text_in_logprobs: Optional[bool] = None
    debug: Optional[DebugInfo] = None
    tools: Optional[Dict[str, Tool]] = None
    transform: Optional[Callable[[List[Message]], List[Message]]] = None


class GenerateReqNonStreamingInput(GenerateReqInputBase):
    stream: Optional[Literal[False]] = None
    choices: Optional[List[str]] = None


class GenerateReqStreamingInput(GenerateReqInputBase):
    stream: Literal[True]


GenerateReqInput = Union[GenerateReqNonStreamingInput, GenerateReqStreamingInput]


class FinishReasonLength(BaseModel):
    type: Literal["length"]
    length: int


class FinishReasonStop(BaseModel):
    type: Literal["stop"]
    matched: Union[int, str]


class Logprob(BaseModel):
    token_id: int = Field(..., description="Token ID")
    logprob: float = Field(..., description="Log probability")
    text: Optional[str] = None


class MetaInfoBase(BaseModel):
    prompt_tokens: int
    completion_tokens: int
    completion_tokens_wo_jump_forward: int
    finish_reason: Optional[Union[FinishReasonLength, FinishReasonStop]] = None
    id: str


class MetaInfoWithLogprobs(MetaInfoBase):
    input_token_logprobs: Optional[List[Logprob]] = None
    output_token_logprobs: Optional[List[Logprob]] = None
    input_top_logprobs: Optional[List[List[Logprob]]] = None
    output_top_logprobs: Optional[List[List[Logprob]]] = None
    normalized_prompt_logprob: float


class GenerateRespSingle(BaseModel):
    text: str
    meta_info: Union[MetaInfoBase, MetaInfoWithLogprobs]
    index: Optional[int] = None


class GetModelInfo(BaseModel):
    model_path: str
    is_generation: bool
