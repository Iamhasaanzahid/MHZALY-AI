# MHZALY-AI-Assistant

A voice-enabled AI assistant (MHZALY) with desktop automation, messaging helpers, vision analysis, and safety-focused security tooling.

Features
- Voice interaction using a microphone (SpeechRecognition + Edge TTS).
- Multi-language support (Urdu, English, Spanish, Arabic, French, German, Chinese).
- Desktop automation (open apps/sites, screenshots, volume control).
- WhatsApp web deep-link helper and safe call stub.
- Vision helper (screenshot -> Gemini/genai API) — optional and requires API credentials.
- Security helpers: secret scanning, pip-audit/bandit integration, structured audit logs.
- GitHub Actions workflow to run pip-audit & bandit on pushes/PRs.

Quick setup (local)
1. Clone:
   git clone https://github.com/Iamhasaanzahid/MHZALY-AI-Assistant.git
   cd MHZALY-AI-Assistant

2. Create a virtualenv and install dependencies:
   python -m venv .venv
   source .venv/bin/activate  # Windows: .venv\Scripts\activate
   pip install -r requirements.txt

3. Add credentials via environment variables or a .env file (do NOT commit .env):
   - For TTS (Edge) and SR you may not need API keys; for genai/Gemini you need your provider's key.
   - Example: SAFE_MODE=true ALLOWED_RECIPIENTS="+1234567890"

4. Run the Streamlit UI:
   streamlit run app.py

Notes & security
- SAFE_MODE defaults to true. Keep it true while testing to require interactive confirmations.
- Do not store secrets in the repo. Use environment variables or a secrets manager.
- CI: a GitHub Actions workflow runs pip-audit and bandit to surface vulnerable dependencies and common insecure patterns.

Testing
- Run a quick automation test:
  python -c "from automation import EnterpriseAutomationEngine; e=EnterpriseAutomationEngine(); print(e.handle_command('open github'))"
- Voice test (requires microphone):
  python -c "import voice_engine; print(voice_engine.listen_user())"

Contributing
- Create a feature branch, run tests locally, open a pull request. Security fixes or dependency updates are welcome.

License
- Add license file as appropriate.
