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
  const [linkFallback, setLinkFallback] = useState<string | null>(null);
  const [continuous, setContinuous] = useState<boolean>(false);

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

  // Play binary audio (ArrayBuffer) in browser
  const playAudioBuffer = useCallback(async (buffer: ArrayBuffer, contentType: string) => {
    try {
      // Use blob URL for simple playback for common audio types (wav/mp3/ogg)
      const blob = new Blob([buffer], { type: contentType });
      const url = URL.createObjectURL(blob);
      const audio = new Audio();
      audio.src = url;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        setTaskStatus('READY');
      };
      audio.onerror = (e) => {
        console.error('audio playback error', e);
        URL.revokeObjectURL(url);
        setTaskStatus('SPEECH ERROR');
      };
      await audio.play();
    } catch (e) {
      console.error('playAudioBuffer failed', e);
      setTaskStatus('SPEECH ERROR');
    }
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

      const contentType = res.headers.get('content-type') || '';

      if (contentType.startsWith('audio/')) {
        const buf = await res.arrayBuffer();
        await playAudioBuffer(buf, contentType);
        return;
      }

      // otherwise assume json/text and just mark ready
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
  }, [playAudioBuffer]);

  // Handle tasks invoked from the HUD buttons or voice commands
  const executeMhzalyTask = useCallback(
    async (taskType: "whatsapp" | "speech", payloadText?: string) => {
      try {
        // ensure control window exists so navigation won't be blocked
        let controlWin: Window | null = (window as any).__mhzaly_controlWin || null;
        if (typeof window !== 'undefined' && !controlWin) {
          try {
            controlWin = window.open('about:blank', 'mhzaly_control');
            if (controlWin) (window as any).__mhzaly_controlWin = controlWin;
          } catch (e) {
            controlWin = null;
          }
        }

        if (taskType === "whatsapp") {
          setTaskStatus("OPENING WHATSAPP");
          const url = 'https://web.whatsapp.com';
          if (controlWin) {
            controlWin.location.href = url;
            controlWin.focus();
            await speakText('Yes sir. I opened WhatsApp Web.');
          } else {
            const win = window.open(url, '_blank');
            if (!win) {
              setLinkFallback(url);
              setTaskStatus('POPUP BLOCKED');
            } else {
              await speakText('Yes sir. I opened WhatsApp Web.');
            }
          }
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
      console.debug('SpeechRecognition not available');
      setTaskStatus('VOICE RECOGNITION UNAVAILABLE');
      return;
    }

    try {
      // open a control window on the user gesture so later navigation isn't blocked
      try {
        if (typeof window !== 'undefined' && !(window as any).__mhzaly_controlWin) {
          const cw = window.open('about:blank', 'mhzaly_control');
          if (cw) (window as any).__mhzaly_controlWin = cw;
          else {
            // popup blocked at gesture time — set fallback so user can click manually
            setLinkFallback('about:blank');
            setTaskStatus('POPUP BLOCKED');
          }
        }
      } catch (e) {
        // ignore
      }

      const recog = new Rec();
      recog.lang = 'en-US';
      recog.interimResults = false;
      recog.maxAlternatives = 1;
      recog.continuous = continuous;

      recog.onstart = () => {
        console.debug('recognition onstart');
        setListening(true);
        setTaskStatus('LISTENING');
      };

      recog.onresult = (ev: any) => {
        console.debug('recognition onresult', ev);
        const transcript = Array.from(ev.results)
          .map((r: any) => r[0].transcript)
          .join(' ')
          .trim();
        setLastTranscript(transcript);
        setTaskStatus(`RECOGNIZED: ${transcript}`);

        // Simple command parsing (extended)
        const cmd = transcript.toLowerCase();

        // prefer control window navigation to avoid popup blockers
        const controlWin: Window | null = (window as any).__mhzaly_controlWin || null;

        const navigateOrOpen = async (url: string, confirmation: string) => {
          if (controlWin) {
            try {
              controlWin.location.href = url;
              controlWin.focus();
              await speakText(confirmation);
            } catch (err) {
              console.warn('control window navigation failed', err);
              const w = window.open(url, '_blank');
              if (!w) {
                setLinkFallback(url);
                setTaskStatus('POPUP BLOCKED');
              } else {
                await speakText(confirmation);
              }
            }
          } else {
            const w = window.open(url, '_blank');
            if (!w) {
              setLinkFallback(url);
              setTaskStatus('POPUP BLOCKED');
            } else {
              (window as any).__mhzaly_controlWin = w;
              await speakText(confirmation);
            }
          }
        };

        (async () => {
          if (cmd.includes('open whatsapp')) {
            await navigateOrOpen('https://web.whatsapp.com', 'Yes sir. I opened WhatsApp Web.');
          } else if (cmd.includes('call ')) {
            const target = cmd.replace(/^.*call\s+/, '').trim();
            const digits = target.replace(/\D/g, '');
            if (digits.length >= 6) {
              const url = `https://wa.me/${digits}`;
              await navigateOrOpen(url, `Yes sir. Opening WhatsApp call link for ${target}.`);
            } else {
              // open WhatsApp web and search for contact name
              const url = `https://web.whatsapp.com`;
              await navigateOrOpen(url, `Yes sir. I opened WhatsApp. Please choose the contact ${target} to call.`);
            }
          } else if (cmd.includes('open youtube')) {
            // support "open youtube and search for cats"
            const match = cmd.match(/search (for )?(.+)$/);
            if (match && match[2]) {
              const q = match[2].trim();
              const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
              await navigateOrOpen(url, `Yes sir. I opened YouTube and searched for ${q}.`);
            } else {
              await navigateOrOpen('https://www.youtube.com', 'Yes sir. I opened YouTube.');
            }
          } else if (cmd.includes('open gmail') || cmd.includes('open email')) {
            await navigateOrOpen('https://mail.google.com', 'Yes sir. I opened Gmail.');
          } else if (cmd.includes('open github')) {
            await navigateOrOpen('https://github.com', 'Yes sir. I opened GitHub.');
          } else if (cmd.startsWith('search for ') || cmd.startsWith('search ')) {
            const q = cmd.replace(/^search( for)?\s+/, '');
            const url = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
            await navigateOrOpen(url, `Yes sir. I searched Google for ${q}.`);
          } else if (cmd.startsWith('speak ') || cmd.startsWith('say ')) {
            const speakPhrase = cmd.replace(/^(speak|say)\s+/, '');
            executeMhzalyTask('speech', speakPhrase);
          } else if (cmd.includes('what time') || cmd.includes("what's the time") || cmd.includes('tell time')) {
            const now = new Date();
            const timeStr = now.toLocaleTimeString();
            executeMhzalyTask('speech', `The time is ${timeStr}`);
          } else if (cmd.includes('stop listening') || cmd.includes('stop')) {
            stopListening();
          } else {
            // If no explicit command, treat as a speak request
            executeMhzalyTask('speech', transcript);
          }
        })();
      };

      recog.onerror = (e: any) => {
        console.error('recognition error', e);
        setTaskStatus('VOICE ERROR');
      };

      recog.onend = () => {
        console.debug('recognition onend');
        setListening(false);
        // If continuous mode is enabled, restart recognition automatically
        if (continuous) {
          console.debug('restarting recognition due to continuous mode');
          setTimeout(() => startListening(), 200);
        } else {
          setTimeout(() => setTaskStatus('READY'), 2000);
        }
      };

      recog.start();

      // store the recognition instance on window so we can stop it
      (window as any).__mhzaly_recog = recog;
    } catch (err) {
      console.error('startListening failed', err);
      setTaskStatus('VOICE ERROR');
    }
  }, [executeMhzalyTask, continuous, speakText]);

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
            <label style={{ marginLeft: 8, fontSize: 12 }}>
              <input type="checkbox" checked={continuous} onChange={(e) => setContinuous(e.target.checked)} /> continuous
            </label>
            {lastTranscript && <div style={{ color: '#80e5ff', marginTop: 6 }}>{lastTranscript}</div>}
            {linkFallback && (
              <div style={{ marginTop: 8 }}>
                <div style={{ color: '#ffcc66' }}>Popup was blocked — click link:</div>
                <a href={linkFallback} target="_blank" rel="noreferrer" className="hud-btn" style={{ display: 'inline-block', marginTop: 6 }}>{linkFallback}</a>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
