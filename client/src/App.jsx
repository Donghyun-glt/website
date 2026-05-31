import { useEffect, useRef, useState } from "react";
import axios from "axios";
import "./App.css";

const API = "http://localhost:8000";

function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const recognitionRef = useRef(null);

  const [videoURL, setVideoURL] = useState("");
  const [status, setStatus] = useState("Choose a video file.");
  const [listening, setListening] = useState(false);
  const [explanation, setExplanation] = useState("");

  function handleVideoFile(e) {
    const file = e.target.files[0];

    if (!file) return;

    const url = URL.createObjectURL(file);
    setVideoURL(url);
    setStatus("Video loaded.");
  }

  function skipForward() {
    const video = videoRef.current;
    if (!video) return;

    video.currentTime += 5;
  }

  function skipBackward() {
    const video = videoRef.current;
    if (!video) return;

    video.currentTime = Math.max(0, video.currentTime - 5);
  }

  async function explainCurrentFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) return;

    video.pause();
    setStatus("Capturing current frame...");

    const ctx = canvas.getContext("2d");

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageDataURL = canvas.toDataURL("image/jpeg");

    try {
      setStatus("Asking VLM to explain the frame...");

      const res = await axios.post(`${API}/api/explain-frame`, {
        image: imageDataURL
      });

      const text = res.data.explanation;

      setExplanation(text);
      setStatus("Explanation ready.");

      speak(text);
    } catch (err) {
      console.error(err);
      setStatus("Error explaining frame.");
    }
  }

  function speak(text) {
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 1;

    window.speechSynthesis.speak(utterance);
  }

  function startVoiceDetector() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setStatus("SpeechRecognition is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();

    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      const lastResult = event.results[event.results.length - 1];
      const transcript = lastResult[0].transcript.trim().toLowerCase();

      console.log("Heard:", transcript);

      if (transcript.includes("explain")) {
        explainCurrentFrame();
      }
    };

    recognition.onerror = (event) => {
      console.error(event.error);
      setStatus(`Voice error: ${event.error}`);
    };

    recognition.onend = () => {
      if (listening) {
        recognition.start();
      }
    };

    recognition.start();
    recognitionRef.current = recognition;

    setListening(true);
    setStatus('Listening for "explain"...');
  }

  function stopVoiceDetector() {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    setListening(false);
    setStatus("Voice detector stopped.");
  }

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }

      if (videoURL) {
        URL.revokeObjectURL(videoURL);
      }
    };
  }, [videoURL]);

  return (
    <div className="app">
      <h1>Video Explainer</h1>

      <input
        type="file"
        accept="video/*"
        onChange={handleVideoFile}
      />

      {videoURL && (
        <>
          <video
            ref={videoRef}
            src={videoURL}
            controls
            className="video"
          />

          <div className="buttons">
            <button onClick={skipBackward}>-5 sec</button>
            <button onClick={skipForward}>+5 sec</button>

            {!listening ? (
              <button onClick={startVoiceDetector}>
                Start Voice Detector
              </button>
            ) : (
              <button onClick={stopVoiceDetector}>
                Stop Voice Detector
              </button>
            )}

            <button onClick={explainCurrentFrame}>
              Explain Now
            </button>
          </div>
        </>
      )}

      <p className="status">{status}</p>

      {explanation && (
        <div className="explanation">
          <h2>Explanation</h2>
          <p>{explanation}</p>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden-canvas" />
    </div>
  );
}

export default App;