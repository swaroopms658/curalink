import { searchPubMed } from "./pubmedService.js";
import { searchOpenAlex } from "./openalexService.js";
import { searchClinicalTrials } from "./clinicalTrialsService.js";
import { retrievalConfig } from "../config/retrievalConfig.js";
import { logInfo, logWarn } from "../utils/logger.js";

const normalizePublication = (document, source) => ({
  id: document.id,
  source,
  type: "publication",
  title: document.title,
  abstract: document.abstract,
  year: document.year,
  url: document.url,
  credibility: document.credibility ?? 0.5,
  keywords: document.keywords ?? []
});

const normalizeTrial = (trial) => ({
  id: trial.id,
  source: "clinicaltrials",
  type: "trial",
  title: trial.title,
  abstract: trial.summary,
  year: trial.year,
  url: trial.url,
  credibility: trial.credibility ?? 0.7,
  keywords: trial.keywords ?? []
});

const mergeUniqueDocuments = (documents) => {
  const uniqueDocuments = new Map();

  documents.forEach((document) => {
    if (!uniqueDocuments.has(document.id)) {
      uniqueDocuments.set(document.id, document);
    }
  });

  return [...uniqueDocuments.values()];
};

const runRetrievalPass = async ({ disease, query, expandedQuery, sessionContext }) => {
  logInfo("retrieval", "starting retrieval pass", {
    disease,
    query,
    expandedQuery
  });
  const [pubmedResults, openAlexResults, clinicalTrialResults] = await Promise.all([
    searchPubMed({ disease, query, expandedQuery, sessionContext }),
    searchOpenAlex({ disease, query, expandedQuery, sessionContext }),
    searchClinicalTrials({ disease, query, expandedQuery, sessionContext })
  ]);

  const documents = [
    ...pubmedResults.map((result) => normalizePublication(result, "pubmed")),
    ...openAlexResults.map((result) => normalizePublication(result, "openalex")),
    ...clinicalTrialResults.map(normalizeTrial)
  ];

  return {
    expandedQuery,
    totals: {
      pubmed: pubmedResults.length,
      openAlex: openAlexResults.length,
      clinicalTrials: clinicalTrialResults.length
    },
    totalRetrieved: documents.length,
    documents
  };
};

export const retrieveResearch = async ({ disease, query, retrievalVariants, sessionContext }) => {
  const aggregatedPasses = [];
  let documents = [];

  for (const variant of retrievalVariants) {
    const passResult = await runRetrievalPass({
      disease,
      query,
      expandedQuery: variant.expandedQuery,
      sessionContext
    });

    aggregatedPasses.push({
      label: variant.label,
      expandedQuery: variant.expandedQuery,
      totals: passResult.totals,
      totalRetrieved: passResult.totalRetrieved
    });
    documents = mergeUniqueDocuments([...documents, ...passResult.documents]);
    logInfo("retrieval", "completed retrieval pass", {
      label: variant.label,
      totals: passResult.totals,
      passTotal: passResult.totalRetrieved,
      mergedUniqueTotal: documents.length
    });

    if (
      documents.length >= retrievalConfig.minResults &&
      documents.length <= retrievalConfig.maxResults
    ) {
      return {
        retrievalPasses: aggregatedPasses,
        totals: passResult.totals,
        totalRetrieved: documents.length,
        documents
      };
    }
  }

  if (
    documents.length < retrievalConfig.minResults ||
    documents.length > retrievalConfig.maxResults
  ) {
    logWarn("retrieval", "deep retrieval requirement not met after all passes", {
      totalRetrieved: documents.length,
      retrievalPasses: aggregatedPasses
    });
    const error = new Error(
      `Deep retrieval requirement not met: expected ${retrievalConfig.minResults}-${retrievalConfig.maxResults} results, received ${documents.length}`
    );
    error.statusCode = 502;
    error.debug = {
      retrievalPasses: aggregatedPasses
    };
    throw error;
  }

  return {
    retrievalPasses: aggregatedPasses,
    totals: aggregatedPasses.at(-1)?.totals || {
      pubmed: 0,
      openAlex: 0,
      clinicalTrials: 0
    },
    totalRetrieved: documents.length,
    documents
  };
};
