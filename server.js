const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');

const app = express();
const PORT = 8080;

// Serve all static files from the root directory
app.use(express.static(path.join(__dirname, '.')));

// Proxy all requests to /api directly to the local Ollama instance
app.use('/api', createProxyMiddleware({
    target: 'http://127.0.0.1:11434/api',
    changeOrigin: true,
    pathRewrite: {
        '^/api': '', // Remove the /api from the incoming request so it appends nicely to target
    },
    // Disable timeout for long-streaming LLM responses
    proxyTimeout: 0,
    timeout: 0,
    onProxyReq: (proxyReq, req, res) => {
        // Essential for streaming
        proxyReq.setHeader('Connection', 'keep-alive');
    },
    onError: (err, req, res) => {
        console.error('[Proxy Error] Could not reach Ollama:', err.message);
        res.status(502).json({ error: 'Ollama is offline or unreachable on localhost:11434' });
    }
}));

// Fallback to index.html for unknown routes (SPA behavior)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n=========================================`);
    console.log(`🚀 Synapse Server running at:`);
    console.log(`   http://localhost:${PORT}`);
    console.log(`   (Proxying /api to Ollama at :11434)`);
    console.log(`=========================================\n`);
});
