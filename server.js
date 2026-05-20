const path = require("path");

app.use(express.json());

app.use(express.static(path.join(__dirname, "client", "dist")));

app.get("/api/message", (req, res) => {
  res.json({ message: "Hello from GET" });
});

app.post("/api/message", (req, res) => {
  const { word } = req.body;

  res.json({
    message: `You sent: ${word}`
  });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "client", "dist", "index.html"));
});