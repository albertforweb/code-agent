# Local Model Inference

CodeAgent supports a first-class local backend built on its bundled open-source llama.cpp server and GGUF model files from Hugging Face.

Release packages include **Offline starter — Qwen2.5 Coder 0.5B**, the official Q4_0 GGUF pinned to a reviewed Hugging Face revision and SHA-256 checksum. It is available without a network connection and is the default CodeAgent model. Its Apache-2.0 license and upstream model card are included beside the model file.

## Security and scope

- Catalog searches return public, non-gated repositories tagged `gguf`.
- Model downloads use HTTPS and retain the repository/file identity in local metadata.
- `HF_TOKEN` or `HUGGING_FACE_HUB_TOKEN` is sent only to Hugging Face when configured.
- The managed inference process accepts loopback hosts only (`127.0.0.1`, `localhost`, or `::1`).
- CodeAgent uses llama.cpp's OpenAI-compatible `/v1/chat/completions` interface, so the same API adapter serves CLI and desktop.
- Model licenses vary. Users must review the model card and license before redistribution or commercial use.

## Normal workflow

In desktop Settings, select **CodeAgent** under **LLM backend**, choose a model from the Hugging Face catalog, and save. CodeAgent populates the loopback base URL, downloads the selected model when necessary, and starts or restarts inference. The configured backend is restored at application startup, and the owned server is stopped at application exit.

For the CLI:

```bash
code-agent --llm-provider codeagent --model <owner/repository>
```

The CLI starts the bundled engine before the session and stops it when the CLI exits. Advanced `code-agent models ...` commands remain available for catalog inspection, explicit quantization downloads, and diagnostics. A custom engine may still be supplied through `CODEAGENT_LLAMA_SERVER_PATH`.

`models start` prints the exact `--base-url` and `--model` values for a CodeAgent CLI session. The process is detached and remains available to desktop or later CLI processes until `models stop` is called.

## Packaged engines

Desktop release builds bundle the llama.cpp binary for the installer target and one architecture-independent copy of the offline starter model. The Windows x64 installer includes `llama-server.exe` and its required llama, ggml, server, and CPU-backend DLLs; Apple Silicon builds include the native macOS arm64 server. Release CI verifies the engine and the model checksum inside the packaged application rather than only checking their download directories.

The universal CLI package carries the supported macOS, Linux, and Windows arm64/x64 engines and selects the matching directory at runtime.

## Storage

- CLI: `${CODEAGENT_CONFIG_DIR:-~/.code-agent}/local-models`
- Desktop: `<Electron userData>/local-models`

Each model directory contains the `.gguf` file and `model.json`. Engine state is stored in `inference.json`, and server output is appended to `inference.log`.
