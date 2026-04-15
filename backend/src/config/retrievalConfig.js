export const retrievalConfig = {
  minResults: 145,
  maxResults: 300,
  pubmed: {
    searchBatchSize: 100,
    targetResults: 100
  },
  openAlex: {
    perPage: 50,
    targetResults: 150
  },
  clinicalTrials: {
    pageSize: 20,
    targetResults: 30
  },
  retries: 2,
  timeoutMs: 15000
};
