Local automation agent for MHZALY

This agent uses Puppeteer to automate a browser session and expose a small HTTP API on localhost.

Setup (Node.js required):

1. Open a terminal and navigate to the tools/agent directory.
2. Install dependencies:
   npm install
3. Start the agent:
   AGENT_TOKEN=mytoken AGENT_CONNECT_URL=http://127.0.0.1:9222 npm start

Environment variables:
- AGENT_TOKEN (optional): if set, the agent requires the header `X-MHZALY-TOKEN: <token>` on requests.
- AGENT_CONNECT_URL (optional): if set, the agent will attempt to connect to an existing Chromium instance at that remote-debugging address (e.g. http://127.0.0.1:9222). If connection fails it will fall back to launching a new browser.

Endpoints:
- POST /open-url { url }
  Opens the given URL in a controlled browser window.

- POST /call { phone }
  Opens wa.me/<phone> and attempts to click the WhatsApp Web voice call button (best-effort).

- POST /close
  Closes the automated browser.

- GET /health
  Returns ok if the agent is running.

Security: agent binds to localhost only. If AGENT_TOKEN is set, requests must include header `X-MHZALY-TOKEN: <token>`.
