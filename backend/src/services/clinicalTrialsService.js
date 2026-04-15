import { retrievalConfig } from "../config/retrievalConfig.js";
import { fetchJson } from "./httpService.js";
import { extractIntentTerms } from "./queryExpansionService.js";
import { logInfo } from "../utils/logger.js";

const unique = (values) => [...new Set(values.filter(Boolean))];

const getConditionKeywords = (conditionsModule) =>
  unique([...(conditionsModule?.keywords || []), ...(conditionsModule?.conditions || [])]).slice(0, 12);

const getInterventionKeywords = (armsInterventionsModule) =>
  unique(
    (armsInterventionsModule?.interventions || []).flatMap((intervention) => [
      intervention?.name,
      intervention?.type,
      ...(intervention?.otherNames || [])
    ])
  ).slice(0, 12);

const getStudyText = (study) =>
  [
    study.title,
    study.summary,
    ...(study.keywords || [])
  ]
    .join(" ")
    .toLowerCase();

const getTerms = (text) => (String(text || "").toLowerCase().match(/[a-z0-9-]+/g) || []);
const STOP_TERMS = new Set([
  "agonist",
  "agonists",
  "receptor",
  "outcomes",
  "outcome",
  "events",
  "event",
  "major",
  "adverse",
  "type",
  "diabetes",
  "adult",
  "adults",
  "trial",
  "trials"
]);

const getKeywordOverlapScore = (study, expandedQuery) => {
  const queryTerms = [...new Set(getTerms(expandedQuery).filter((term) => term.length > 2))];
  const trialTerms = new Set(getTerms(getStudyText(study)).filter((term) => term.length > 2));
  const matches = queryTerms.filter((term) => trialTerms.has(term));

  return matches.length / Math.max(queryTerms.length, 1);
};

const getPhraseCoverage = (text, phrases) => {
  if (!phrases.length) {
    return 0;
  }

  const normalizedText = text.toLowerCase();
  const matches = phrases.filter((phrase) => normalizedText.includes(phrase.toLowerCase()));
  return matches.length / phrases.length;
};

const scoreTrialRelevance = (study, expandedQuery, intentTerms, disease) => {
  const text = getStudyText(study);
  const diseaseCoverage = getPhraseCoverage(text, [disease]);
  const interventionCoverage = getPhraseCoverage(text, intentTerms.interventionTerms);
  const outcomeCoverage = getPhraseCoverage(text, intentTerms.outcomeTerms);
  const keywordOverlap = getKeywordOverlapScore(study, expandedQuery);

  const weighted =
    diseaseCoverage * 0.2 +
    interventionCoverage * 0.4 +
    outcomeCoverage * 0.3 +
    keywordOverlap * 0.1;

  return {
    diseaseCoverage,
    interventionCoverage,
    outcomeCoverage,
    keywordOverlap,
    weighted
  };
};

const normalizeStudy = (study) => {
  const protocol = study?.protocolSection || {};
  const identification = protocol.identificationModule || {};
  const description = protocol.descriptionModule || {};
  const status = protocol.statusModule || {};
  const conditions = protocol.conditionsModule || {};
  const interventions = protocol.armsInterventionsModule || {};
  const nctId = identification.nctId;

  return {
    id: `trial-${nctId}`,
    sourceId: nctId,
    title: identification.briefTitle || "",
    summary: description.briefSummary || description.detailedDescription || "",
    year: status.startDateStruct?.date
      ? Number(String(status.startDateStruct.date).match(/\d{4}/)?.[0])
      : null,
    url: `https://clinicaltrials.gov/study/${nctId}`,
    credibility: 0.85,
    keywords: [...getConditionKeywords(conditions), ...getInterventionKeywords(interventions)].slice(0, 20)
  };
};

export const searchClinicalTrials = async ({ disease, query, expandedQuery, sessionContext }) => {
  const results = [];
  const intentTerms = extractIntentTerms(query);

  // Enrich search terms with session context for follow-up queries
  const contextualTerms = (sessionContext?.recentQueries || [])
    .flatMap((q) => getTerms(q))
    .filter((term) => term.length > 3 && !STOP_TERMS.has(term));

  const clinicalTrialsTerms = unique(
    [...intentTerms.interventionTerms, ...intentTerms.outcomeTerms]
      .flatMap((term) => getTerms(term))
      .filter((term) => term.length > 3 && !STOP_TERMS.has(term))
      .concat(contextualTerms)
  ).slice(0, 8);

  const fetchTrialBatch = async ({ queryTerm }) => {
    const batchResults = [];
    let nextPageToken;

    while (batchResults.length < retrievalConfig.clinicalTrials.targetResults) {
      const params = new URLSearchParams({
        "query.cond": disease,
        pageSize: String(retrievalConfig.clinicalTrials.pageSize),
        countTotal: "true"
      });

      if (queryTerm) {
        params.set("query.term", queryTerm);
      }

      if (nextPageToken) {
        params.set("pageToken", nextPageToken);
      }

      const response = await fetchJson(`https://clinicaltrials.gov/api/v2/studies?${params.toString()}`);
      const studies = response?.studies || response?.items || [];
      batchResults.push(...studies.map(normalizeStudy));
      nextPageToken = response?.nextPageToken;

      if (!nextPageToken) {
        break;
      }
    }

    return batchResults;
  };

  logInfo("clinicaltrials", "searching clinical trials", {
    disease,
    targetResults: retrievalConfig.clinicalTrials.targetResults,
    queryTerms: clinicalTrialsTerms
  });

  if (clinicalTrialsTerms.length > 0) {
    results.push(...(await fetchTrialBatch({ queryTerm: clinicalTrialsTerms.join(" ") })));
  }

  if (results.length < retrievalConfig.clinicalTrials.targetResults) {
    results.push(...(await fetchTrialBatch({ queryTerm: "" })));
  }

  const dedupedResults = unique(results.map((study) => study.id)).map((id) =>
    results.find((study) => study.id === id)
  );

  const rankedResults = dedupedResults
    .map((study) => ({
      ...study,
      relevance: scoreTrialRelevance(study, expandedQuery, intentTerms, disease)
    }))
    .sort(
      (left, right) =>
        right.relevance.weighted - left.relevance.weighted ||
        (right.year || 0) - (left.year || 0)
    );

  const slicedResults = rankedResults.slice(0, retrievalConfig.clinicalTrials.targetResults);
  logInfo("clinicaltrials", "completed clinical trials search", {
    results: slicedResults.length,
    topResults: slicedResults.slice(0, 5).map((study) => ({
      id: study.id,
      title: study.title,
      weighted: study.relevance.weighted,
      intervention: study.relevance.interventionCoverage,
      outcome: study.relevance.outcomeCoverage
    }))
  });
  return slicedResults;
};
