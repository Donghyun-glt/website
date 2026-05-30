import { useEffect, useRef, useState } from "react";

function VoiceCommand() {
  const peerConnectionRef = useRef(null);
  const audioElementRef = useRef(null);
  const streamRef = useRef(null);

  const [status, setStatus] = useState("Starting voice listener...");
  const [lastEvent, setLastEvent] = useState("");

  useEffect(() => {
    startRealtimeVoice();

    return () => {
      stopRealtimeVoice();
    };
  }, []);

  async function startRealtimeVoice() {
    try {
      setStatus("Requesting microphone permission...");

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true
      });

      streamRef.current = stream;

      const peerConnection = new RTCPeerConnection();
      peerConnectionRef.current = peerConnection;

      const audioElement = document.createElement("audio");
      audioElement.autoplay = true;
      audioElementRef.current = audioElement;

      peerConnection.ontrack = (event) => {
        audioElement.srcObject = event.streams[0];
      };

      stream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, stream);
      });

      const dataChannel = peerConnection.createDataChannel("oai-events");

      dataChannel.onopen = () => {
        setStatus("Voice listener active");
      };

      dataChannel.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type) {
          setLastEvent(data.type);
        }
      };

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      const response = await fetch("/api/realtime-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/sdp"
        },
        body: offer.sdp
      });

      const answerSdp = await response.text();

      await peerConnection.setRemoteDescription({
        type: "answer",
        sdp: answerSdp
      });

      setStatus("Voice listener active");
    } catch (err) {
      console.error(err);
      setStatus("Voice listener failed");
    }
  }

  function stopRealtimeVoice() {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
    }
  }

  return (
    <div>
      <p>Voice Status: {status}</p>
      {lastEvent && <p>Last Voice Event: {lastEvent}</p>}
    </div>
  );
}

export default VoiceCommand;