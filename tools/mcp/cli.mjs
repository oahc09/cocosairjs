#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.mjs';
import { openBrowser } from './browser.mjs';

const args = process.argv.slice(2);
let url;
let writable = false;
for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url' && args[i + 1]) url = args[++i];
    else if (args[i] === '--writable') writable = true;
    else throw new Error('Usage: node tools/mcp/cli.mjs --url http://127.0.0.1:7454/hello-cube/ [--writable]');
}
if (!url) throw new Error('--url is required; no existing user browser is attached.');
const adapter = await openBrowser({ url, writable, executablePath: process.env.AIR_CHROMIUM });
const server = createServer(adapter);
let stopping = false;
async function stop() {
    if (stopping) return;
    stopping = true;
    await adapter.close();
    await server.close();
}
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
process.stdin.once('end', () => void stop());
await server.connect(new StdioServerTransport());
