import asyncio
import os
import pygame
import speech_recognition as sr
from edge_tts import Communicate
from typing import Optional
import threading
import webbrowser

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
    except (sr.WaitTimeoutError, sr.UnknownValueError, sr.RequestError, Exception):
        return None

async def edge_tts_save(text: str, voice_name: str, output_file: str) -> None:
    communicate = Communicate(text, voice_name)
    await communicate.save(output_file)

def play_audio_file(output_file: str):
    pygame.mixer.init()
    pygame.mixer.music.load(output_file)
    pygame.mixer.music.play()
    while pygame.mixer.music.get_busy():
        pygame.time.Clock().tick(10)
    pygame.mixer.music.unload()
    if os.path.exists(output_file):
        os.remove(output_file)

def speak_text(text: str, lang_code: str = "en"):
    voice = LANGUAGE_VOICES.get(lang_code, "en-US-AndrewNeural")
    print(f"MHZALY: {text}")
    output_file = "response.mp3"
    
    try:
        loop = asyncio.get_running_loop()
        loop_running = True
    except RuntimeError:
        loop_running = False

    if loop_running:
        def _save_and_play():
            asyncio.run(edge_tts_save(text, voice, output_file))
            play_audio_file(output_file)
        t = threading.Thread(target=_save_and_play, daemon=True)
        t.start()
        t.join()
    else:
        asyncio.run(edge_tts_save(text, voice, output_file))
        play_audio_file(output_file)

if __name__ == "__main__":
    while True:
        user_input = listen_user()
        if user_input:
            command = user_input.lower()
            if "open whatsapp" in command:
                speak_text("Opening WhatsApp", lang_code="en")
                webbrowser.open("https://web.whatsapp.com")
            elif "open youtube" in command:
                speak_text("Opening YouTube", lang_code="en")
                webbrowser.open("https://www.youtube.com")
            else:
                speak_text(user_input, lang_code="en")
