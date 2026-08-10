import os
import time
import pyautogui

# Attempt to import genai; if not available, provide a safe stub
try:
    from google import genai
    from google.genai import types
    GENAI_AVAILABLE = True
except Exception:
    genai = None
    types = None
    GENAI_AVAILABLE = False

def capture_and_analyze_screen(client=None):
    """Captures the laptop screen, sends it to the Gemini API if available, returns analysis or stub."""
    screenshot_path = "screen_capture.png"
    pyautogui.screenshot(screenshot_path)

    if not GENAI_AVAILABLE or client is None:
        # fallback: simple local stub summary
        try:
            return "GENAI client not configured. Screenshot captured. (Stub analysis)"
        finally:
            if os.path.exists(screenshot_path):
                os.remove(screenshot_path)

    try:
        with open(screenshot_path, "rb") as f:
            image_bytes = f.read()

        try:
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=[
                    types.Part.from_bytes(data=image_bytes, mime_type='image/png'),
                    "Analyze the current screen and provide a concise Urdu/English description, highlighting system status and recommended actions."
                ],
            )
            return getattr(response, "text", str(response))
        except Exception as sdk_exc:
            try:
                resp = client.responses.generate(model="gemini-2.5-flash", input=[image_bytes, "Analyze the screen."])
                return getattr(resp, "output_text", str(resp))
            except Exception:
                raise sdk_exc

    except Exception as e:
        return f"Vision processing error: {e}"
    finally:
        if os.path.exists(screenshot_path):
            os.remove(screenshot_path)

if __name__ == "__main__":
    client = None
    try:
        client = genai.Client() if GENAI_AVAILABLE else None
    except Exception:
        client = None
    analysis = capture_and_analyze_screen(client)
    print(analysis)
