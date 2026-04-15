import { retrievalConfig } from "../config/retrievalConfig.js";
import { fetchJson } from "./httpService.js";
import { logInfo } from "../utils/logger.js";

const invertAbstract = (invertedIndex) => {
  if (!invertedIndex) {
    return "";
  }

  const tokens = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    positions.forEach((position) => {
      tokens[position] = word;
    });
  }

  return tokens.filter(Boolean).join(" ");
};

const normalizeConcepts = (concepts) =>
  (concepts || [])
    .map((concept) => concept?.display_name)
    .filter(Boolean)
    .slice(0, 12);

const normalizeWork = (work) => ({
  id: `openalex-${work.id?.split("/").pop() || work.id}`,
  sourceId: work.id,
  title: work.display_name || "",
  abstract: invertAbstract(work.abstract_inverted_index),
  year: work.publication_year,
  url: work.primary_location?.landing_page_url || work.id,
  doi: work.doi || null,
  credibility: work.primary_location?.source?.is_core ? 0.82 : 0.72,
  keywords: normalizeConcepts(work.concepts)
});

const buildSearchTerm = ({ disease, expandedQuery, sessionContext }) => {
  const recent = (sessionContext?.recentQueries || []).slice(-2).join(" ");
  return `${disease} ${expandedQuery} ${recent}`.replace(/\s+/g, " ").trim();
};

export const searchOpenAlex = async ({ disease, expandedQuery, sessionContext }) => {
  const results = [];
  const pages = Math.ceil(retrievalConfig.openAlex.targetResults / retrievalConfig.openAlex.perPage);
  const searchTerm = buildSearchTerm({ disease, expandedQuery, sessionContext });
  logInfo("openalex", "searching openalex", {
    disease,
    expandedQuery,
    searchTerm,
    pages
  });

  for (let page = 1; page <= pages; page += 1) {
    const params = new URLSearchParams({
      search: searchTerm,
      per_page: String(retrievalConfig.openAlex.perPage),
      page: String(page),
      sort: "relevance_score:desc"
    });

    const response = await fetchJson(`https://api.openalex.org/works?${params.toString()}`);
    results.push(...(response?.results || []).map(normalizeWork));
  }

  const slicedResults = results.slice(0, retrievalConfig.openAlex.targetResults);
  logInfo("openalex", "completed openalex search", {
    results: slicedResults.length
  });
  return slicedResults;
};
