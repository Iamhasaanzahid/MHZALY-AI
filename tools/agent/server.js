// Simple local automation agent using Express + Puppeteer
// - Run: npm install && npm start (in tools/agent)
// - Exposes POST /open-url { url }
// - Exposes POST /call { phone }
// Security: if AGENT_TOKEN env var is set, requests must include header X-MHZALY-TOKEN with the same value.
// Connection mode: if AGENT_CONNECT_URL env var is set (e.g. http://127.0.0.1:9222), the agent will connect to
// an existing Chromium instance via puppeteer.connect() instead of launching a bundled Chromium.

const express = require('express');
const bodyParser = require('body-parser');
const puppeteer = require('puppeteer');

const app = express();
app.use(bodyParser.json());

const AGENT_TOKEN = process.env.AGENT_TOKEN || null;
const AGENT_CONNECT_URL = process.env.AGENT_CONNECT_URL || null;

let browser = null;
let page = null;

// Simple middleware to validate token if configured
app.use((req, res, next) => {
  if (AGENT_TOKEN) {
    const header = req.header('x-mhzaly-token');
    if (!header || header !== AGENT_TOKEN) {
      return res.status(401).json({ error: 'unauthorized' });
    }
  }
  next();
});

async function ensureBrowser() {
  if (browser) return;

  if (AGENT_CONNECT_URL) {
    console.log('Connecting to existing browser at', AGENT_CONNECT_URL);
    try {
      browser = await puppeteer.connect({ browserURL: AGENT_CONNECT_URL });
      const pages = await browser.pages();
      page = pages[0] || (await browser.newPage());
      await page.setViewport({ width: 1280, height: 800 });
      return;
    } catch (e) {
      console.error('Failed to connect to remote browser:', e);
      // fallthrough to launching a new browser
      browser = null;
    }
  }

  console.log('Launching new browser via puppeteer.launch()');
  browser = await puppeteer.launch({ headless: false }); // headful so you can see actions
  const pages = await browser.pages();
  page = pages[0] || (await browser.newPage());
  await page.setViewport({ width: 1280, height: 800 });
}

app.post('/open-url', async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'missing url' });
  try {
    await ensureBrowser();
    await page.goto(url, { waitUntil: 'networkidle2' });
    return res.json({ ok: true });
  } catch (e) {
    console.error('open-url error', e);
    return res.status(500).json({ error: String(e) });
  }
});

app.post('/call', async (req, res) => {
  const { phone } = req.body || {};
  if (!phone) return res.status(400).json({ error: 'missing phone' });
  try {
    await ensureBrowser();
    const waLink = `https://wa.me/${phone}`;
    await page.goto(waLink, { waitUntil: 'networkidle2' });
    await page.waitForTimeout(3000);

    try {
      await page.waitForSelector('[title*="Voice call"], [aria-label*="Voice call"], button[aria-label*="Audio call"]', { timeout: 5000 });
      await page.click('[title*="Voice call"], [aria-label*="Voice call"], button[aria-label*="Audio call"]');
      return res.json({ ok: true, message: 'clicked call button' });
    } catch (inner) {
      console.warn('Could not find call button automatically:', inner);
      return res.json({ ok: false, message: 'Could not find in-page call button; opened chat' });
    }
  } catch (e) {
    console.error('call error', e);
    return res.status(500).json({ error: String(e) });
  }
});

app.post('/close', async (req, res) => {
  try {
    if (browser) {
      await browser.close();
      browser = null;
      page = null;
    }
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

app.get('/health', (req, res) => {
  res.json({ ok: true, pid: process.pid });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`mhzaly-agent listening on http://127.0.0.1:${port}`));
