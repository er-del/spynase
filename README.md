# Synapse — Neural AI Interface

<div align="center">

### A futuristic local AI assistant with real-time neural network visualization

**Chat with local LLMs** · **Live 3D Neural Sphere** · **Voice Mode** · **Public Sharing**

---

</div>

## ✨ Features

- 🧠 **Local LLM Chat** — Powered by [Ollama](https://ollama.com). All inference stays on your machine.
- 🌐 **3D Neural Sphere** — Real-time holographic visualization that reacts to token generation with energy filaments, lightning arcs, and orbital rings.
- 🎙️ **Voice Mode** — Fullscreen voice-driven interaction with speech-to-text and text-to-speech.
- ⚡ **Web Grid Floor** — A sci-fi perspective grid beneath the sphere with scanning pulses and glowing nodes.
- 🔗 **Public Tunnel** — Instantly share your interface with anyone via a Cloudflare tunnel.
- 🎨 **Adaptive Moods** — The sphere changes color palette based on AI state (thinking, speaking, idle).

---

## 🚀 1-Click Setup

### Windows
1. Install [Node.js](https://nodejs.org/) (or run `winget install OpenJS.NodeJS`).
2. Install [Ollama](https://ollama.com/download/OllamaSetup.exe) and pull a model (e.g. `ollama run llama3`).
3. **Double-click `start.bat`** — that's it!

### macOS / Linux
1. Install Node.js (`brew install node` or `sudo apt install nodejs`).
2. Install Ollama (`curl -fsSL https://ollama.com/install.sh | sh`) and pull a model.
3. Run the launcher:
   ```bash
   chmod +x start.sh
   ./start.sh
   ```

The launcher will automatically install dependencies, check Ollama, start the server, and create a public tunnel.

---

## 📦 Manual Setup

If you prefer running commands yourself:

```bash
# 1. Install dependencies
npm install

# 2. Start Ollama (in a separate terminal)
ollama serve

# 3. Launch the UI
npm start

# 4. (Optional) Launch UI + public tunnel together
npm run tunnel
```

---

## 🎮 GPU VRAM Guide

Choose the right model based on your graphics card memory:

| VRAM | Recommended Models | Install Command |
|---|---|---|
| **4–6 GB** | Phi-3 (3B), Qwen 2 (1.5B) | `ollama run phi3` |
| **8–12 GB** | Llama 3 (8B), Mistral (7B) | `ollama run llama3` |
| **16–20 GB** | Mixtral 8x7B, Command R | `ollama run mixtral` |
| **24 GB+** | Llama 3 (70B) | `ollama run llama3:70b` |

---

## 🛠️ CUDA Troubleshooting (NVIDIA GPUs)

If Ollama is running on CPU instead of GPU, you may need to install CUDA drivers:

```bash
# Check if your GPU is detected
nvidia-smi

# Install CUDA on Ubuntu/Debian (for Pascal/P100 and newer)
wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-keyring_1.1-1_all.deb
sudo dpkg -i cuda-keyring_1.1-1_all.deb
sudo apt-get update
sudo apt-get install -y cuda-toolkit-11-8 nvidia-driver-535
sudo reboot
```

---

## 📂 Project Structure

```
synapse-ai/
├── index.html          # Main application shell
├── css/
│   └── styles.css      # Design system & layout
├── js/
│   ├── app.js          # Main controller & state machine
│   ├── neural-sphere.js # 3D holographic sphere renderer
│   ├── voice-orb.js    # Animated voice visualization
│   ├── ollama.js       # LLM streaming client
│   ├── speech.js       # Speech recognition & TTS
│   ├── audio-analyser.js # Web Audio API bridge
│   ├── event-bus.js    # Pub/sub event system
│   └── utils.js        # Math, noise, projection helpers
├── start.bat           # Windows 1-click launcher
├── start.sh            # Linux/macOS 1-click launcher
├── COMMANDS.md         # Detailed command reference
└── package.json        # Node.js project config
```

---

## 📄 License

MIT