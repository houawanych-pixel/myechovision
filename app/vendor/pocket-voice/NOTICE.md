# Third-party voice engine

Files in this folder are copied from
https://github.com/hemanth/pocket-voice (commit a4496c4, MIT © Hemanth.HM):

- `inference-worker.js` — in-browser Pocket TTS inference (ONNX Runtime Web)
- `sentencepiece.js` — SentencePiece tokenizer build (unmodified)

`inference-worker.js` has three marked "Echo Vision change" edits: it accepts `?ort=` and
`?models=` so the page can serve its own copies, and it tolerates a model copy without the
bundled sample voices.

Credits
- ONNX export and web pipeline: KevinAHM, https://huggingface.co/KevinAHM/pocket-tts-onnx
- Pocket TTS model: Kyutai, https://github.com/kyutai-labs/pocket-tts — weights CC BY 4.0

Echo Vision serves its own copies: the model in `app/models/` and ONNX Runtime Web
(MIT, Microsoft) in `app/vendor/ort/`, both fetched by `tools/fetch-voice-model.sh`.
If those copies are missing the worker falls back to cdn.jsdelivr.net and
huggingface.co/spaces/KevinAHM/pocket-tts-web. Nothing the
user records or types is uploaded; inference runs on the device.

Model terms prohibit voice impersonation or cloning without explicit and lawful
consent, and presenting generated audio as a real recording. Echo Vision asks
for that consent before a sample is saved.
