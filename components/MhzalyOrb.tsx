"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createMhzalyScene, type MhzalySceneApi } from "@/lib/mhzalyScene";
import { MhzalyTracker, type TrackerStatus } from "@/lib/mhzalyTracker";

type CameraState = "off" | "starting" | "on" | "error";

const MODE_LABEL: Record<TrackerStatus["mode"], string> = {
  idle: "STANDBY",
  spin: "SPIN",
  zoom: "ZOOM",
};

export default function MhzalyOrb() {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<MhzalySceneApi | null>(null);
  const trackerRef = useRef<MhzalyTracker | null>(null);

  const [camera, setCamera] = useState<CameraState>("off");
  const [status, setStatus] = useState<TrackerStatus>({ hands: 0, mode: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<string>("READY");

  // Voice recognition UI state
  const [listening, setListening] = useState<boolean>(false);
  const [lastTranscript, setLastTranscript] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const scene = createMhzalyScene(container);
    sceneRef.current = scene;
    return () => {
      trackerRef.current?.stop();
      trackerRef.current = null;
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  // Speak helper that uses /api/speak proxy then falls back to Web Speech
  const speakText = useCallback(async (text: string) => {
    setTaskStatus("AUDIO SYNTHESIS ACTIVE");
    try {
      const res = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) throw new Error(`speak proxy failed ${res.status}`);

      setTaskStatus('READY');
      return;
    } catch (proxyErr) {
      console.warn('speak proxy failed, falling back to client TTS:', proxyErr);
    }

    // Fallback to browser TTS
    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'en-US';
        utter.onend = () => setTaskStatus('READY');
        utter.onerror = (e) => {
          console.error('speechSynthesis error', e);
          setTaskStatus('SPEECH ERROR');
        };
        window.speechSynthesis.speak(utter);
        return;
      }
    } catch (ttsErr) {
      console.error('Web Speech API error:', ttsErr);
    }

    setTaskStatus('SPEECH UNAVAILABLE');
  }, []);

  // Handle tasks invoked from the HUD buttons or voice commands
  const executeMhzalyTask = useCallback(
    async (taskType: "whatsapp" | "speech", payloadText?: string) => {
      try {
        if (taskType === "whatsapp") {
          setTaskStatus("OPENING WHATSAPP");
          if (typeof window !== "undefined") window.open("https://web.whatsapp.com", "_blank");
          setTimeout(() => setTaskStatus("READY"), 1200);
          return;
        }

        if (taskType === "speech") {
          const textToSpeak = payloadText ?? "M.H.Z.A.L.Y. intelligence online. Systems fully operational.";
          await speakText(textToSpeak);
          return;
        }
      } catch (e) {
        console.error(e);
        setTaskStatus("ERROR");
      }
    },
    [speakText]
  );

  // Speech recognition setup (client-side)
  const startListening = useCallback(() => {
    const Rec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Rec) {
      setTaskStatus('VOICE RECOGNITION UNAVAILABLE');
      return;
    }

    try {
      const recog = new Rec();
      recog.lang = 'en-US';
      recog.interimResults = false;
      recog.maxAlternatives = 1;

      recog.onstart = () => {
        setListening(true);
        setTaskStatus('LISTENING');
      };

      recog.onresult = (ev: any) => {
        const transcript = Array.from(ev.results)
          .map((r: any) => r[0].transcript)
          .join(' ')
          .trim();
        setLastTranscript(transcript);
        setTaskStatus(`RECOGNIZED: ${transcript}`);

        // Simple command parsing
        const cmd = transcript.toLowerCase();

        if (cmd.includes('open whatsapp')) {
          executeMhzalyTask('whatsapp');
        } else if (cmd.includes('open youtube')) {
          if (typeof window !== 'undefined') window.open('https://www.youtube.com', '_blank');
        } else if (cmd.startsWith('search for ') || cmd.startsWith('search ')) {
          const q = cmd.replace(/^search( for)?\s+/, '');
          const url = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
          if (typeof window !== 'undefined') window.open(url, '_blank');
        } else if (cmd.startsWith('speak ') || cmd.startsWith('say ')) {
          const speakPhrase = cmd.replace(/^(speak|say)\s+/, '');
          executeMhzalyTask('speech', speakPhrase);
        } else {
          // If no explicit command, treat as a speak request
          executeMhzalyTask('speech', transcript);
        }
      };

      recog.onerror = (e: any) => {
        console.error('recognition error', e);
        setTaskStatus('VOICE ERROR');
      };

      recog.onend = () => {
        setListening(false);
        // keep last transcript visible in status for a short time
        setTimeout(() => setTaskStatus('READY'), 2000);
      };

      recog.start();

      // store the recognition instance on window so we can stop it
      (window as any).__mhzaly_recog = recog;
    } catch (err) {
      console.error('startListening failed', err);
      setTaskStatus('VOICE ERROR');
    }
  }, [executeMhzalyTask]);

  const stopListening = useCallback(() => {
    const recog = (window as any).__mhzaly_recog;
    try {
      if (recog) {
        recog.onend = null;
        recog.stop();
      }
    } catch (e) {
      // ignore
    }
    setListening(false);
    setTaskStatus('READY');
  }, []);

  const stopGestures = useCallback(() => {
    trackerRef.current?.stop();
    trackerRef.current = null;
    setCamera("off");
    setStatus({ hands: 0, mode: "idle" });
  }, []);

  const startGestures = useCallback(async () => {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    if (!video || !overlay || trackerRef.current) return;

    setCamera("starting");
    setError(null);

    const tracker = new MhzalyTracker(video, overlay, {
      onRotate: (dt, dp) => sceneRef.current?.rotateBy(dt, dp),
      onZoom: (factor) => sceneRef.current?.zoomBy(factor),
      onStatus: setStatus,
    });
    trackerRef.current = tracker;

    try {
      await tracker.start();
      setCamera("on");
    } catch (err) {
      trackerRef.current = null;
      tracker.stop();
      setCamera("error");
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "CAMERA ACCESS DENIED"
          : "TRACKING INIT FAILED"
      );
    }
  }, []);

  const toggleGestures = useCallback(() => {
    if (trackerRef.current) stopGestures();
    else void startGestures();
  }, [startGestures, stopGestures]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case "+":
        case "=":
          sceneRef.current?.zoomIn();
          break;
        case "-":
        case "_":
          sceneRef.current?.zoomOut();
          break;
        case "r":
        case "R":
          sceneRef.current?.resetView();
          break;
        case "g":
        case "G":
          toggleGestures();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleGestures]);

  const cameraOn = camera === "on";

  return (
    <>
      <div ref={containerRef} className="mhzaly-root" />

      <div className="overlay-vignette" />
      <div className="overlay-grain" />
      <div className="overlay-scanlines" />

      <div className="hud hud-title">M.H.Z.A.L.Y.</div>

      <div className="hud" style={{ top: "54px", left: "24px", fontSize: "11px", opacity: 0.7, textShadow: "0 0 6px rgba(0,210,255,0.7)" }}>
        EXEC STATUS: <span style={{ color: "#80e5ff" }}>{taskStatus}</span>
      </div>

      <div className="hud hud-hint">
        <div>
          <span className="key">DRAG</span> spin&nbsp;&nbsp;
          <span className="key">SCROLL</span> zoom
        </div>
        {cameraOn ? (
          <div>
            <span className="key">PINCH + MOVE</span> spin&nbsp;&nbsp;
            <span className="key">PINCH BOTH HANDS ± SPREAD</span> zoom
          </div>
        ) : (
          <div>
            <span className="key">G</span> hand gestures&nbsp;&nbsp;
            <span className="key">R</span> reset&nbsp;&nbsp;
            <span className="key">+/−</span> zoom
          </div>
        )}
      </div>

      <div className="hud hud-controls">
        <div className={`camera-panel${cameraOn ? " visible" : ""}`}>
          <video ref={videoRef} muted playsInline className="camera-video" />
          <canvas ref={overlayRef} width={208} height={156} className="camera-overlay" />
          <div className="camera-status">
            {status.hands > 0
              ? `${status.hands} HAND${status.hands > 1 ? "S" : ""} · ${MODE_LABEL[status.mode]}`
              : "SHOW HANDS"}
          </div>
        </div>

        {error && <div className="hud-error">{error}</div>}

        <div className="hud-row">
          <button
            type="button"
            className="hud-btn"
            onClick={() => executeMhzalyTask("whatsapp")}
          >
            WHATSAPP
          </button>
          <button
            type="button"
            className="hud-btn"
            onClick={() => executeMhzalyTask("speech")}
          >
            SPEAK AI
          </button>
        </div>

        <div className="hud-row">
          <button
            type="button"
            className="hud-btn"
            aria-pressed={cameraOn}
            onClick={toggleGestures}
            disabled={camera === "starting"}
          >
            {camera === "starting" ? "INITIALIZING…" : cameraOn ? "GESTURES ON" : "GESTURES OFF"}
          </button>
        </div>

        <div className="hud-row" style={{ marginTop: 8 }}>
          <button type="button" className="hud-btn" onClick={() => sceneRef.current?.zoomIn()} aria-label="Zoom in">
            +
          </button>
          <button type="button" className="hud-btn" onClick={() => sceneRef.current?.zoomOut()} aria-label="Zoom out">
            −
          </button>
          <button type="button" className="hud-btn" onClick={() => sceneRef.current?.resetView()}>
            RESET
          </button>

          {/* Voice listen controls */}
          <div style={{ display: 'inline-block', marginLeft: 12 }}>
            <button
              type="button"
              className="hud-btn"
              onClick={() => (listening ? stopListening() : startListening())}
              aria-pressed={listening}
            >
              {listening ? 'STOP LISTENING' : 'LISTEN'}
            </button>
            {lastTranscript && <div style={{ color: '#80e5ff', marginTop: 6 }}>{lastTranscript}</div>}
          </div>
        </div>
      </div>
    </>
  );
}
