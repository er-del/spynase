# Synapse AI Interface - Command Reference

This document contains all the necessary commands to run, serve, and expose the Synapse Neural AI Interface. 

## Prerequisites

Before running the application, make sure you have the following installed:
- [Node.js & npm](https://nodejs.org/) (for serving the app and running the tunnel)
- [Ollama](https://ollama.com/) (for the local LLM)

---

## 1. Starting the LLM Backend (Ollama)

Synapse relies on a local instance of Ollama to process AI responses. You need to have Ollama running in the background.

**Command to start Ollama (if not already running as a service):**
```bash
ollama serve
```

*Note: Ensure you have at least one model pulled in Ollama (e.g., `ollama run llama3` or `ollama run mistral`) so it appears in the dropdown.*

---

## 2. Running the Local Web Server

To view the interface locally, you need to serve the project files over HTTP. We use `http-server` for this.

**Command to start the local server:**
```bash
npx -y http-server . -p 8080 --cors
```

- **`-p 8080`**: Serves the application on port 8080.
- **`--cors`**: Enables Cross-Origin Resource Sharing, which can help prevent any blocking issues when the frontend talks to the local Ollama instance.

Once running, you can access the interface at: **http://localhost:8080** or **http://127.0.0.1:8080**

---

## 3. Creating a Public Tunnel (Cloudflare)

If you want to access the Synapse interface over the internet (e.g., from your phone or another computer outside your network), you can use a Cloudflare Quick Tunnel. 

*Ensure your local server (Step 2) is already running before starting the tunnel.*

**Command to create the public tunnel:**
```bash
npx -y cloudflared tunnel --url http://localhost:8080
```

After running this command, look at the terminal output. It will provide a temporary public URL that looks like this:
`https://<random-words>.trycloudflare.com`

**Important Notes for Tunnels:**
- This is a *Quick Tunnel*, meaning it does not require a Cloudflare account.
- The URL is temporary and will change every time you restart this command.
- Leave this terminal window running as long as you want the application to be publicly accessible.

---

## Summary of Workflow
If you are starting fresh, open three separate terminal windows/tabs and run one of these commands in each:

**Terminal 1:**
```bash
ollama serve
```

**Terminal 2:**
```bash
npx -y http-server . -p 8080 --cors
```

**Terminal 3:**
```bash
npx -y cloudflared tunnel --url http://localhost:8080
```
