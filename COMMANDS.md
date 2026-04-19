# Synapse AI Interface - Ultimate Reference Guide

This document contains everything you need to know to set up, run, and host the Synapse Neural AI Interface on your own hardware. 

## 1. Prerequisites: Install Node.js & npm

Synapse requires **Node.js** and **npm** to run the local web server and the Cloudflare tunnel. You can install them via the Command Line Interface (CLI):

### Windows (using winget)
```bash
winget install OpenJS.NodeJS
```

### macOS (using Homebrew)
```bash
brew install node
```

### Linux (Ubuntu/Debian)
```bash
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs
```

---

## 2. Quick Start: Install Ollama

Synapse requires **Ollama** to run the backend Language Models locally.

### Download Links
- **Windows:** [Download Ollama for Windows](https://ollama.com/download/OllamaSetup.exe)
- **macOS:** [Download Ollama for Mac](https://ollama.com/download/Ollama-darwin.zip)
- **Linux:** Run the following command in your terminal:
  ```bash
  curl -fsSL https://ollama.com/install.sh | sh
  ```

---

## 3. Choosing the Right Model (GPU VRAM Guide)

Depending on your graphics card memory (VRAM), you should pull different models to ensure fast, real-time generation for the Synapse visualization.

| Your GPU VRAM | Recommended Models | Command to Install | Notes |
|---|---|---|---|
| **4GB - 6GB** | Phi-3 (3B)<br>Qwen 2 (1.5B) | `ollama run phi3`<br>`ollama run qwen2:1.5b` | Extremely fast, perfect for older laptops and budget GPUs. |
| **8GB - 12GB** | Llama 3 (8B)<br>Mistral (7B) | `ollama run llama3`<br>`ollama run mistral` | The sweet spot for quality and speed. Great for RTX 3060/4060. |
| **16GB - 20GB** | Mixtral 8x7b<br>Command R (35B) | `ollama run mixtral`<br>`ollama run command-r` | Heavy logic, great for high-end cards or Mac M-series. |
| **24GB+** | Llama 3 (70B)<br>Qwen 2 (72B) | `ollama run llama3:70b` | Studio-grade performance (RTX 3090/4090). Will run slowly on CPU. |

---

## 4. Step-by-step Workflow

If you are starting fresh, open three separate terminal windows/tabs and run the following commands.

### Step 1: Start the LLM Backend
Start the Ollama server in the background so Synapse can connect to it.
```bash
ollama serve
```

### Step 2: Serve the Interface
Navigate to your project folder and start the local HTTP server.
```bash
npx -y http-server . -p 8080 --cors
```
*You can now open your browser and visit **http://localhost:8080***

### Step 3: Expose to the Internet (Optional)
Create a quick Cloudflare Tunnel to access your interface remotely from your phone or share it with friends.
```bash
npx -y cloudflared tunnel --url http://localhost:8080
```
*Look for the `https://<random>.trycloudflare.com` link in the terminal output.*

---

## 5. Troubleshooting & GPU Drivers (Nvidia / CUDA)

Ollama automatically tries to use your GPU. If you have an NVIDIA GPU (like an RTX series or a Datacenter **Tesla P100**) but Ollama is running slowly on the CPU, you may need to install or update your CUDA drivers.

### Checking GPU Status
Run this command to check if your Nvidia drivers are recognized:
```bash
nvidia-smi
```

### Installing CUDA (Ubuntu / Debian Linux)
If `nvidia-smi` fails or CUDA is missing (especially on cloud instances or older cards like the P100), install the drivers using these commands:

1. **Add the NVIDIA package repositories:**
```bash
wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-keyring_1.1-1_all.deb
sudo dpkg -i cuda-keyring_1.1-1_all.deb
sudo apt-get update
```

2. **Install the Nvidia Driver & CUDA Toolkit:**
*(Note: Older architecture like Pascal/P100 works best with CUDA 11.8+)*
```bash
sudo apt-get install -y cuda-toolkit-11-8
sudo apt-get install -y nvidia-driver-535
```

3. **Reboot your system:**
```bash
sudo reboot
```

After rebooting, running `nvidia-smi` should display your GPU, and Ollama will automatically offload models to the VRAM.
