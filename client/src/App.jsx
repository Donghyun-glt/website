import { useState } from "react";
import axios from "axios";

function App() {
  const [videoFile, setVideoFile] = useState(null);
  const [videoURL, setVideoURL] = useState("");
  const [timeline, setTimeline] = useState([]);
  const [transcript, setTranscript] = useState("");
  const [status, setStatus] = useState("Choose a video file.");

  function handleVideoChange(event) {
    const file = event.target.files[0];

    if (!file) return;

    setVideoFile(file);
    setVideoURL(URL.createObjectURL(file));
    setTimeline([]);
    setTranscript("");
    setStatus("Video selected.");
  }

  async function analyzeVideo() {
    try {
      if (!videoFile) {
        setStatus("Please choose a video first.");
        return;
      }

      setStatus("Uploading and analyzing video...");

      const formData = new FormData();
      formData.append("video", videoFile);

      const response = await axios.post(
        "http://localhost:8000/api/analyze-video",
        formData
      );

      setTranscript(response.data.transcript);
      setTimeline(response.data.timeline);
      setStatus("Analysis complete.");
    } catch (err) {
      console.error(err);
      setStatus("Failed to analyze video.");
    }
  }

  return (
    <div style={styles.page}>
      <h1>Video Audio Timeline Analyzer</h1>

      <input
        type="file"
        accept="video/*"
        onChange={handleVideoChange}
      />

      <br />
      <br />

      {videoURL && (
        <video
          src={videoURL}
          controls
          width="600"
          style={styles.video}
        />
      )}

      <br />
      <br />

      <button onClick={analyzeVideo} style={styles.button}>
        Analyze Video
      </button>

      <p>{status}</p>

      <h2>Full Transcript</h2>

      <div style={styles.transcriptBox}>
        {transcript || "No transcript yet."}
      </div>

      <h2>Timeline</h2>

      <div style={styles.timelineBox}>
        {timeline.length === 0 ? (
          <div>No timeline yet.</div>
        ) : (
          timeline.map((item, index) => (
            <div key={index} style={styles.timelineItem}>
              {item.start} - {item.end}{" "}
              {item.type}: {item.text}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    fontFamily: "Arial, sans-serif",
    padding: "30px"
  },

  video: {
    border: "1px solid black",
    marginTop: "10px"
  },

  button: {
    padding: "10px 20px",
    fontSize: "16px",
    cursor: "pointer"
  },

  transcriptBox: {
    background: "#f2f2f2",
    padding: "15px",
    width: "600px",
    minHeight: "60px",
    borderRadius: "8px"
  },

  timelineBox: {
    background: "black",
    color: "lime",
    padding: "20px",
    width: "600px",
    minHeight: "200px",
    fontFamily: "monospace",
    whiteSpace: "pre-wrap",
    borderRadius: "8px"
  },

  timelineItem: {
    marginBottom: "8px"
  }
};

export default App;