import { hfConfig } from "../config/hfConfig.js";
import { logInfo } from "../utils/logger.js";

const MAX_SNIPPET_LENGTH = 900;
const MAX_PUBLICATIONS = 8;
const MAX_TRIALS = 5;
let supportedReasoningBackendPromise;

const trimText = (text, maxLength = MAX_SNIPPET_LENGTH) => {
  if (!text) {
    return "";
  }

  return text.length <= maxLength ? text : `${text.slice(0, maxLength).trim()}...`;
};

const cleanWhitespace = (text) => String(text || "").replace(/\s+/g, " ").trim();

const buildSourceRecord = (document) => ({
  id: document.id,
  title: document.title,
  source: document.source,
  type: document.type,
  url: document.url,
  snippet: trimText(document.bestChunk?.text || document.abstract || ""),
  score: document.scores?.weighted ?? null
});

const formatSourceBlock = (source, index) =>
  [
    `Source ${index + 1}`,
    `id: ${source.id}`,
    `type: ${source.type}`,
    `title: ${source.title}`,
    `source: ${source.source}`,
    `url: ${source.url}`,
    `snippet: ${source.snippet}`
  ].join("\n");

const buildReasoningPrompt = ({ disease, query, sessionContext, sources }) => {
  const recentQueries = (sessionContext?.recentQueries || []).slice(-3).join(" | ");
  const publicationSources = sources.filter((s) => s.type === "publication");
  const trialSources = sources.filter((s) => s.type === "trial");

  const publicationBlock = publicationSources.length > 0
    ? publicationSources.map((s, i) => formatSourceBlock(s, i)).join("\n\n")
    : "No publication sources provided.";

  const trialBlock = trialSources.length > 0
    ? trialSources.map((s, i) => formatSourceBlock(s, publicationSources.length + i)).join("\n\n")
    : "No trial sources provided.";

  return `You are a medical research assistant.
Use only the provided evidence.
Do not invent facts.
Do not mention any source id not present in the evidence.
If evidence is limited or conflicting, say that explicitly.

IMPORTANT RULES:
- For "insights": use ONLY publication sources (ids starting with "pubmed-" or "openalex-").
- For "trials": use ONLY trial sources (ids starting with "trial-"). Each trial MUST include the trial url.
- You MUST generate at least one entry for insights AND at least one entry for trials when sources of both types are provided. This is MANDATORY.
- If a trial source is not a perfect match for the question, summarize what the trial investigates and note how it relates to the disease. Do NOT leave the trials array empty when trial sources exist.
- Every insight and trial MUST reference a real sourceId from the evidence.

Return valid JSON only with this schema:
{
  "overview": "string — summarize the overall evidence for the disease and question",
  "insights": [{"title":"string","summary":"string","sourceId":"string"}],
  "trials": [{"title":"string","summary":"string","sourceId":"string","url":"string"}]
}

Disease: ${disease}
Question: ${query}
Recent session context: ${recentQueries || "none"}

--- PUBLICATION EVIDENCE ---
${publicationBlock}

--- CLINICAL TRIAL EVIDENCE ---
${trialBlock}`;
};

const buildChatMessages = ({ disease, query, sessionContext, sources }) => [
  {
    role: "system",
    content:
      "You are a medical research assistant. Use only the provided evidence. Do not invent facts. Return valid JSON only."
  },
  {
    role: "user",
    content: buildReasoningPrompt({ disease, query, sessionContext, sources })
  }
];

const buildProbeMessages = () => [
  {
    role: "system",
    content: "Return short JSON only."
  },
  {
    role: "user",
    content: "{\"status\":\"ok\"}"
  }
];

const buildTextGenerationPrompt = (params) =>
  `${buildReasoningPrompt(params)}

Return valid JSON only.`;

const extractJsonPayload = (text) => {
  const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i);
  if (fencedMatch) {
    return fencedMatch[1].trim();
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("No JSON object found in model output");
  }

  return text.slice(firstBrace, lastBrace + 1);
};

