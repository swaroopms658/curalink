import { retrievalConfig } from "../config/retrievalConfig.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const fetchJson = async (url, options = {}) => {
  const response = await fetchWithRetry(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.headers || {})
    }
  });

  return response.json();
};

export const fetchText = async (url, options = {}) => {
  const response = await fetchWithRetry(url, options);
  return response.text();
};

export const fetchWithRetry = async (url, options = {}) => {
  const maxAttempts = options.retries ?? retrievalConfig.retries + 1;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? retrievalConfig.timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        if (response.status >= 500 && attempt < maxAttempts) {
          await sleep(250 * attempt);
          continue;
        }

        throw new Error(`HTTP ${response.status} for ${url}`);
      }

      return response;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;

      if (attempt < maxAttempts) {
        await sleep(250 * attempt);
      }
    }
  }

  throw lastError;
};
