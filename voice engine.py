import asyncio
import os
import pygame
import speech_recognition as sr
from edge_tts import Communicate
from typing import Optional

LANGUAGE_VOICES = {
    "ur": "ur-PK-UzmaNeural",
    "en": "en-US-AndrewNeural",
    "es": "es-ES-ElenaNeural",
    "ar": "ar-SA-HamdanNeural",
    "fr": "fr-FR-DeniseNeural",
    "de": "de-DE-KatjaNeural",
    "zh": "zh-CN-XiaoxiaoNeural"
}

def listen_user(timeout: float = 6.0, phrase_time_limit: float = 8.0) -> Optional[str]:
    recognizer = sr.Recognizer()
    try:
        with sr.Microphone() as source:
            print("\nListening for input...")
            recognizer.adjust_for_ambient_noise(source, duration=0.8)
            audio = recognizer.listen(source, timeout=timeout, phrase_time_limit=phrase_time_limit)
            text = recognizer.recognize_google(audio)
            print(f"You said: {text}")
            return text
    except sr.WaitTimeoutError:
        print("Listening timed out (no speech).")
        return None
    except sr.UnknownValueError:
        print("Could not understand audio.")
        return None
    except sr.RequestError as e:
        print(f"Speech recognition service error: {e}")
        return None
    except Exception as e:
        print(f"Unexpected microphone error: {e}")
        return None

async def _edge_tts_save(text: str, voice_name: str, output_file: str) -> None:
    communicate = Communicate(text, voice_name)
    await communicate.save(output_file)

def play_audio_file(output_file: str):
    """Platform-friendly playback using pygame with safe init/quit."""
    try:
        pygame.mixer.init()
        pygame.mixer.music.load(output_file)
        pygame.mixer.music.play()
        while pygame.mixer.music.get_busy():
            pygame.time.Clock().tick(10)
    except Exception as e:
        print(f"Audio playback failed: {e}")
    finally:
        try:
            pygame.mixer.music.unload()
        except Exception:
            pass
        try:
            pygame.mixer.quit()
        except Exception:
            pass
        if os.path.exists(output_file):
            os.remove(output_file)

def speak_text(text: str, lang_code: str = "en"):
    voice = LANGUAGE_VOICES.get(lang_code, "en-US-AndrewNeural")
    print(f"MHZALY: {text}")

    output_file = "response.mp3"
    try:
        # If an asyncio loop is running (e.g., inside Streamlit), run the coroutine in a thread
        try:
            loop = asyncio.get_running_loop()
            loop_running = True
        except RuntimeError:
            loop_running = False

        if loop_running:
            import threading
            def _save_and_play():
                asyncio.run(_edge_tts_save(text, voice, output_file))
                play_audio_file(output_file)
            t = threading.Thread(target=_save_and_play, daemon=True)
            t.start()
            t.join()
        else:
            asyncio.run(_edge_tts_save(text, voice, output_file))
            play_audio_file(output_file)
    except Exception as e:
        print(f"TTS Error: {e}")

if __name__ == "__main__":
    while True:
        user_input = listen_user()
        if user_input:
            speak_text(user_input, lang_code="en")
