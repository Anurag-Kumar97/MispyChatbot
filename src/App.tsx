import { useState, useRef, useEffect } from "react";
import axios from "axios";
import "./App.css";
import SendIcon from "@mui/icons-material/Send";

const App = () => {
  const [conversation, setConversation] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [textQuery, setTextQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [recognitionError, setRecognitionError] = useState(null);
  const [isSpeechSupported, setIsSpeechSupported] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const hasFetchedWelcome = useRef(false); // Add flag to track welcome fetch

  const audioRef = useRef(null);
  const recognitionRef = useRef(null);
  const conversationEndRef = useRef(null);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const initSpeechRecognition = async () => {
      try {
        if (!("webkitSpeechRecognition" in window)) {
          setIsSpeechSupported(false);
          setRecognitionError("browser-not-supported");
          return;
        }

        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
          });
          stream.getTracks().forEach((track) => track.stop());
          setPermissionDenied(false);
          setRecognitionError(null);
        } catch (error) {
          console.error("Microphone access error:", error);
          setPermissionDenied(true);
          setRecognitionError("permission-denied");
          return;
        }

        const SpeechRecognition = window.webkitSpeechRecognition;
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = false;
        recognitionRef.current.lang = "en-US";

        recognitionRef.current.onresult = (event) => {
          const transcript = event.results[0][0].transcript;
          sendTextToBackend(transcript);
        };

        recognitionRef.current.onerror = (event) => {
          handleRecognitionError(event.error);
        };

        recognitionRef.current.onend = () => {
          setIsListening(false);
        };
      } catch (error) {
        console.error("Initialization error:", error);
        setRecognitionError("initialization-failed");
      }
    };

    initSpeechRecognition();

    // Only fetch welcome message if not already fetched
    if (!hasFetchedWelcome.current) {
      hasFetchedWelcome.current = true;
      fetchWelcomeMessage();
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      cleanupAudio();
    };
  }, []);

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation]);

  const fetchWelcomeMessage = async () => {
    try {
      const response = await axios.get("http://localhost:8000/welcome", {
        timeout: 30000,
      });
      if (response.data?.response && response.data?.audio_url) {
        addMessage("ai", response.data.response, response.data.audio_url);
        playAudio(response.data.audio_url);
      }
    } catch (error) {
      console.error("Error fetching welcome message:", error);
      addMessage("error", `Failed to load welcome message: ${error.message}`);
    }
  };

  const cleanupAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeEventListener("ended", handleAudioEnd);
      audioRef.current.removeEventListener("error", handleAudioError);
      audioRef.current = null;
      setIsPlaying(false);
    }
  };

  const handleAudioEnd = () => {
    cleanupAudio();
  };

  const handleAudioError = (error) => {
    cleanupAudio();
    const errorMessage = error?.message
      ? `Error playing audio: ${error.message}`
      : "Error playing audio response. Check if the audio file is accessible.";
    addMessage("error", errorMessage);
    console.error("Audio error details:", error);
  };

  const handleRecognitionError = (error) => {
    console.error("Speech recognition error:", error);
    setRecognitionError(error);
    setIsListening(false);
    setIsLoading(false);

    let errorMessage = "Speech recognition failed";
    switch (error) {
      case "audio-capture":
        errorMessage = "Microphone not found or access denied.";
        setPermissionDenied(true);
        break;
      case "not-allowed":
        errorMessage = "Microphone access denied.";
        setPermissionDenied(true);
        break;
      case "no-speech":
        errorMessage = "No speech detected.";
        break;
      default:
        errorMessage = `Speech recognition error: ${error}`;
    }
    addMessage("error", errorMessage);
  };

  const startRecording = async () => {
    if (!recognitionRef.current) {
      addMessage("error", "Speech recognition not initialized");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());

      setPermissionDenied(false);
      setRecognitionError(null);
      setIsListening(true);
      setIsLoading(true);
      recognitionRef.current.start();
    } catch (error) {
      setPermissionDenied(true);
      setRecognitionError("permission-denied");
      addMessage("error", "Microphone access denied.");
      setIsListening(false);
      setIsLoading(false);
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      setIsLoading(false);
    }
  };

  const sendTextToBackend = async (text) => {
    if (!text.trim()) return;

    setIsLoading(true);
    try {
      const response = await axios.post(
        "http://localhost:8000/ask",
        { query: text },
        {
          headers: { "Content-Type": "application/json" },
          timeout: 30000,
        }
      );

      if (response.data?.response && response.data?.audio_url) {
        addMessage("user", text);
        addMessage("ai", response.data.response, response.data.audio_url);
        playAudio(response.data.audio_url);
      } else {
        throw new Error("Invalid response format");
      }
    } catch (error) {
      console.error("Error sending text to backend:", error);
      addMessage(
        "error",
        `Failed to get response from server: ${error.message}`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendText = () => {
    if (!textQuery.trim() || isLoading) return;
    sendTextToBackend(textQuery);
    setTextQuery("");
  };

  const addMessage = (speaker, text, audioUrl = null) => {
    setConversation((prev) => [
      ...prev,
      {
        speaker,
        text,
        audioUrl,
        timestamp: new Date().toISOString(),
      },
    ]);
  };

  const playAudio = async (audioUrl) => {
    if (!audioUrl || isPlaying) return;

    cleanupAudio();

    const fullUrl = audioUrl.startsWith("http")
      ? audioUrl
      : `http://localhost:8000${audioUrl}`;
    console.log("Attempting to play audio:", fullUrl);

    try {
      await axios.head(fullUrl, { timeout: 5000 });
      audioRef.current = new Audio(fullUrl);
      setIsPlaying(true);

      audioRef.current.addEventListener("ended", handleAudioEnd);
      audioRef.current.addEventListener("error", (e) => handleAudioError(e));

      await audioRef.current.play();
    } catch (err) {
      console.error("Audio playback error:", err);
      handleAudioError(err);
    }
  };

  const clearConversation = () => {
    setConversation([]);
    cleanupAudio();
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendText();
    }
  };

  return (
    <div
      className="container"
      style={{ backgroundImage: `url('images/bg.png')` }}
    >
      <div className="logoContainer">
        <img src={"images/Logo.png"} alt="Logo" className="logoImage" />
      </div>
      <div className="header">
        <h1>Welcome to your BotBuddy</h1>
        <p>smart conversations better insights</p>
      </div>

      <div className="conversationContainer">
        <div className="conversation">
          {conversation.length === 0 ? (
            <p className="emptyState">Start a conversation!</p>
          ) : (
            conversation.map((msg, index) => (
              <div
                key={index}
                className={`message ${
                  msg.speaker === "user"
                    ? "userMessage"
                    : msg.speaker === "ai"
                    ? "aiMessage"
                    : "errorMessage"
                }`}
              >
                <p>{msg.text}</p>
              </div>
            ))
          )}
          {isLoading && <p className="loadingText">Processing...</p>}
          <div ref={conversationEndRef} />
        </div>
      </div>

      <div className="inputContainer">
        <div className="inputWrapper">
          <input
            type="text"
            value={textQuery}
            onChange={(e) => setTextQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message here..."
            className="textInput"
            disabled={isLoading || isListening}
          />
          <button
            onClick={handleSendText}
            disabled={isLoading || !textQuery.trim()}
            className="sendIconButton"
            title="Send"
          >
            <SendIcon />
          </button>
        </div>
      </div>

      <div className="buttonGroup">
        <button
          onClick={isListening ? stopRecording : startRecording}
          disabled={
            isPlaying || isLoading || !isSpeechSupported || permissionDenied
          }
          className="button"
        >
          {isListening ? "🛑 Stop" : "🎤 Let's Talk"}
        </button>
        <button
          onClick={clearConversation}
          disabled={isLoading}
          className="button"
          style={{ backgroundColor: "#7f8c8d" }}
        >
          Start Fresh
        </button>
      </div>

      {recognitionError && (
        <div className="errorContainer">
          <p>Error: {recognitionError}</p>
        </div>
      )}
    </div>
  );
};

export default App;
