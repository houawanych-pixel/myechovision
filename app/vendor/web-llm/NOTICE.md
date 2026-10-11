# Third-party: WebLLM

`index.js` is the unmodified browser build of `@mlc-ai/web-llm` 0.2.85
(Apache-2.0, https://github.com/mlc-ai/web-llm). It runs language models on the
device's GPU through WebGPU.

At runtime it downloads the chosen model from huggingface.co/mlc-ai and the
matching model library from raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs,
then keeps them in the browser's cache. Echo Vision uses Llama 3.2 Instruct
(1B or 3B), which is under Meta's Llama 3.2 Community License.
