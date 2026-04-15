import { generateEmbeddings } from "./hfService.js";
import { extractIntentTerms } from "./queryExpansionService.js";
import { logInfo } from "../utils/logger.js";

const MIN_ABSTRACT_LENGTH = 80;
const cosineSimilarity = (left, right) => {
  if (!left?.length || !right?.length || left.length !== right.length) {
    return 0;
  }

  return left.reduce((sum, value, index) => sum + value * right[index], 0);
};

const getTerms = (text) =>
  (text.toLowerCase().match(/[a-z0-9-]+/g) || []).filter((term) => term.length > 2);

const getNormalizedText = (document) =>
  `${document.title} ${document.abstract} ${(document.keywords || []).join(" ")}`.toLowerCase();

const hasPhrase = (text, phrases) => phrases.some((phrase) => text.includes(phrase.toLowerCase()));

const unique = (values) => [...new Set(values.filter(Boolean))];

const buildIntentFamilies = (intentTerms) => {
  const buildFamilies = (phrases) =>
    phrases.map((phrase) => {
      const normalizedPhrase = phrase.toLowerCase();
      const tokens = getTerms(normalizedPhrase);
      const anchorTokens = tokens.filter((token) => token.length >= 5);

      return {
        phrase: normalizedPhrase,
        tokens: anchorTokens.length > 0 ? anchorTokens : tokens
      };
    });

  return {
    intervention: buildFamilies(intentTerms.interventionTerms),
    outcome: buildFamilies(intentTerms.outcomeTerms)
  };
};

const matchesFamily = (text, family) => {
  if (text.includes(family.phrase)) {
    return true;
  }

  if (family.tokens.length === 0) {
    return false;
  }

  const matchedTokens = family.tokens.filter((token) => text.includes(token));
  const minimumMatches = family.tokens.length >= 3 ? 2 : 1;
  if (matchedTokens.length < minimumMatches) {
    return false;
  }

  if (family.tokens.length >= 3) {
    const longestToken = [...family.tokens].sort((left, right) => right.length - left.length)[0];
    return matchedTokens.includes(longestToken);
  }

  return true;
};

const getFamilyCoverage = (text, families) => {
  if (!families.length) {
    return 0;
  }

  const coveredFamilies = families.filter((family) => matchesFamily(text, family));

  return coveredFamilies.length / families.length;
};

const getMatchedFamilyPhrases = (text, families) =>
  families.filter((family) => matchesFamily(text, family)).map((family) => family.phrase);

const getEvidenceTypeProfile = (document) => {
  const text = getNormalizedText(document);
  const title = String(document.title || "").toLowerCase();

  return {
    isEvidenceSynthesis: hasPhrase(text, [
      "systematic review",
      "meta-analysis",
      "pooled analysis",
      "umbrella review",
      "narrative review"
    ]),
    isComparativeStudy: hasPhrase(text, [
      "head-to-head",
      "versus",
      "comparison",
      "target trial emulation",
      "comparative effectiveness"
    ]),
    isOutcomeStudy: hasPhrase(text, [
      "outcome trial",
      "outcomes trial",
      "randomized trial",
      "clinical practice",
      "real-world"
    ]),
    isReviewLikeTitle: hasPhrase(title, ["review", "state-of-the-art", "state of the art"])
  };
};

const getKeywordScore = (document, expandedQuery) => {
  const queryTerms = [...new Set(getTerms(expandedQuery))];
  const haystack = getTerms(getNormalizedText(document));
  const matches = queryTerms.filter((term) => haystack.includes(term));

  return Math.min(matches.length / Math.max(queryTerms.length, 1), 1);
};

const getPhraseMatchScore = (text, phrases) => {
  if (!phrases.length) {
    return 0;
  }

  const matches = phrases.filter((phrase) => text.includes(phrase.toLowerCase()));
  return matches.length / phrases.length;
};

const getIntentScore = (document, intentTerms) => {
  const normalizedText = getNormalizedText(document);
  const families = buildIntentFamilies(intentTerms);
  const intervention = getFamilyCoverage(normalizedText, families.intervention);
  const outcome = getFamilyCoverage(normalizedText, families.outcome);
  const missingInterventionPenalty = families.intervention.length > 0 && intervention === 0 ? 0.12 : 0;
  const missingOutcomePenalty = families.outcome.length > 0 && outcome === 0 ? 0.08 : 0;

  return {
    intervention,
    outcome,
    matchedInterventionPhrases: getMatchedFamilyPhrases(normalizedText, families.intervention),
    matchedOutcomePhrases: getMatchedFamilyPhrases(normalizedText, families.outcome),
    missingInterventionPenalty,
    missingOutcomePenalty
  };
};

const getRecencyScore = (year) => {
  const currentYear = new Date().getFullYear();
  const age = Math.max(currentYear - (year || currentYear - 10), 0);
  return Math.max(1 - age / 10, 0);
};

const buildStageOneFilter = (document) => {
  if (!document.title || !document.abstract) {
    return false;
  }

  return document.abstract.trim().length >= MIN_ABSTRACT_LENGTH;
};

