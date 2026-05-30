const express = require("express");
const path = require("path");
require("dotenv").config();

const app = express();

app.use(express.json());

// This is needed because WebRTC sends SDP text, not JSON.
app.use(express.text({ type: ["application/sdp", "text/plain"] }));

app.get("/api/message", (req, res) => {
  res.json({ message: "Hello from GET" });
});

app.post("/api/message", (req, res) => {
  const { word } = req.body;

  res.json({
    message: `You sent: ${word}`
  });
});

// OpenAI Realtime WebRTC session
app.post("/api/realtime-session", async (req, res) => {
  try {
    const sessionConfig = JSON.stringify({
      type: "realtime",
      model: "gpt-realtime-2",

      instructions: `
You are a voice trigger for a video player.

You are always listening.

Only respond when the user asks about what is currently shown in the video.
Examples:
- "What do you see in the video?"
- "What is showing in the video?"
- "Can you see what's in the video?"
- "Tell me what is happening in the video."

If the user's speech conveys that intention, respond exactly:
I'm listening

For all other speech, do not respond.
Do not explain.
Do not mention that you cannot see the video.
      `,

      audio: {
        input: {
          turn_detection: {
            type: "server_vad"
          }
        },
        output: {
          voice: "marin"
        }
      }
    });

    const formData = new FormData();
    formData.set("sdp", req.body);
    formData.set("session", sessionConfig);

    const response = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "OpenAI-Safety-Identifier": "video-player-demo-user"
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(errorText);
      return res.status(500).send(errorText);
    }

    const answerSdp = await response.text();
    res.type("application/sdp").send(answerSdp);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Failed to create realtime session"
    });
  }
});

// Serve React production build
app.use(express.static(path.join(__dirname, "client", "dist")));

app.get("/{*splat}", (req, res) => {
  res.sendFile(path.join(__dirname, "client", "dist", "index.html"));
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});