const normalizeModelPayload = (payload, sourcesById) => {
  const seenInsightSources = new Set();
  const normalizedInsights = Array.isArray(payload.insights)
    ? payload.insights
        .map((item) => ({
          title: cleanWhitespace(item?.title),
          summary: cleanWhitespace(item?.summary),
          sourceId: String(item?.sourceId || "")
        }))
        .filter((item) => {
          const source = sourcesById.get(item.sourceId);
          if (!item.title || !item.summary || source?.type !== "publication") {
            return false;
          }

          if (seenInsightSources.has(item.sourceId)) {
            return false;
          }

          seenInsightSources.add(item.sourceId);
          return true;
        })
    : [];

  const seenTrialSources = new Set();
  const normalizedTrials = Array.isArray(payload.trials)
    ? payload.trials
        .map((item) => ({
          title: cleanWhitespace(item?.title),
          summary: cleanWhitespace(item?.summary),
          sourceId: String(item?.sourceId || ""),
          url: cleanWhitespace(item?.url || sourcesById.get(String(item?.sourceId || ""))?.url || "")
        }))
        .filter((item) => {
          const source = sourcesById.get(item.sourceId);
          if (!item.title || !item.summary || !item.url || source?.type !== "trial") {
            return false;
          }

          if (seenTrialSources.has(item.sourceId)) {
            return false;
          }

          seenTrialSources.add(item.sourceId);
          return true;
        })
    : [];

  // Fallback: if LLM returned 0 trials but trial sources exist, generate from source data
  const availableTrialSources = [...sourcesById.values()].filter((s) => s.type === "trial");

  if (normalizedTrials.length === 0 && availableTrialSources.length > 0) {
    for (const trialSource of availableTrialSources.slice(0, 3)) {
      normalizedTrials.push({
        title: trialSource.title,
        summary: trialSource.snippet || `Clinical trial investigating ${trialSource.title}.`,
        sourceId: trialSource.id,
        url: trialSource.url
      });
    }
  }

  return {
    overview: cleanWhitespace(payload.overview),
    insights: normalizedInsights,
    trials: normalizedTrials
  };
};

const postChatCompletion = async ({ model, messages, maxTokens, temperature, topP }) => {
  const response = await fetch(`${hfConfig.chatCompletionsBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${hfConfig.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      top_p: topP
    })
  });

  const rawBody = await response.text();
  let parsedBody;

  try {
    parsedBody = rawBody ? JSON.parse(rawBody) : null;
  } catch (_error) {
    parsedBody = null;
  }

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} for ${hfConfig.chatCompletionsBaseUrl}/chat/completions`);
    error.statusCode = response.status;
    error.debug = {
      model,
      endpoint: "chat-completions",
      body: parsedBody || rawBody
    };
    throw error;
  }

  return parsedBody;
};

const postTextGeneration = async ({ model, prompt, maxTokens, temperature, topP }) => {
  const response = await fetch(`${hfConfig.apiBaseUrl}/models/${model}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${hfConfig.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      inputs: prompt,
      parameters: {
        max_new_tokens: maxTokens,
        temperature,
        top_p: topP,
        return_full_text: false
      },
      options: {
        wait_for_model: true,
        use_cache: false
      }
    })
  });

  const rawBody = await response.text();
  let parsedBody;

  try {
    parsedBody = rawBody ? JSON.parse(rawBody) : null;
  } catch (_error) {
    parsedBody = null;
  }

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} for ${hfConfig.apiBaseUrl}/models/${model}`);
    error.statusCode = response.status;
    error.debug = {
      model,
      endpoint: "text-generation",
      body: parsedBody || rawBody
    };
    throw error;
  }

  return parsedBody;
};

const extractTextGenerationContent = (response) => {
  if (Array.isArray(response) && typeof response[0]?.generated_text === "string") {
    return response[0].generated_text;
  }

  if (typeof response?.generated_text === "string") {
    return response.generated_text;
  }

  throw new Error("Unexpected Hugging Face text generation response format");
};

const resolveSupportedReasoningBackend = async () => {
  if (!hfConfig.apiKey) {
    return null;
  }

  if (!supportedReasoningBackendPromise) {
    supportedReasoningBackendPromise = (async () => {
      for (const model of hfConfig.textGenerationCandidates) {
        try {
          await postChatCompletion({
            model,
            messages: buildProbeMessages(),
            maxTokens: 32,
            temperature: 0.1,
            topP: 0.9
          });
          logInfo("reasoning", "selected supported hugging face reasoning model", {
            model,
            endpoint: "chat-completions"
          });
          return {
            model,
            endpoint: "chat-completions"
          };
        } catch (error) {
          logWarn("reasoning", "hugging face reasoning model probe failed", {
            model,
            error: error.message,
            debug: error.debug || null
          });
        }
      }

      for (const model of hfConfig.textGenerationCandidates) {
        try {
          await postTextGeneration({
            model,
            prompt: "{\"status\":\"ok\"}",
            maxTokens: 32,
            temperature: 0.1,
            topP: 0.9
          });
          logInfo("reasoning", "selected supported hugging face reasoning model", {
            model,
            endpoint: "text-generation"
          });
          return {
            model,
            endpoint: "text-generation"
          };
        } catch (error) {
          logWarn("reasoning", "hugging face reasoning model probe failed", {
            model,
            error: error.message,
            debug: error.debug || null
          });
        }
      }

      return null;
    })();
  }

  return supportedReasoningBackendPromise;
};

