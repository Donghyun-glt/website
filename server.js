
// video explainer: "explain"


// const express = require("express");
// const path = require("path");
// const dotenv = require("dotenv");
// const OpenAI = require("openai");
// const cors = require("cors");

// dotenv.config();

// const app = express();
// const PORT = 8000;

// app.use(cors());
// app.use(express.json());

// const openai = new OpenAI({
//   apiKey: process.env.OPENAI_API_KEY
// });

// app.post("/api/explain-frame", async (req, res) => {
//   try {
//     const { image } = req.body;

//     if (!image) {
//       return res.status(400).json({ error: "Image is required" });
//     }

//     const response = await openai.responses.create({
//       model: "gpt-4.1-mini",
//       input: [
//         {
//           role: "user",
//           content: [
//             {
//               type: "input_text",
//               text: "Briefly explain what is happening in this video frame. Use simple language."
//             },
//             {
//               type: "input_image",
//               image_url: image
//             }
//           ]
//         }
//       ]
//     });

//     res.json({
//       explanation: response.output_text
//     });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({
//       error: "Failed to explain frame"
//     });
//   }
// });

// // serve React public website from client/dist
// app.use(express.static(path.join(__dirname, "client", "dist")));

// app.get(/.*/, (req, res) => {
//   res.sendFile(path.join(__dirname, "client", "dist", "index.html"));
// });

// app.listen(PORT, () => {
//   console.log(`Server running on http://localhost:${PORT}`);
// });







const express = require("express");
const path = require("path");
const fs = require("fs");
const cors = require("cors");
const multer = require("multer");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");


dotenv.config();

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
const PORT = process.env.PORT || 8000;

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

app.use(cors());
app.use(express.json({ limit: "20mb" }));

// when a file is uploaded, save it inside uploads/
const os = require("os");

const upload = multer({
  dest: os.tmpdir()
});

function extractAudioFromVideo(videoPath, audioPath) {
    return new Promise((resolve, reject) => {
        ffmpeg(videoPath)
            .noVideo()
            .audioCodec("libmp3lame")
            .audioFrequency(16000)
            .audioChannels(1)
            .save(audioPath)
            .on("end", resolve)
            .on("error", reject);
    });
}

function buildIntervalsFromTranscription(transcription) {
    // each word is roughly like; 
    // {
    //   word: "hello",
    //   start: 0.2,
    //   end: 0.6
    // }
    const words = transcription.words || [];

    // no words detected → treat as silent
    if (words.length === 0) {
        return [
            {
                start: 0,
                end: 0,
                audio_status: "silent",
                speech: ""
            }
        ];
    }

    const intervals = [];
    const gapThreshold = 2.0;

    let currentStart = words[0].start;
    let currentEnd = words[0].end;
    let currentWords = [words[0].word];

    for (let i = 1; i < words.length; i++) {
        const previousWord = words[i - 1];
        const currentWord = words[i];

        const gap = currentWord.start - previousWord.end;

        if (gap >= gapThreshold) {
            intervals.push({
                start: Number(currentStart.toFixed(2)),
                end: Number(currentEnd.toFixed(2)),
                audio_status: "non_silent",
                speech: currentWords.join(" ")
            });

            intervals.push({
                start: Number(previousWord.end.toFixed(2)),
                end: Number(currentWord.start.toFixed(2)),
                audio_status: "silent",
                speech: ""
            });

            currentStart = currentWord.start;
            currentEnd = currentWord.end;
            currentWords = [currentWord.word];
        } else {
            currentEnd = currentWord.end;
            currentWords.push(currentWord.word);
        }
    }

    intervals.push({
        start: Number(currentStart.toFixed(2)),
        end: Number(currentEnd.toFixed(2)),
        audio_status: "non_silent",
        speech: currentWords.join(" ")
    });

    return intervals;
}

async function classifyIntervals(intervals, fullTranscript) {
    const prompt = `
            You are analyzing a video's audio timeline.

            Classify every interval into exactly one of these labels:

            1. "silent_unimportant"
            - Use this for intervals with no meaningful speech.
            - Silent segments are always unimportant.
            - This includes actual silence, background noise, ambient sounds, animal noises, music, or other audio that does not help explain the video's core content.

            2. "non_silent_important"
            - Use this for meaningful audio that is important to understanding the video's main content, message, explanation, or narrative.

            3. "non_silent_unimportant"
            - Use this for audio that exists, but is not important to the main content.
            - Examples: filler talk, off-topic comments, repeated words, irrelevant chatter, greetings that do not matter, background speech unrelated to the topic.

            Use the whole transcript as context.

            Return JSON only.
            The JSON must be an array.
            Each item must have:
            {
            "start": number,
            "end": number,
            "label": "silent_unimportant" | "non_silent_important" | "non_silent_unimportant",
            "speech": string,
            "reason": string
            }

            Full transcript:
            ${fullTranscript}

            Intervals:
            ${JSON.stringify(intervals, null, 2)}
            `;


    const response = await openai.responses.create({
        model: "gpt-4.1-mini",
        input: prompt
    });

    const text = response.output_text;

    const cleaned = text
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

    return JSON.parse(cleaned);
}

app.post("/api/analyze-video", upload.single("video"), async (req, res) => {
    let videoPath;
    let audioPath;

    try {
        if (!req.file) {
            return res.status(400).json({
                error: "No video file uploaded"
            });
        }

        videoPath = req.file.path;
        audioPath = path.join(os.tmpdir(), `${req.file.filename}.mp3`);

        console.log("Extracting audio...");
        await extractAudioFromVideo(videoPath, audioPath);

        console.log("Transcribing audio...");
        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(audioPath),
            model: "gpt-4o-mini-transcribe",
            response_format: "verbose_json",
            timestamp_granularities: ["word"]
        });

        const fullTranscript = transcription.text || "";
        const intervals = buildIntervalsFromTranscription(transcription);

        console.log("Classifying intervals...");
        const classified = await classifyIntervals(intervals, fullTranscript);

        res.json({
            transcript: fullTranscript,
            intervals: classified
        });
    } catch (err) {
        console.error("Analyze video error:", err);

        res.status(500).json({
            error: err.message || "Failed to analyze video"
        });
    } finally {
        // Deletes the uploaded video file.
        if (videoPath && fs.existsSync(videoPath)) {
            fs.unlinkSync(videoPath);
        }
        // Deletes the extracted audio file.
        if (audioPath && fs.existsSync(audioPath)) {
            fs.unlinkSync(audioPath);
        }
    }
});

app.use(express.static(path.join(__dirname, "client", "dist")));

app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, "client", "dist", "index.html"));
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});