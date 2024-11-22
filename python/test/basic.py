from typing import Iterator, List

import pytest
from your_library import get_ps_sweep  # You'll need to implement this


class TestBasic:
    @pytest.fixture(autouse=True)
    def setup(self):
        # Get both OpenAI and SGLang backends
        self.ps_sweep = get_ps_sweep()

    @pytest.mark.parametrize("get_s", ["ps_sweep"], indirect=True)
    def test_normal_control_flow(self, get_s):
        """Test basic conversation flow with the assistant."""
        s = get_s()

        s += s.system("You are a helpful assistant")
        s += s.user("Tell me a joke")
        s += s.assistant("" + s.gen("answer1", sampling_params={"temperature": 0}))

        assert s.get("answer1") is not None

    @pytest.mark.parametrize("get_s", ["ps_sweep"], indirect=True)
    def test_backend_switching(self, get_s):
        """Test multiple interactions with the assistant."""
        s = get_s()

        s += s.system("You are a helpful assistant")
        s += s.user("Tell me a joke")
        s += s.assistant("" + s.gen("answer1", sampling_params={"temperature": 0}))

        s += s.user("Tell me a better one")
        s += s.assistant(
            "No problem! " + s.gen("answer2", sampling_params={"temperature": 0})
        )

        assert s.get("answer1") is not None
        assert s.get("answer2") is not None

    @pytest.mark.parametrize("get_s", ["ps_sweep"], indirect=True)
    def test_streaming(self, get_s):
        """Test streaming functionality."""
        s = get_s()

        s += s.system("You are a helpful assistant")
        s += s.user("Tell me a joke")

        # In Python, we'll make the gen() call return an iterator when streaming
        gen = s + s.assistant(
            "" + s.gen("answer1", stream=True, sampling_params={"temperature": 0})
        )

        for chunk in gen:
            assert isinstance(chunk.content, str)

        assert s.get("answer1") is not None

    # Fixture to handle the ps_sweep parameter
    @pytest.fixture
    def get_s(self, request):
        if request.param == "ps_sweep":
            for s in self.ps_sweep:
                yield s
