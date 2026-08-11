## Optional voice dependencies

The voice features (microphone listening and Edge TTS) are optional and require native or external dependencies (e.g., SpeechRecognition, PyAudio/system microphone drivers, edge_tts, pygame).

If you run Streamlit in an environment without a microphone or the optional packages installed, the UI will show a warning and the voice microphone button will be disabled (no crash).

To enable voice features locally:

1. Create and activate a virtual environment:
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # Windows: .venv\Scripts\activate
   ```
2. Install requirements:
   ```bash
   pip install -r requirements.txt
   ```
3. (Optional) If you use PyAudio on Windows, follow instructions to install the appropriate wheel for your Python version.

Running voice tests locally (optional):

The repository includes an optional smoke test that is skipped by default. To run it set the environment variable RUN_VOICE_TESTS=1 and run pytest:

```bash
export RUN_VOICE_TESTS=1
pytest tests/test_voice_optional.py
```
