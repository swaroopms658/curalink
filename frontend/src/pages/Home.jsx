import { startTransition, useCallback, useEffect, useState } from "react";

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
  const [result, setResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [pipelineStage, setPipelineStage] = useState(-1);

  useEffect(() => {
    setSessionId(getStoredSessionId());
  }, []);

  const handleNewSession = useCallback(() => {
    const nextSessionId = createSessionId();
    window.localStorage.setItem(SESSION_STORAGE_KEY, nextSessionId);
    setSessionId(nextSessionId);
    setResult(null);
    setError("");
    setDisease("");
    setQuery("");
    setPipelineStage(-1);
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!sessionId) {
      return;
    }

    setIsLoading(true);
    setError("");
    setResult(null);
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
        sessionId
      });

      clearInterval(stageInterval);
      setPipelineStage(PIPELINE_STAGES.length);

      startTransition(() => {
        setResult(payload);
      });
    } catch (requestError) {
      clearInterval(stageInterval);
      setPipelineStage(-1);
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  };

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
        <div className="left-column">
          <QueryForm
            disease={disease}
            query={query}
            onDiseaseChange={setDisease}
            onQueryChange={setQuery}
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
            hasResult={Boolean(result)}
          />
        </div>

        <div className="right-column">
          <ResultsTabs result={result} isLoading={isLoading} />
        </div>
      </section>
    </main>
  );
}
