#!/usr/bin/env bash
set -e

# ─── Colors ────────────────────────────────────────────────────
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo -e "${CYAN}${BOLD} ╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}${BOLD} ║            SYNAPSE — Neural AI Interface                ║${NC}"
echo -e "${CYAN}${BOLD} ║           Production Launcher (Linux / macOS)           ║${NC}"
echo -e "${CYAN}${BOLD} ╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# ─── Check Node.js ─────────────────────────────────────────────
echo -e "${BOLD}[1/4] Checking Node.js...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "  ${RED}❌  Node.js is NOT installed.${NC}"
    echo -e "      Install it with one of these commands:"
    echo -e "        macOS:  ${YELLOW}brew install node${NC}"
    echo -e "        Ubuntu: ${YELLOW}curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt-get install -y nodejs${NC}"
    exit 1
fi
NODE_VER=$(node -v)
echo -e "  ${GREEN}✅  Node.js ${NODE_VER} found.${NC}"

# ─── Install Dependencies ─────────────────────────────────────
echo ""
echo -e "${BOLD}[2/4] Installing dependencies...${NC}"
if [ ! -d "node_modules" ]; then
    npm install --silent
    echo -e "  ${GREEN}✅  Dependencies installed.${NC}"
else
    echo -e "  ${GREEN}✅  Dependencies already installed.${NC}"
fi

# ─── Check Ollama ──────────────────────────────────────────────
echo ""
echo -e "${BOLD}[3/4] Checking Ollama...${NC}"
if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo -e "  ${GREEN}✅  Ollama is running.${NC}"
else
    echo -e "  ${YELLOW}⚠️   Ollama is not running on localhost:11434.${NC}"
    if command -v ollama &> /dev/null; then
        echo -e "      Starting Ollama in the background..."
        ollama serve &> /dev/null &
        sleep 3
        if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
            echo -e "  ${GREEN}✅  Ollama started successfully.${NC}"
        else
            echo -e "  ${YELLOW}⚠️   Could not start Ollama. Please start it manually: ollama serve${NC}"
            echo -e "      The UI will still launch, but AI features won't work."
        fi
    else
        echo -e "  ${RED}❌  Ollama is not installed.${NC}"
        echo -e "      Install it: ${YELLOW}curl -fsSL https://ollama.com/install.sh | sh${NC}"
        echo -e "      The UI will still launch, but AI features won't work."
    fi
fi

# ─── Launch ────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}[4/4] Launching Synapse...${NC}"
echo ""
echo -e "  ┌──────────────────────────────────────────────────────┐"
echo -e "  │  Local:   ${CYAN}http://localhost:8080${NC}                      │"
echo -e "  │  Tunnel:  Check the TUNNEL log below for public URL │"
echo -e "  │                                                      │"
echo -e "  │  Press Ctrl+C to stop all services.                 │"
echo -e "  └──────────────────────────────────────────────────────┘"
echo ""

# Run server + tunnel together
npm run tunnel