const fetchReasoningResponse = async ({ disease, query, sessionContext, sources }) => {
  const supportedBackend = await resolveSupportedReasoningBackend();

  if (!supportedBackend) {
    throw new Error("No supported Hugging Face reasoning model found");
  }

  if (supportedBackend.endpoint === "chat-completions") {
    const response = await postChatCompletion({
      model: supportedBackend.model,
      messages: buildChatMessages({ disease, query, sessionContext, sources }),
      maxTokens: 900,
      temperature: 0.2,
      topP: 0.9
    });
    const content = response?.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("Unexpected Hugging Face chat completion response format");
    }

    return content;
  }

  const response = await postTextGeneration({
    model: supportedBackend.model,
    prompt: buildTextGenerationPrompt({ disease, query, sessionContext, sources }),
    maxTokens: 900,
    temperature: 0.2,
    topP: 0.9
  });

  return extractTextGenerationContent(response);
};

const buildFallbackReasoning = ({ disease, query, publications, trials }) => ({
  overview: `Evidence summary for ${disease} focused on ${query}. The response is grounded in the highest-ranked retrieved sources and may omit conclusions where evidence was limited.`,
  insights: publications.map((publication) => ({
    title: publication.title,
    summary: trimText(publication.bestChunk?.text || publication.abstract || ""),
    sourceId: publication.id
  })),
  trials: trials.map((trial) => ({
    title: trial.title,
    summary: trimText(trial.bestChunk?.text || trial.abstract || ""),
    sourceId: trial.id,
    url: trial.url
  }))
});

const summarizePayloadForDebug = (payload) => ({
  overview: payload?.overview || "",
  insightSourceIds: Array.isArray(payload?.insights)
    ? payload.insights.map((item) => item?.sourceId || null)
    : null,
  trialSourceIds: Array.isArray(payload?.trials)
    ? payload.trials.map((item) => item?.sourceId || null)
    : null,
  insightsCount: Array.isArray(payload?.insights) ? payload.insights.length : null,
  trialsCount: Array.isArray(payload?.trials) ? payload.trials.length : null
});

export const generateGroundedAnswer = async ({
  disease,
  query,
  sessionContext,
  selectedPublications,
  selectedTrials
}) => {
  const publications = selectedPublications.slice(0, MAX_PUBLICATIONS);
  const trials = selectedTrials.slice(0, MAX_TRIALS);
  const selectedDocuments = [...publications, ...trials];
  // Give publications and trials separate budgets so trials aren't squeezed out
  const maxPubsForReasoning = Math.min(publications.length, hfConfig.maxReasoningSources - Math.min(trials.length, 3));
  const maxTrialsForReasoning = Math.min(trials.length, hfConfig.maxReasoningSources - maxPubsForReasoning);
  const reasoningDocuments = [
    ...publications.slice(0, maxPubsForReasoning),
    ...trials.slice(0, maxTrialsForReasoning)
  ];
  const sources = selectedDocuments.map(buildSourceRecord);
  const reasoningSources = reasoningDocuments.map(buildSourceRecord);
  const reasoningSourcesById = new Map(reasoningSources.map((source) => [source.id, source]));
  logInfo("reasoning", "starting grounded answer generation", {
    disease,
    query,
    selectedPublicationIds: publications.map((item) => item.id),
    selectedTrialIds: trials.map((item) => item.id),
    reasoningSourceIds: reasoningSources.map((item) => item.id),
    totalReturnedSources: sources.length,
    huggingFaceEnabled: Boolean(hfConfig.apiKey)
  });

  let reasoningPayload = buildFallbackReasoning({ disease, query, publications, trials });

  if (hfConfig.apiKey && reasoningSources.length > 0) {
    try {
      const modelOutput = await fetchReasoningResponse({
        disease,
        query,
        sessionContext,
        sources: reasoningSources
      });
      const parsedPayload = JSON.parse(extractJsonPayload(modelOutput));
      const normalizedPayload = normalizeModelPayload(parsedPayload, reasoningSourcesById);
      logInfo("reasoning", "received hugging face response", {
        reasoningSourceIds: reasoningSources.map((item) => item.id),
        normalizedPayload: summarizePayloadForDebug(normalizedPayload)
      });

      if (normalizedPayload.overview && normalizedPayload.insights.length > 0) {
        reasoningPayload = {
          overview: normalizedPayload.overview,
          insights: normalizedPayload.insights,
          trials: normalizedPayload.trials
        };
      }
    } catch (error) {
      logWarn("reasoning", "reasoning layer failed, using fallback response", {
        disease,
        query,
        selectedPublicationIds: publications.map((item) => item.id),
        selectedTrialIds: trials.map((item) => item.id),
        reasoningSourceIds: reasoningSources.map((item) => item.id),
        error: error.message
      });
      reasoningPayload = buildFallbackReasoning({ disease, query, publications, trials });
    }
  }

  logInfo("reasoning", "grounded answer payload", {
    disease,
    query,
    sourceIds: sources.map((item) => item.id),
    payload: summarizePayloadForDebug(reasoningPayload)
  });

  return {
    overview: reasoningPayload.overview,
    insights: reasoningPayload.insights,
    trials: reasoningPayload.trials,
    sources
  };
};
