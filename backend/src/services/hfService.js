import { hfConfig } from "../config/hfConfig.js";
import { fetchJson } from "./httpService.js";

const EMBEDDING_SIZE = 256;
const dotProduct = (left, right) => left.reduce((sum, value, index) => sum + value * right[index], 0);

const normalizeVector = (vector) => {
  const magnitude = Math.sqrt(dotProduct(vector, vector));
  if (!magnitude) {
    return vector;
  }

  return vector.map((value) => value / magnitude);
};

const averageTokenVectors = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  if (Array.isArray(value[0]) && typeof value[0][0] === "number") {
    const dimensions = value[0].length;
    const aggregate = Array.from({ length: dimensions }, () => 0);

    value.forEach((tokenVector) => {
      tokenVector.forEach((coordinate, index) => {
        aggregate[index] += coordinate;
      });
    });

    return normalizeVector(aggregate.map((coordinate) => coordinate / value.length));
  }

  if (typeof value[0] === "number") {
    return normalizeVector(value);
  }

  return [];
};

const buildHashedEmbedding = (text) => {
  const vector = Array.from({ length: EMBEDDING_SIZE }, () => 0);
  const terms = text.toLowerCase().match(/[a-z0-9-]+/g) || [];

  terms.forEach((term) => {
    let hash = 0;
    for (let index = 0; index < term.length; index += 1) {
      hash = (hash * 31 + term.charCodeAt(index)) >>> 0;
    }

    vector[hash % EMBEDDING_SIZE] += 1;
  });

  return normalizeVector(vector);
};

const buildFallbackEmbeddings = (texts) => texts.map((text) => buildHashedEmbedding(text));

const fetchEmbeddingBatch = async (texts) => {
  const response = await fetchJson(
    `${hfConfig.apiBaseUrl}/pipeline/feature-extraction/${hfConfig.embeddingModel}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${hfConfig.apiKey}`
      },
      body: JSON.stringify({
        inputs: texts,
        options: {
          wait_for_model: true,
          use_cache: true
        }
      }),
      timeoutMs: 30000
    }
  );

  if (!Array.isArray(response)) {
    throw new Error("Unexpected Hugging Face embedding response format");
  }

  return response.map((item) => averageTokenVectors(item));
};

export const generateEmbeddings = async (texts) => {
  if (!Array.isArray(texts) || texts.length === 0) {
    return [];
  }

  if (!hfConfig.apiKey) {
    return buildFallbackEmbeddings(texts);
  }

  const results = [];

  for (let start = 0; start < texts.length; start += hfConfig.embeddingBatchSize) {
    const batch = texts.slice(start, start + hfConfig.embeddingBatchSize);

    try {
      const batchEmbeddings = await fetchEmbeddingBatch(batch);
      results.push(...batchEmbeddings);
    } catch (_error) {
      results.push(...buildFallbackEmbeddings(batch));
    }
  }

  return results;
};
