import { useRef, useState } from "react";
import VoiceCommand from "./VoiceCommand";

function App() {
  const videoRef = useRef(null);

  const [videoURL, setVideoURL] = useState("");
  const [currentTime, setCurrentTime] = useState(0);

  function handleVideoUpload(event) {
    const file = event.target.files[0];

    if (!file) {
      return;
    }

    const url = URL.createObjectURL(file);
    setVideoURL(url);
    setCurrentTime(0);
  }

  function skipForward() {
    if (!videoRef.current) {
      return;
    }

    videoRef.current.currentTime += 5;
  }

  function skipBackward() {
    if (!videoRef.current) {
      return;
    }

    videoRef.current.currentTime = Math.max(
      videoRef.current.currentTime - 5,
      0
    );
  }

  function handleTimeUpdate() {
    setCurrentTime(videoRef.current.currentTime);
  }

  function formatTime(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);

    return `${min}:${sec.toString().padStart(2, "0")}`;
  }

  return (
    <div>
      <h1>Video Player</h1>

      <input
        type="file"
        accept="video/*"
        onChange={handleVideoUpload}
      />

      {videoURL && (
        <>
          <br />
          <br />

          <video
            ref={videoRef}
            src={videoURL}
            controls
            width="600"
            onTimeUpdate={handleTimeUpdate}
          />

          <div>
            <button onClick={skipBackward}>Back 5 sec</button>
            <button onClick={skipForward}>Forward 5 sec</button>
          </div>

          <p>Current Time: {formatTime(currentTime)}</p>

          <VoiceCommand />
        </>
      )}
    </div>
  );
}

export default App;