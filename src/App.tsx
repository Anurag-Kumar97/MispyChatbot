import { useState, useRef, useEffect } from "react";
import axios from "axios";
import img from "../public/bg.png";
import logo from "../public/Logo.png";
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

  const handleAudioError = () => {
    cleanupAudio();
    addMessage("error", "Error playing audio response.");
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
        errorMessage = `Error: ${error}`;
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

      if (response.data?.response) {
        addMessage("user", text);
        addMessage("ai", response.data.response, response.data.audio_url);

        if (response.data.audio_url && !isPlaying) {
          playAudio(response.data.audio_url);
        }
      } else {
        throw new Error("Invalid response format");
      }
    } catch (error) {
      addMessage("error", "Failed to get response from server");
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

  const playAudio = (audioUrl) => {
    if (!audioUrl || isPlaying) return;

    cleanupAudio();

    const fullUrl = audioUrl.startsWith("http")
      ? audioUrl
      : `http://localhost:8000${audioUrl}`;
    audioRef.current = new Audio(fullUrl);
    setIsPlaying(true);

    audioRef.current.addEventListener("ended", handleAudioEnd);
    audioRef.current.addEventListener("error", handleAudioError);

    audioRef.current.play().catch((err) => {
      console.error("Audio play error:", err);
      handleAudioError();
    });
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

  const styles = {
    container: {
      backgroundColor: "#010315",
      backgroundImage: `url(${img})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      boxSizing: "border-box",
      backgroundRepeat: "no-repeat",
      minHeight: "100vh",
      minWidth: "100vw",
      padding: isMobile ? "10px" : "20px",
      color: "white",
      display: "flex",
      flexDirection: "column",
      justifyContent: "flex-start",
      fontFamily: "Segoe UI, Tahoma, Geneva, Verdana, sans-serif",
      position: "relative",
    },
    header: {
      textAlign: "center",
      marginBottom: isMobile ? "10px" : "20px",
      marginTop: isMobile ? "40px" : "0",
    },
    conversationContainer: {
      width: "100%",
      display: "flex",
      justifyContent: "center",
      height: isMobile ? "calc(100vh - 250px)" : "56vh",
      marginBottom: isMobile ? "80px" : "10%",
    },
    conversation: {
      flex: 1,
      overflowY: "auto",
      padding: isMobile ? "10px" : "15px",
      backgroundColor: "rgba(0, 0, 0, 0.2)",
      borderRadius: "8px",
      maxHeight: isMobile ? "80%" : "56vh",
      maxWidth: isMobile ? "85%" : "50%",
      border: "0.5px solid white",
      scrollbarWidth: "thin",
      scrollbarColor: "#4a90e2 rgba(0,0,0,0.1)",
    },
    message: {
      marginBottom: "15px",
      padding: "10px 15px",
      borderRadius: "18px",
      maxWidth: "80%",
      lineHeight: "1.4",
      wordBreak: "break-word",
      fontSize: isMobile ? "14px" : "16px",
    },
    userMessage: {
      background: "linear-gradient(135deg, #D098B5, #2F0BA4)",
      marginLeft: "auto",
      color: "white",
      border: "0.5px solid #70728D",
    },
    aiMessage: {
      background: "linear-gradient(135deg, #02747C, #011516)",
      marginRight: "auto",
      color: "white",
      border: "0.5px solid #70728D",
    },
    errorMessage: {
      backgroundColor: "#ffebee",
      color: "#c62828",
      textAlign: "center",
      padding: "10px",
      borderRadius: "5px",
      margin: "0 auto",
      maxWidth: "90%",
    },
    inputContainer: {
      display: "flex",
      gap: "10px",
      marginBottom: isMobile ? "5px" : "15px",
      justifyContent: "center",
      width: isMobile ? "95%" : "60%",
      position: "fixed",
      bottom: isMobile ? "70px" : "20px",
      left: "50%",
      transform: "translateX(-50%)",
    },
    button: {
      padding: isMobile ? "8px 15px" : "12px 20px",
      borderRadius: "20px",
      border: "none",
      backgroundColor: "#4a90e2",
      color: "white",
      fontSize: isMobile ? "14px" : "16px",
      cursor: "pointer",
      whiteSpace: "nowrap",
    },
    buttonGroup: {
      display: "flex",
      gap: "10px",
      justifyContent: "center",
      position: "fixed",
      bottom: isMobile ? "10px" : "10%",
      left: "50%",
      transform: "translateX(-50%)",
      width: isMobile ? "95%" : "auto",
    },
    logoContainer: {
      position: "absolute",
      top: isMobile ? "5px" : "20px",
      left: isMobile ? "5px" : "20px",
      display: "flex",
      alignItems: "center",
      gap: "10px",
    },
    logoImage: {
      height: isMobile ? "80px" : "250px",
      width: "auto",
    },
    inputWrapper: {
      position: "relative",
      flex: 1,
      display: "flex",
      alignItems: "center",
    },
    textInput: {
      width: "100%",
      padding: isMobile ? "10px 40px 10px 15px" : "12px 45px 12px 15px",
      borderRadius: "20px",
      border: "1px solid #ddd",
      fontSize: isMobile ? "14px" : "16px",
      outline: "none",
      backgroundColor: "rgba(255,255,255,0.05)",
      color: "white",
    },
    sendIconButton: {
      position: "absolute",
      right: "10px",
      background: "none",
      border: "none",
      cursor: "pointer",
      fontSize: isMobile ? "18px" : "20px",
      color: "white",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
    },
    emptyState: {
      textAlign: "center",
      color: "#ccc",
      marginTop: "20px",
      fontSize: isMobile ? "14px" : "16px",
    },
    loadingText: {
      textAlign: "center",
      fontSize: isMobile ? "14px" : "16px",
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.logoContainer}>
        <img src={logo} alt="Logo" style={styles.logoImage} />
      </div>
      <div style={styles.header}>
        <h1 style={{ fontSize: isMobile ? "20px" : "28px" }}>
          Welcome to your BotBuddy
        </h1>
        <p style={{ fontSize: isMobile ? "14px" : "16px" }}>
          smart conversations better insights
        </p>
      </div>

      <div style={styles.conversationContainer}>
        <div style={styles.conversation}>
          {conversation.length === 0 ? (
            <p style={styles.emptyState}></p>
          ) : (
            conversation.map((msg, index) => (
              <div
                key={index}
                style={{
                  ...styles.message,
                  ...(msg.speaker === "user"
                    ? styles.userMessage
                    : msg.speaker === "ai"
                    ? styles.aiMessage
                    : styles.errorMessage),
                }}
              >
                <p>{msg.text}</p>
              </div>
            ))
          )}
          {isLoading && <p style={styles.loadingText}>Processing...</p>}
          <div ref={conversationEndRef} />
        </div>
      </div>

      <div style={styles.inputContainer}>
        <div style={styles.inputWrapper}>
          <input
            type="text"
            value={textQuery}
            onChange={(e) => setTextQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message here..."
            style={styles.textInput}
            disabled={isLoading || isListening}
          />
          <button
            onClick={handleSendText}
            disabled={isLoading || !textQuery.trim()}
            style={styles.sendIconButton}
            title="Send"
          >
            <SendIcon />
          </button>
        </div>
      </div>

      <div style={styles.buttonGroup}>
        <button
          onClick={isListening ? stopRecording : startRecording}
          disabled={
            isPlaying || isLoading || !isSpeechSupported || permissionDenied
          }
          style={styles.button}
        >
          {isListening ? "🛑 Stop" : "🎤 Let's Talk"}
        </button>
        <button
          onClick={clearConversation}
          disabled={isLoading}
          style={{ ...styles.button, backgroundColor: "#7f8c8d" }}
        >
          Start Fresh
        </button>
      </div>
    </div>
  );
};

export default App;