const buildChunkMap = (chunks) =>
  chunks.reduce((map, chunk) => {
    if (!map.has(chunk.documentId)) {
      map.set(chunk.documentId, []);
    }

    map.get(chunk.documentId).push(chunk);
    return map;
  }, new Map());

const scoreChunksByKeyword = (chunks, expandedQuery) => {
  const queryTerms = [...new Set(getTerms(expandedQuery))];

  return chunks
    .map((chunk) => {
      const haystack = getTerms(chunk.text);
      const matches = queryTerms.filter((term) => haystack.includes(term)).length;

      return {
        ...chunk,
        keywordDensity: matches / Math.max(queryTerms.length, 1)
      };
    })
    .sort((left, right) => right.keywordDensity - left.keywordDensity || left.position - right.position);
};

const buildEmbeddingCandidates = (documents, chunkMap, expandedQuery) => {
  const candidates = [];

  documents.forEach((document) => {
    const rankedChunks = scoreChunksByKeyword(chunkMap.get(document.id) || [], expandedQuery);
    rankedChunks.slice(0, 2).forEach((chunk) => {
      candidates.push(chunk);
    });
  });

  return candidates;
};

const buildChunkSimilarityMap = async (documents, chunkMap, queryText, expandedQuery) => {
  const embeddingCandidates = buildEmbeddingCandidates(documents, chunkMap, expandedQuery);
  const queryEmbedding = (await generateEmbeddings([queryText]))[0] || [];
  const chunkEmbeddings = await generateEmbeddings(embeddingCandidates.map((chunk) => chunk.text));
  const similarities = new Map();

  embeddingCandidates.forEach((chunk, index) => {
    const similarity = cosineSimilarity(queryEmbedding, chunkEmbeddings[index] || []);
    const currentBest = similarities.get(chunk.documentId);

    if (!currentBest || similarity > currentBest.similarity) {
      similarities.set(chunk.documentId, {
        chunk,
        similarity
      });
    }
  });

  return similarities;
};

const scoreDocument = (document, expandedQuery, similarityResult, intentTerms) => {
  const similarity = Math.max(similarityResult?.similarity || 0, 0);
  const keyword = getKeywordScore(document, expandedQuery);
  const recency = getRecencyScore(document.year);
  const credibility = document.credibility || 0;
  const intent = getIntentScore(document, intentTerms);
  const profile = getEvidenceTypeProfile(document);
  const evidenceBonus =
    (profile.isEvidenceSynthesis ? 0.05 : 0) +
    (profile.isOutcomeStudy ? 0.04 : 0) +
    (profile.isComparativeStudy ? 0.025 : 0) +
    (profile.isReviewLikeTitle ? 0.015 : 0);
  const weighted = Math.max(
    similarity * 0.40 +
      keyword * 0.25 +
      recency * 0.20 +
      credibility * 0.15 +
      intent.intervention * 0.05 +
      intent.outcome * 0.05 +
      evidenceBonus -
      intent.missingInterventionPenalty -
      intent.missingOutcomePenalty,
    0
  );

  return {
    ...document,
    bestChunk: similarityResult?.chunk || null,
    scores: {
      similarity,
      keyword,
      recency,
      credibility,
      intervention: intent.intervention,
      outcome: intent.outcome,
      matchedInterventionPhrases: intent.matchedInterventionPhrases,
      matchedOutcomePhrases: intent.matchedOutcomePhrases,
      evidenceBonus,
      missingInterventionPenalty: intent.missingInterventionPenalty,
      missingOutcomePenalty: intent.missingOutcomePenalty,
      weighted
    },
    evidenceProfile: profile,
    coverageProfile: {
      matchedInterventionPhrases: intent.matchedInterventionPhrases,
      matchedOutcomePhrases: intent.matchedOutcomePhrases
    }
  };
};

const isStrongTrialCandidate = (document, intentTerms) => {
  const hasInterventionIntent = intentTerms.interventionTerms.length > 0;
  const hasOutcomeIntent = intentTerms.outcomeTerms.length > 0;
  const meetsIntervention = !hasInterventionIntent || document.scores.intervention >= 0.1;
  const meetsOutcome = !hasOutcomeIntent || document.scores.outcome >= 0.1;

  return (
    meetsIntervention &&
    meetsOutcome &&
    document.scores.keyword >= 0.02 &&
    document.scores.weighted >= 0.12
  );
};

const isRelaxedTrialCandidate = (document) =>
  document.scores.keyword >= 0.02 && document.scores.weighted >= 0.1;

