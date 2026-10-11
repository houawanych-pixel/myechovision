# Third-party voice engine

Files in this folder are copied unmodified from
https://github.com/hemanth/pocket-voice (commit a4496c4, MIT © Hemanth.HM):

- `inference-worker.js` — in-browser Pocket TTS inference (ONNX Runtime Web)
- `sentencepiece.js` — SentencePiece tokenizer build

Credits
- ONNX export and web pipeline: KevinAHM, https://huggingface.co/KevinAHM/pocket-tts-onnx
- Pocket TTS model: Kyutai, https://github.com/kyutai-labs/pocket-tts — weights CC BY 4.0

At runtime the worker downloads ONNX Runtime Web from cdn.jsdelivr.net and the
model files from huggingface.co/spaces/KevinAHM/pocket-tts-web. Nothing the
user records or types is uploaded; inference runs on the device.

Model terms prohibit voice impersonation or cloning without explicit and lawful
consent, and presenting generated audio as a real recording. Echo Vision asks
for that consent before a sample is saved.
