import { startTransition, useCallback, useEffect, useRef, useState } from "react";

import { ChatInterface } from "@/components/ChatInterface.jsx";
import { QueryForm } from "@/components/QueryForm.jsx";
import { ResultsTabs } from "@/components/ResultsTabs.jsx";
import { queryResearch } from "@/services/api.js";
import { createSessionId } from "@/lib/utils.js";

const SESSION_STORAGE_KEY = "curalink-session-id";

const getStoredSessionId = () => {
  const existingSessionId = window.localStorage.getItem(SESSION_STORAGE_KEY);

  if (existingSessionId) {
    return existingSessionId;
  }

  const nextSessionId = createSessionId();
  window.localStorage.setItem(SESSION_STORAGE_KEY, nextSessionId);
  return nextSessionId;
};

const PIPELINE_STAGES = [
  "Expanding query",
  "Retrieving research (150–300 results)",
  "Chunking documents",
  "Ranking with embeddings",
  "LLM reasoning",
  "Guardrail validation"
];

export function Home() {
  const [sessionId, setSessionId] = useState("");
  const [disease, setDisease] = useState("");
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [pipelineStage, setPipelineStage] = useState(-1);
  // Chat history: array of { role: "user" | "assistant", disease, query, location?, result?, error? }
  const [messages, setMessages] = useState([]);
  const chatEndRef = useRef(null);

  useEffect(() => {
    setSessionId(getStoredSessionId());
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleNewSession = useCallback(() => {
    const nextSessionId = createSessionId();
    window.localStorage.setItem(SESSION_STORAGE_KEY, nextSessionId);
    setSessionId(nextSessionId);
    setMessages([]);
    setError("");
    setDisease("");
    setQuery("");
    setLocation("");
    setPipelineStage(-1);
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!sessionId || !disease.trim() || !query.trim()) {
      return;
    }

    const userMessage = {
      role: "user",
      disease: disease.trim(),
      query: query.trim(),
      location: location.trim()
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setError("");
    setPipelineStage(0);

    // Simulate pipeline progress for UX feedback
    const stageInterval = setInterval(() => {
      setPipelineStage((prev) => {
        if (prev >= PIPELINE_STAGES.length - 1) {
          return prev;
        }
        return prev + 1;
      });
    }, 4500);

    try {
      const payload = await queryResearch({
        disease: disease.trim(),
        query: query.trim(),
        sessionId,
        location: location.trim()
      });

      clearInterval(stageInterval);
      setPipelineStage(PIPELINE_STAGES.length);

      const assistantMessage = {
        role: "assistant",
        disease: disease.trim(),
        query: query.trim(),
        result: payload
      };

      startTransition(() => {
        setMessages((prev) => [...prev, assistantMessage]);
      });

      // Clear query for follow-up but keep disease + location
      setQuery("");
    } catch (requestError) {
      clearInterval(stageInterval);
      setPipelineStage(-1);

      const errorMessage = {
        role: "assistant",
        disease: disease.trim(),
        query: query.trim(),
        error: requestError.message
      };

      setMessages((prev) => [...prev, errorMessage]);
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  };

  const hasResult = messages.some((m) => m.role === "assistant" && m.result);

  return (
    <main className="app-shell">
      <section className="app-hero">
        <div className="hero-copy">
          <p className="eyebrow">CuraLink</p>
          <h1>Medical research retrieval with ranked evidence and grounded reasoning.</h1>
          <p className="hero-text">
            Deep retrieval from PubMed, OpenAlex &amp; ClinicalTrials — ranked with embeddings, 
            reasoned by Hugging Face LLMs, and validated through source-grounding guardrails.
          </p>
          <div className="header-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleNewSession}
              disabled={isLoading}
            >
              New Session
            </button>
          </div>
        </div>
        
        <div className="hero-art">
          <div className="art-orb orb-1"></div>
          <div className="art-orb orb-2"></div>
          <div className="art-orb orb-3"></div>
          <div className="art-glass">
            <div className="glass-line"></div>
            <div className="glass-line w-75"></div>
            <div className="glass-line w-50"></div>
          </div>
        </div>
      </section>

      <section className="app-grid">
        {/* Left Column: Input and Pipeline Status */}
        <div className="left-column">
          <QueryForm
            disease={disease}
            query={query}
            location={location}
            onDiseaseChange={setDisease}
            onQueryChange={setQuery}
            onLocationChange={setLocation}
            onSubmit={handleSubmit}
            isLoading={isLoading}
          />
          
          <ChatInterface
            disease={disease}
            query={query}
            sessionId={sessionId}
            isLoading={isLoading}
            error={error}
            pipelineStages={PIPELINE_STAGES}
            pipelineStage={pipelineStage}
            hasResult={hasResult}
          />
        </div>

        {/* Right Column: Chat Timeline & Results */}
        <div className="right-column chat-timeline" style={{ padding: 0 }}>
          {messages.length === 0 && !isLoading && (
            <div className="empty-state">
              Start a session by asking a research question. Your follow-up interactions will be recorded here.
            </div>
          )}
          
          {messages.map((msg, idx) => {
            if (msg.role === "user") {
              return (
                <div key={idx} className="chat-bubble chat-bubble-user animate-in">
                  <div className="chat-bubble-label">You</div>
                  <div className="chat-bubble-content">
                    <strong>{msg.disease}</strong>
                    {msg.location ? <span className="chat-location"> · {msg.location}</span> : null}
                    <p>{msg.query}</p>
                  </div>
                </div>
              );
            }

            if (msg.error) {
              return (
                <div key={idx} className="chat-bubble chat-bubble-assistant animate-in">
                  <div className="chat-bubble-label">CuraLink</div>
                  <div className="chat-bubble-content">
                    <p className="error-text">{msg.error}</p>
                  </div>
                </div>
              );
            }

            return (
              <div key={idx} className="chat-bubble chat-bubble-assistant animate-in">
                <div className="chat-bubble-label">CuraLink</div>
                <div className="chat-bubble-content">
                  <ResultsTabs result={msg.result} isLoading={false} />
                </div>
              </div>
            );
          })}
          <div ref={chatEndRef} />
        </div>
      </section>
    </main>
  );
}
