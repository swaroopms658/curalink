import { logInfo } from "../utils/logger.js";

const MEDICAL_QUERY_TERMS = [
  "systematic review",
  "randomized trial",
  "meta-analysis",
  "mechanism of disease",
  "guideline"
];

const INTERVENTION_SYNONYMS = [
  {
    matchers: ["glp-1", "glp1", "glp 1", "glp-1 receptor agonist", "glp1 receptor agonist"],
    terms: [
      "glp-1 receptor agonist",
      "glp-1 ra",
      "incretin",
      "semaglutide",
      "liraglutide",
      "dulaglutide",
      "exenatide",
      "lixisenatide",
      "tirzepatide"
    ]
  },
  {
    matchers: ["sglt2", "sglt-2", "sodium-glucose cotransporter 2"],
    terms: ["sglt2 inhibitor", "empagliflozin", "dapagliflozin", "canagliflozin"]
  },
  {
    matchers: ["parp inhibitor", "parp inhibitors"],
    terms: ["parp inhibitor", "olaparib", "talazoparib", "niraparib", "rucaparib"]
  }
];

const OUTCOME_TERMS = [
  {
    matchers: ["cardiovascular", "cv outcome", "major adverse cardiovascular"],
    terms: [
      "cardiovascular outcomes",
      "mace",
      "major adverse cardiovascular events",
      "heart failure",
      "stroke",
      "myocardial infarction"
    ]
  }
];

const collectMatchedTerms = (query, definitions) => {
  const normalizedQuery = query.toLowerCase();

  return definitions.flatMap((definition) =>
    definition.matchers.some((matcher) => normalizedQuery.includes(matcher)) ? definition.terms : []
  );
};

export const extractIntentTerms = (query) => ({
  interventionTerms: [...new Set(collectMatchedTerms(query, INTERVENTION_SYNONYMS))],
  outcomeTerms: [...new Set(collectMatchedTerms(query, OUTCOME_TERMS))]
});

export const expandQuery = ({
  disease,
  query,
  sessionContext,
  includeInterventionTerms = true,
  includeOutcomeTerms = true,
  includeMedicalTerms = true
}) => {
  const followUpTerms = sessionContext?.recentQueries?.slice(-2) || [];
  const intentTerms = extractIntentTerms(query);
  const expansionTerms = [
    ...(includeMedicalTerms ? MEDICAL_QUERY_TERMS : []),
    ...(includeInterventionTerms ? intentTerms.interventionTerms : []),
    ...(includeOutcomeTerms ? intentTerms.outcomeTerms : []),
    ...followUpTerms
  ].join(" ");

  return `${disease} ${query} ${expansionTerms}`.replace(/\s+/g, " ").trim();
};

export const buildRetrievalVariants = ({ disease, query, sessionContext }) => {
  const strictExpandedQuery = expandQuery({
    disease,
    query,
    sessionContext,
    includeInterventionTerms: true,
    includeOutcomeTerms: true,
    includeMedicalTerms: true
  });
  const moderateExpandedQuery = expandQuery({
    disease,
    query,
    sessionContext,
    includeInterventionTerms: true,
    includeOutcomeTerms: false,
    includeMedicalTerms: true
  });
  const broadExpandedQuery = expandQuery({
    disease,
    query,
    sessionContext,
    includeInterventionTerms: false,
    includeOutcomeTerms: false,
    includeMedicalTerms: true
  });
  const fallbackExpandedQuery = `${disease} ${query}`.replace(/\s+/g, " ").trim();

  const variants = [
    {
      label: "strict",
      expandedQuery: strictExpandedQuery
    },
    {
      label: "moderate",
      expandedQuery: moderateExpandedQuery
    },
    {
      label: "broad",
      expandedQuery: broadExpandedQuery
    },
    {
      label: "fallback",
      expandedQuery: fallbackExpandedQuery
    }
  ].filter(
    (variant, index, variants) =>
      variants.findIndex((candidate) => candidate.expandedQuery === variant.expandedQuery) === index
  );

  logInfo("query-expansion", "prepared intent terms", {
    disease,
    query,
    intentTerms: extractIntentTerms(query),
    variantLabels: variants.map((variant) => variant.label)
  });

  return variants;
};
