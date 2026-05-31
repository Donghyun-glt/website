const express = require("express");
const path = require("path");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const cors = require("cors");

dotenv.config();

const app = express();
const PORT = 8000;

app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.post("/api/explain-frame", async (req, res) => {
  try {
    const { image } = req.body;

    if (!image) {
      return res.status(400).json({ error: "Image is required" });
    }

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Briefly explain what is happening in this video frame. Use simple language."
            },
            {
              type: "input_image",
              image_url: image
            }
          ]
        }
      ]
    });

    res.json({
      explanation: response.output_text
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Failed to explain frame"
    });
  }
});

// serve React public website from client/dist
app.use(express.static(path.join(__dirname, "client", "dist")));

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, "client", "dist", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});