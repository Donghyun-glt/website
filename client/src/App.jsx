import { useRef, useState } from "react";
import videoFile from "./video.mp4";

function App() {
  const videoRef = useRef(null);
  const [currentTime, setCurrentTime] = useState(0);

  function skipForward() {
    videoRef.current.currentTime += 5;
  }

  function skipBackward() {
    videoRef.current.currentTime -= 5;
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

      <video
        ref={videoRef}
        src={videoFile}
        controls
        width="600"
        onTimeUpdate={handleTimeUpdate}
      />

      <div>
        <button onClick={skipBackward}>Back 5 sec</button>
        <button onClick={skipForward}>Forward 5 sec</button>
      </div>

      <p>Current Time: {formatTime(currentTime)}</p>
    </div>
  );
}

export default App;