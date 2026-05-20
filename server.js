const express = require("express");
const app = express();

app.use(express.json());

app.get("/api/message", (req, res) => {
  res.json({ message: "Hello from GET" });
});

app.post("/api/message", (req, res) => {
  const { word } = req.body;

  res.json({
    message: `You sent: ${word}`
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});