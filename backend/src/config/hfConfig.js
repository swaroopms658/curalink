export const hfConfig = {
  get apiKey() {
    return process.env.HF_API_KEY || "";
  },
  get apiBaseUrl() {
    return process.env.HF_API_BASE_URL || "https://api-inference.huggingface.co";
  },
  get chatCompletionsBaseUrl() {
    return process.env.HF_CHAT_BASE_URL || "https://router.huggingface.co/v1";
  },
  get textGenerationModel() {
    return process.env.HF_TEXT_MODEL || "google/gemma-2-2b-it";
  },
  get textGenerationCandidates() {
    const configuredCandidates = process.env.HF_TEXT_MODEL_CANDIDATES
      ? process.env.HF_TEXT_MODEL_CANDIDATES.split(",").map((value) => value.trim()).filter(Boolean)
      : [];

    return [
      this.textGenerationModel,
      ...configuredCandidates,
      "google/gemma-2-2b-it",
      "Qwen/Qwen2.5-7B-Instruct",
      "meta-llama/Llama-3.1-8B-Instruct"
    ].filter((value, index, values) => values.indexOf(value) === index);
  },
  get embeddingModel() {
    return process.env.HF_EMBEDDING_MODEL || "sentence-transformers/all-MiniLM-L6-v2";
  },
  embeddingBatchSize: 16,
  maxReasoningSources: 10
};
