import { useState } from "react";
import axios from "axios";

function App() {
  const [result, setResult] = useState("");

  async function getMessage() {
    const res = await axios.get("/api/message");
    setResult(res.data.message);
  }

  async function postMessage() {
    const res = await axios.post("/api/message", {
      word: "website"
    });

    setResult(res.data.message);
  }

  return (
    <div>
      <h1>Website</h1>

      <button onClick={getMessage}>GET from server</button>
      <button onClick={postMessage}>POST to server</button>

      <p>{result}</p>
    </div>
  );
}

export default App;