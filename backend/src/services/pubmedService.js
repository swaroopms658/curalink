import { XMLParser } from "fast-xml-parser";

import { retrievalConfig } from "../config/retrievalConfig.js";
import { fetchJson, fetchText } from "./httpService.js";
import { logInfo } from "../utils/logger.js";
import { extractIntentTerms } from "./queryExpansionService.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  textNodeName: "text"
});

const toArray = (value) => {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
};

const getPubDateYear = (journalIssue) => {
  const pubDate = journalIssue?.PubDate;

  if (!pubDate) {
    return null;
  }

  const directYear = Number(pubDate.Year);
  if (Number.isFinite(directYear)) {
    return directYear;
  }

  const medlineDateYear = Number(String(pubDate.MedlineDate || "").match(/\d{4}/)?.[0]);
  return Number.isFinite(medlineDateYear) ? medlineDateYear : null;
};

const getAbstractText = (abstractNode) => {
  const sections = toArray(abstractNode?.AbstractText);
  return sections
    .map((section) => {
      if (typeof section === "string") {
        return section;
      }

      if (section?.text) {
        return section.text;
      }

      return "";
    })
    .filter(Boolean)
    .join(" ");
};

const getKeywords = (article) => {
  const keywordSets = toArray(article?.MedlineCitation?.KeywordList).flatMap((keywordList) =>
    toArray(keywordList?.Keyword)
  );

  return keywordSets
    .map((keyword) => (typeof keyword === "string" ? keyword : keyword?.text))
    .filter(Boolean);
};

const getAuthors = (article) => {
  const authorList = toArray(article?.MedlineCitation?.Article?.AuthorList?.Author);
  return authorList
    .map((author) => {
      const lastName = author?.LastName || "";
      const initials = author?.Initials || "";
      const collectiveName = author?.CollectiveName || "";
      if (lastName && initials) return `${lastName} ${initials}`;
      if (lastName) return lastName;
      if (collectiveName) return collectiveName;
      return null;
    })
    .filter(Boolean)
    .slice(0, 10);
};

const normalizePubmedArticle = (article) => {
  const citation = article?.MedlineCitation;
  const pubmedData = article?.PubmedData;
  const articleInfo = citation?.Article;
  const pmid = citation?.PMID?.text || citation?.PMID;
  const title = articleInfo?.ArticleTitle?.text || articleInfo?.ArticleTitle || "";
  const abstract = getAbstractText(articleInfo?.Abstract);
  const year = getPubDateYear(articleInfo?.Journal?.JournalIssue);
  const articleIds = toArray(pubmedData?.ArticleIdList?.ArticleId);
  const doiEntry = articleIds.find((entry) => entry?.IdType === "doi");
  const doi = doiEntry?.text || null;

  return {
    id: `pubmed-${pmid}`,
    sourceId: String(pmid),
    title,
    abstract,
    authors: getAuthors(article),
    year,
    url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    doi,
    platform: "PubMed",
    credibility: 0.9,
    keywords: getKeywords(article)
  };
};

const STOP_WORDS = new Set([
  "a",
  "an",
  "adults",
  "and",
  "article",
  "articles",
  "ask",
  "current",
  "disease",
  "for",
  "how",
  "in",
  "literature",
  "of",
  "outcomes",
  "or",
  "recent",
  "report",
  "reports",
  "review",
  "reviews",
  "say",
  "studies",
  "study",
  "the",
  "trials",
  "to",
  "type",
  "types",
  "what",
  "with"
]);

const prioritizePubMedTerms = ({ disease, query, expandedQuery, sessionContext }) => {
  const recent = (sessionContext?.recentQueries || []).slice(-1).join(" ");
  const { interventionTerms, outcomeTerms } = extractIntentTerms(query);
  const queryTerms = `${query} ${expandedQuery} ${recent}`
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.replace(/[^a-z0-9-]/g, ""))
    .filter((term) => term && term.length > 2 && !STOP_WORDS.has(term));
  const diseaseTerms = disease
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.replace(/[^a-z0-9-]/g, ""))
    .filter((term) => term && term.length > 2 && !STOP_WORDS.has(term));

  return [
    ...interventionTerms,
    ...outcomeTerms,
    ...diseaseTerms,
    ...queryTerms,
    "trial",
    "cardiovascular"
  ]
    .map((term) => term.toLowerCase().trim())
    .filter((term) => term && !STOP_WORDS.has(term))
    .filter((term, index, terms) => terms.indexOf(term) === index)
    .slice(0, 6);
};

const buildSearchTerm = ({ disease, query, expandedQuery, sessionContext }) => {
  const uniqueTerms = prioritizePubMedTerms({ disease, query, expandedQuery, sessionContext });
  const intentClause = uniqueTerms.map((term) => `${term}[Title/Abstract]`).join(" OR ");

  if (!intentClause) {
    return `${disease}[Title/Abstract]`;
  }

  return `${disease}[Title/Abstract] AND (${intentClause})`;
};

const searchPubMedIds = async (term) => {
  const params = new URLSearchParams({
    db: "pubmed",
    retmode: "json",
    sort: "relevance",
    retmax: String(retrievalConfig.pubmed.targetResults),
    term
  });

  const response = await fetchJson(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?${params.toString()}`
  );

  return response?.esearchresult?.idlist || [];
};

const fetchPubMedBatch = async (ids) => {
  if (ids.length === 0) {
    return [];
  }

  const params = new URLSearchParams({
    db: "pubmed",
    retmode: "xml",
    id: ids.join(",")
  });

  const xml = await fetchText(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?${params.toString()}`
  );

  const parsed = parser.parse(xml);
  const articles = toArray(parsed?.PubmedArticleSet?.PubmedArticle);

  return articles.map(normalizePubmedArticle).filter((article) => article.title);
};

export const searchPubMed = async ({ disease, query, expandedQuery, sessionContext }) => {
  const term = buildSearchTerm({ disease, query, expandedQuery, sessionContext });
  logInfo("pubmed", "searching pubmed", {
    disease,
    query,
    expandedQuery,
    term
  });
  const ids = await searchPubMedIds(term);
  const results = [];

  for (let index = 0; index < ids.length; index += retrievalConfig.pubmed.searchBatchSize) {
    const batchIds = ids.slice(index, index + retrievalConfig.pubmed.searchBatchSize);
    const batchResults = await fetchPubMedBatch(batchIds);
    results.push(...batchResults);
  }

  const slicedResults = results.slice(0, retrievalConfig.pubmed.targetResults);
  logInfo("pubmed", "completed pubmed search", {
    ids: ids.length,
    results: slicedResults.length
  });
  return slicedResults;
};