const pickDiversePublications = (candidates, limit) => {
  const selected = [];
  const selectedIds = new Set();
  const coveredPhrases = new Set();

  while (selected.length < limit) {
    const remaining = candidates.filter((document) => !selectedIds.has(document.id));

    if (remaining.length === 0) {
      break;
    }

    const bestNext = remaining
      .map((document) => {
        const uncoveredIntervention = document.coverageProfile.matchedInterventionPhrases.filter(
          (phrase) => !coveredPhrases.has(phrase)
        ).length;
        const uncoveredOutcome = document.coverageProfile.matchedOutcomePhrases.filter(
          (phrase) => !coveredPhrases.has(phrase)
        ).length;
        const diversityBoost =
          uncoveredIntervention * 0.05 +
          uncoveredOutcome * 0.06 +
          (document.evidenceProfile.isEvidenceSynthesis ? 0.03 : 0) +
          (document.evidenceProfile.isOutcomeStudy ? 0.025 : 0) +
          (document.evidenceProfile.isComparativeStudy ? 0.015 : 0);

        return {
          document,
          adjustedScore: document.scores.weighted + diversityBoost
        };
      })
      .sort((left, right) => right.adjustedScore - left.adjustedScore)[0];

    selected.push(bestNext.document);
    selectedIds.add(bestNext.document.id);
    bestNext.document.coverageProfile.matchedInterventionPhrases.forEach((phrase) => coveredPhrases.add(phrase));
    bestNext.document.coverageProfile.matchedOutcomePhrases.forEach((phrase) => coveredPhrases.add(phrase));
  }

  return selected.slice(0, limit);
};

const selectDocumentsByIntent = ({ rankedDocuments, type, limit, intentTerms }) => {
  const hasInterventionIntent = intentTerms.interventionTerms.length > 0;
  const hasOutcomeIntent = intentTerms.outcomeTerms.length > 0;
  const candidates = rankedDocuments.filter((document) => document.type === type);

  if (type === "trial") {
    const strongTrials = candidates.filter((document) => isStrongTrialCandidate(document, intentTerms));

    if (strongTrials.length > 0) {
      return strongTrials.slice(0, limit);
    }

    const relaxedTrials = candidates.filter((document) => isRelaxedTrialCandidate(document));

    if (relaxedTrials.length > 0) {
      return relaxedTrials.slice(0, limit);
    }

    // Fallback: return top-scored trials if any exist
    return candidates.slice(0, limit);
  }

  const strongIntentMatches = candidates.filter((document) => {
    const meetsIntervention = !hasInterventionIntent || document.scores.intervention >= 0.3;
    const meetsOutcome = !hasOutcomeIntent || document.scores.outcome >= 0.5;
    return (
      meetsIntervention &&
      meetsOutcome &&
      document.scores.weighted >= 0.35 &&
      (document.evidenceProfile.isEvidenceSynthesis || document.evidenceProfile.isOutcomeStudy)
    );
  });

  const secondaryMatches = candidates.filter((document) => {
    const meetsIntervention = !hasInterventionIntent || document.scores.intervention >= 0.3;
    const meetsOutcome = !hasOutcomeIntent || document.scores.outcome >= 0.3;
    const hasUsefulEvidenceType =
      document.evidenceProfile.isEvidenceSynthesis ||
      document.evidenceProfile.isOutcomeStudy ||
      document.evidenceProfile.isComparativeStudy;
    return meetsIntervention && meetsOutcome && hasUsefulEvidenceType && document.scores.weighted >= 0.3;
  });

  if (strongIntentMatches.length > 0) {
    return pickDiversePublications(strongIntentMatches, limit);
  }

  if (secondaryMatches.length > 0) {
    return pickDiversePublications(secondaryMatches, limit);
  }

  return [];
};

export const rankResearch = async ({ expandedQuery, query, documents, chunks }) => {
  const stageOneDocuments = documents.filter(buildStageOneFilter);
  const chunkMap = buildChunkMap(chunks);
  const intentTerms = extractIntentTerms(query);
  logInfo("ranking", "starting ranking", {
    query,
    expandedQuery,
    inputDocuments: documents.length,
    filteredDocuments: stageOneDocuments.length,
    chunks: chunks.length,
    intentTerms
  });
  const similarityMap = await buildChunkSimilarityMap(
    stageOneDocuments,
    chunkMap,
    `${query} ${expandedQuery}`,
    expandedQuery
  );

  const rankedDocuments = stageOneDocuments
    .map((document) => scoreDocument(document, expandedQuery, similarityMap.get(document.id), intentTerms))
    .sort((left, right) => right.scores.weighted - left.scores.weighted);

  const selectedPublications = selectDocumentsByIntent({
    rankedDocuments,
    type: "publication",
    limit: 8,
    intentTerms
  });
  const selectedTrials = selectDocumentsByIntent({
    rankedDocuments,
    type: "trial",
    limit: 5,
    intentTerms
  });
  logInfo("ranking", "ranked documents", {
    topRanked: rankedDocuments.slice(0, 10).map((document) => ({
      id: document.id,
      title: document.title,
      type: document.type,
      weighted: document.scores.weighted,
      intervention: document.scores.intervention,
      outcome: document.scores.outcome,
      evidenceBonus: document.scores.evidenceBonus
    }))
  });

  return {
    stageCounts: {
      input: documents.length,
      filtered: stageOneDocuments.length,
      embeddedChunks: buildEmbeddingCandidates(stageOneDocuments, chunkMap, expandedQuery).length
    },
    rankedDocuments,
    selectedPublications,
    selectedTrials
  };
};
