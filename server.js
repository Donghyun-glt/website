const express = require("express");
const path = require("path");
const fs = require("fs");
const os = require("os");
const cors = require("cors");
const multer = require("multer");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const ffmpegPath = require("ffmpeg-static");
const { spawn } = require("child_process");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.use(cors());
app.use(express.json({ limit: "20mb" }));

// uploaded video is temporarily saved in OS temp folder
const upload = multer({
  dest: os.tmpdir()
});

/*
  video file -> wav audio file
*/
function extractAudioFromVideo(videoPath, audioPath) {
  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-i", videoPath,
      "-vn",
      "-ac", "1",
      "-ar", "16000",
      "-c:a", "pcm_s16le",
      "-f", "wav",
      audioPath
    ];

    const ffmpeg = spawn(ffmpegPath, args);

    let errorOutput = "";

    ffmpeg.stderr.on("data", data => {
      errorOutput += data.toString();
    });

    ffmpeg.on("close", code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg failed: ${errorOutput}`));
      }
    });
  });
}

/*
  Whisper words -> timeline intervals

  Example:
  words:
  [
    { word: "hello", start: 1, end: 2 },
    { word: "there", start: 2.2, end: 3 }
  ]

  result:
  [
    { start: 0, end: 1, type: "silent", text: "" },
    { start: 1, end: 3, type: "speech", text: "hello there" }
  ]
*/
function buildTimelineFromWords(words, videoDuration) {
  const timeline = [];

  if (!words || words.length === 0) {
    return [
      {
        start: 0,
        end: videoDuration || 0,
        type: "silent",
        text: ""
      }
    ];
  }

  const gapThreshold = 1.0;

  // silence before first spoken word
  if (words[0].start > 0.3) {
    timeline.push({
      start: 0,
      end: Number(words[0].start.toFixed(2)),
      type: "silent",
      text: ""
    });
  }

  let currentStart = words[0].start;
  let currentEnd = words[0].end;
  let currentText = [words[0].word];

  for (let i = 1; i < words.length; i++) {
    const prev = words[i - 1];
    const curr = words[i];

    const gap = curr.start - prev.end;

    if (gap >= gapThreshold) {
      timeline.push({
        start: Number(currentStart.toFixed(2)),
        end: Number(currentEnd.toFixed(2)),
        type: "speech",
        text: currentText.join(" ")
      });

      timeline.push({
        start: Number(prev.end.toFixed(2)),
        end: Number(curr.start.toFixed(2)),
        type: "silent",
        text: ""
      });

      currentStart = curr.start;
      currentEnd = curr.end;
      currentText = [curr.word];
    } else {
      currentEnd = curr.end;
      currentText.push(curr.word);
    }
  }

  // final speech interval
  timeline.push({
    start: Number(currentStart.toFixed(2)),
    end: Number(currentEnd.toFixed(2)),
    type: "speech",
    text: currentText.join(" ")
  });

  // silence after final spoken word
  const lastWord = words[words.length - 1];

  if (videoDuration && videoDuration - lastWord.end > 0.3) {
    timeline.push({
      start: Number(lastWord.end.toFixed(2)),
      end: Number(videoDuration.toFixed(2)),
      type: "silent",
      text: ""
    });
  }

  return timeline;
}

/*
  POST /api/analyze-video

  Client sends:
  FormData:
    video: File
*/
app.post("/api/analyze-video", upload.single("video"), async (req, res) => {
  let videoPath;
  let audioPath;

  try {
    if (!req.file) {
      return res.status(400).json({
        error: "No video uploaded"
      });
    }

    videoPath = req.file.path;
    audioPath = path.join(os.tmpdir(), `${req.file.filename}.wav`);

    console.log("Video uploaded:", videoPath);

    console.log("Extracting audio...");
    await extractAudioFromVideo(videoPath, audioPath);

    console.log("Sending audio to Whisper...");
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioPath),
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["word"]
    });

    const words = transcription.words || [];
    const fullTranscript = transcription.text || "";

    // Whisper verbose_json often includes duration.
    // If not, fallback to the last word end time.
    const videoDuration =
      transcription.duration ||
      (words.length > 0 ? words[words.length - 1].end : 0);

    const timeline = buildTimelineFromWords(words, videoDuration);

    res.json({
      transcript: fullTranscript,
      timeline
    });

  } catch (err) {
    console.error("Analyze video error:", err);

    res.status(500).json({
      error: err.message || "Failed to analyze video"
    });

  } finally {
    if (videoPath && fs.existsSync(videoPath)) {
      fs.unlinkSync(videoPath);
    }

    if (audioPath && fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath);
    }
  }
});

// serve React website from client/dist
app.use(express.static(path.join(__dirname, "client", "dist")));

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, "client", "dist", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});