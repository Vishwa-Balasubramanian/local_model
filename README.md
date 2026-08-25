# Local Chat

A lightweight, private ChatGPT-style interface for running open models on your own computer with [Ollama](https://ollama.com/).

Local Chat provides streaming responses, conversation history, model selection, Markdown rendering, and configurable generation settings. The included default assistant prompt is designed to make local models respond clearly, politely, and honestly.

> **Privacy:** When Ollama and this application run on your computer, prompts and model responses are not sent to a hosted AI provider. Chat history and settings are stored in your browser's local storage.

## Features

- Streaming, token-by-token responses
- Support for any chat model installed in Ollama
- Qwen configured as the default model
- Multiple conversations stored in the browser
- Custom system prompt, temperature, and top-p controls
- Markdown and code-block rendering
- Responsive desktop and mobile interface
- Backend request validation and useful connection errors
- No database, account, or cloud AI API required

## How it works

```text
Browser
   │
   │ HTTP / streaming NDJSON
   ▼
FastAPI application
   │
   │ Ollama chat API
   ▼
Ollama ──► Qwen model
```

The browser sends the conversation to the FastAPI backend. The backend adds the default system prompt when needed, forwards the request to Ollama, and streams generated text back to the page.

## Requirements

- Python 3.10 or newer
- [Ollama](https://ollama.com/download)
- Approximately 6 GB of free memory for the default `qwen2:7b` model

A supported GPU improves generation speed considerably. The application also works on CPU, but larger models may respond slowly.

## Quick start on Windows

### 1. Install and prepare Ollama

Install Ollama, then download the default model:

```powershell
ollama pull qwen2:7b
```

Verify that it is installed:

```powershell
ollama list
```

### 2. Install the application

From the project directory:

```powershell
py -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

If PowerShell prevents virtual-environment activation, run this once in the current terminal:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

### 3. Start Local Chat

```powershell
uvicorn app:app --reload
```

Open <http://127.0.0.1:8000>.

## Quick start on Linux or macOS

```bash
ollama pull qwen2:7b

python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

uvicorn app:app --reload
```

Open <http://127.0.0.1:8000>.

## Model selection

Every model shown by `ollama list` appears in the model selector after the page is refreshed.

Some useful Qwen options are:

| Model | Approximate download | Suggested use |
| --- | ---: | --- |
| `qwen3:1.7b` | 1.4 GB | Faster responses and low-memory computers |
| `qwen3:4b` | 2.5 GB | Balanced general-purpose assistant |
| `qwen2:7b` | 4.4 GB | Current default; better quality but slower on CPU |
| `qwen3:8b` | 5.2 GB | Higher quality with more available memory |
| `qwen3:14b` | 9.3 GB | Stronger hardware and GPU use |

Install another model with:

```powershell
ollama pull qwen3:4b
```

Model memory usage is usually higher than its download size. Exact speed and memory requirements depend on the quantization, context length, CPU, GPU, and operating system.

## Configuration

Local Chat supports these environment variables:

| Variable | Default | Description |
| --- | --- | --- |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Address of the Ollama API |
| `DEFAULT_MODEL` | `qwen2:7b` | Model selected when available |

Windows PowerShell example:

```powershell
$env:OLLAMA_URL = "http://127.0.0.1:11434"
$env:DEFAULT_MODEL = "qwen3:4b"
uvicorn app:app --reload
```

Linux or macOS example:

```bash
OLLAMA_URL=http://127.0.0.1:11434 \
DEFAULT_MODEL=qwen3:4b \
uvicorn app:app --reload
```

The `.env.example` file documents the available values. The application does not load `.env` files automatically; export the variables in your shell or configure them through your process manager.

## Assistant behavior

The backend includes an original, ChatGPT-style system prompt that asks the model to:

- answer directly and politely;
- remain concise unless more detail is useful;
- acknowledge uncertainty instead of inventing information;
- remember relevant conversation context;
- match the user's language and experience level;
- provide practical and complete code examples when appropriate.

You can edit the system prompt from the settings dialog. Browser settings take precedence over the backend default and are saved locally.

## Project structure

```text
local_ai_project/
├── app.py                 # FastAPI server and Ollama streaming proxy
├── requirements.txt       # Python dependencies
├── .env.example           # Configuration reference
└── static/
    ├── index.html         # Application markup
    ├── styles.css         # Interface styling
    └── app.js             # Conversations, settings, and streaming UI
```

## API

### Health and models

```http
GET /api/health
```

Returns Ollama availability, installed model names, the default model, and the default system prompt.

### Stream a response

```http
POST /api/chat
Content-Type: application/json
```

Example request:

```json
{
  "model": "qwen2:7b",
  "messages": [
    {"role": "user", "content": "Explain recursion simply."}
  ],
  "temperature": 0.7,
  "top_p": 0.9
}
```

The response uses newline-delimited JSON (`application/x-ndjson`) with `content`, `done`, or `error` events.

## Troubleshooting

### Cannot connect to Ollama

Confirm that Ollama is running:

```powershell
ollama list
```

Then check its API:

```powershell
Invoke-RestMethod http://127.0.0.1:11434/api/tags
```

### Model not found

Download the exact model shown in the error, then refresh the browser:

```powershell
ollama pull qwen2:7b
```

### Responses are slow

Inspect where Ollama loaded the model:

```powershell
ollama ps
```

CPU-only inference is expected to be slower. Use `qwen3:1.7b` or `qwen3:4b` for better CPU performance, shorten long conversations, or use a supported GPU.

### Markdown formatting is unavailable offline

The page currently loads `marked.min.js` from a CDN. If the CDN cannot be reached, responses fall back to safe plain text. For a completely offline interface, download the library into `static/` and change its script path in `static/index.html`.

## Production deployment

Do **not** expose the development server directly to the public internet. The current project does not include authentication, per-user data separation, rate limiting, or abuse protection.

For a private production deployment:

1. Run Ollama and the FastAPI application on the same trusted server or private network.
2. Bind Ollama to a private interface; never publicly expose port `11434`.
3. Run Uvicorn behind an HTTPS reverse proxy such as Caddy or Nginx.
4. Add authentication and rate limiting before allowing public access.
5. Use a persistent service manager or containers to restart failed processes.
6. Use a GPU server if interactive response speed is important.

Once deployed to a remote server, the application is self-hosted and private but is no longer technically offline.

## Privacy notes

- Conversations and generation settings are stored in the current browser's local storage.
- Clearing site data removes that browser history.
- The server does not currently persist conversations.
- Ollama model files remain on the machine running Ollama.
- A remote deployment sends prompts to that server, so secure it with HTTPS and authentication.

## Development checks

Validate the backend:

```powershell
py -m py_compile app.py
```

Validate the frontend when Node.js is installed:

```powershell
node --check static/app.js
```

## Limitations

- No accounts or multi-user support
- No server-side chat database
- No file or image uploads
- No retrieval-augmented generation or web search
- No built-in authentication
- Local model quality and speed depend heavily on the selected model and hardware

These constraints keep the starter small and easy to understand while leaving room for authentication, persistent storage, document search, tools, and multi-user deployment later.
