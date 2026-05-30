const express = require("express");
const path = require("path");

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

// Serve the finished React website from client/dist
// So when someone visits your public Render URL, Express looks inside:
app.use(express.static(path.join(__dirname, "client", "dist")));


// For any normal webpage route that was not handled above, send the React app.
// /profile /posts /about
// Those should all return React’s index.html. Important: this goes after the API routes.
app.get("/{*splat}", (req, res) => {
  res.sendFile(path.join(__dirname, "client", "dist", "index.html"));
});

// = “the port number given by the environment.”
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});




// cd client
// npm run build

// translation of jsx into js


// Development:
// npm run dev
// Vite runs a local dev server.
// It serves client/src live and updates fast while coding.

// Production:
// npm run build - performed with vite
// Vite converts client/src into client/dist.
// Express/Render serves client/dist to real online users.