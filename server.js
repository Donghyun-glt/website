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
const VAD = require("node-vad");


dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

app.use(cors());
app.use(express.json({ limit: "20mb" }));

app.use("/debug-audio", express.static(path.join(__dirname, "debug-audio")));

const debugAudioDir = path.join(__dirname, "debug-audio");

if (!fs.existsSync(debugAudioDir)) {
    fs.mkdirSync(debugAudioDir);
}

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
  Get audio duration using ffmpeg
*/
function getAudioDuration(audioPath) {
    return new Promise((resolve, reject) => {
        const args = [
            "-i", audioPath,
            "-f", "null",
            "-"
        ];

        const ffmpeg = spawn(ffmpegPath, args);

        let output = "";

        ffmpeg.stderr.on("data", data => {
            output += data.toString();
        });

        ffmpeg.on("close", () => {
            const match = output.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);

            if (!match) {
                return resolve(0);
            }

            const hours = Number(match[1]);
            const minutes = Number(match[2]);
            const seconds = Number(match[3]);

            resolve(hours * 3600 + minutes * 60 + seconds);
        });

        ffmpeg.on("error", reject);
    });
}

/*
  Check if audio is basically silent.
  mean_volume is usually like:
  -20 dB = audible
  -40 dB = quiet but possibly speech
  -60 dB = almost silent
*/
function getMeanVolume(audioPath) {
    return new Promise((resolve, reject) => {
        const args = [
            "-i", audioPath,
            "-af", "volumedetect",
            "-f", "null",
            "-"
        ];

        const ffmpeg = spawn(ffmpegPath, args);

        let output = "";

        ffmpeg.stderr.on("data", data => {
            output += data.toString();
        });

        ffmpeg.on("close", () => {
            const match = output.match(/mean_volume:\s*(-?\d+(\.\d+)?) dB/);

            if (!match) {
                return resolve(null);
            }

            resolve(Number(match[1]));
        });

        ffmpeg.on("error", reject);
    });
}

function detectSilence(audioPath) {
    return new Promise((resolve, reject) => {
        const args = [
            "-i", audioPath,
            "-af", "silencedetect=noise=-35dB:d=0.5",
            "-f", "null",
            "-"
        ];

        const ffmpeg = spawn(ffmpegPath, args);

        let output = "";

        ffmpeg.stderr.on("data", data => {
            output += data.toString();
        });

        ffmpeg.on("close", () => {
            const silenceStarts = [...output.matchAll(/silence_start: ([\d.]+)/g)]
                .map(match => Number(match[1]));

            const silenceEnds = [...output.matchAll(/silence_end: ([\d.]+)/g)]
                .map(match => Number(match[1]));

            resolve({
                rawOutput: output,
                silenceStarts,
                silenceEnds
            });
        });

        ffmpeg.on("error", reject);
    });
}

function calculateSilentDuration(silenceInfo, audioDuration) {
    let totalSilent = 0;

    for (let i = 0; i < silenceInfo.silenceStarts.length; i++) {
        const start = silenceInfo.silenceStarts[i];

        // If silence starts but no silence_end exists,
        // assume silence continues until the end of the audio.
        const end = silenceInfo.silenceEnds[i] ?? audioDuration;

        totalSilent += end - start;
    }

    return totalSilent;
}

async function detectVoiceActivity(audioPath) {
    const vad = new VAD(VAD.Mode.NORMAL);

    const wavBuffer = fs.readFileSync(audioPath);

    // Your ffmpeg output is normal WAV:
    // 44-byte WAV header + raw PCM audio data
    const pcmBuffer = wavBuffer.slice(44);

    const sampleRate = 16000;
    const bytesPerSample = 2; // 16-bit audio
    const frameDurationMs = 30;

    const frameSize =
        sampleRate *
        bytesPerSample *
        frameDurationMs / 1000;

    let speechFrames = 0;
    let totalFrames = 0;

    for (let i = 0; i + frameSize <= pcmBuffer.length; i += frameSize) {
        const frame = pcmBuffer.slice(i, i + frameSize);

        const result = await vad.processAudio(frame, sampleRate);

        totalFrames++;

        if (result === VAD.Event.VOICE) {
            speechFrames++;
        }
    }

    const speechRatio =
        totalFrames > 0 ? speechFrames / totalFrames : 0;

    return {
        speechFrames,
        totalFrames,
        speechRatio,
        hasSpeech: speechFrames >= 3 && speechRatio > 0.05
    };
}

function cleanTranscriptText(text) {
    const hallucinations = [
        "thank you for watching",
        "thanks for watching",
        "thank you",
        "bye",
        "subscribe"
    ];

    const normalized = text
        .trim()
        .toLowerCase()
        .replace(/[.,!?]/g, "");

    if (hallucinations.includes(normalized)) {
        return "";
    }

    return text;
}

function buildTimelineFromWords(words, videoDuration) {
    const timeline = [];

    if (!words || words.length === 0) {
        return [
            {
                start: 0,
                end: Number((videoDuration || 0).toFixed(2)),
                type: "silent",
                text: ""
            }
        ];
    }

    const gapThreshold = 1.0;

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

    timeline.push({
        start: Number(currentStart.toFixed(2)),
        end: Number(currentEnd.toFixed(2)),
        type: "speech",
        text: currentText.join(" ")
    });

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

        const debugAudioName = `${req.file.filename}.wav`;
        const debugAudioPath = path.join(debugAudioDir, debugAudioName);

        fs.copyFileSync(audioPath, debugAudioPath);

        console.log("Debug audio saved at:");
        console.log(`http://localhost:${PORT}/debug-audio/${debugAudioName}`);

        console.log("Checking audio duration...");
        const audioDuration = await getAudioDuration(audioPath);

        console.log("Running VAD speech detection...");
        const vadResult = await detectVoiceActivity(audioPath);

        console.log("VAD result:");
        console.log(vadResult);

        if (!vadResult.hasSpeech) {
            console.log("No human speech detected. Skipping Whisper.");

            return res.json({
                transcript: "",
                timeline: [
                    {
                        start: 0,
                        end: Number(audioDuration.toFixed(2)),
                        type: "silent",
                        text: ""
                    }
                ]
            });
        }

        console.log("Human speech detected. Sending audio to Whisper...");

        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(audioPath),
            model: "whisper-1",
            response_format: "verbose_json",
            timestamp_granularities: ["word"]
        });

        console.log("FULL TRANSCRIPTION:");
        console.log(JSON.stringify(transcription, null, 2));

        const words = transcription.words || [];
        const fullTranscript = cleanTranscriptText(transcription.text || "");

        const videoDuration =
            transcription.duration ||
            audioDuration ||
            (words.length > 0 ? words[words.length - 1].end : 0);

        if (fullTranscript === "") {
            console.log("Transcript looked like hallucination. Returning silent timeline.");

            return res.json({
                transcript: "",
                timeline: [
                    {
                        start: 0,
                        end: Number(videoDuration.toFixed(2)),
                        type: "silent",
                        text: ""
                    }
                ]
            });
        }

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

app.use(express.static(path.join(__dirname, "client", "dist")));

app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, "client", "dist", "index.html"));
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});