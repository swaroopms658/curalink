import { useDeferredValue, useState } from "react";

import { PublicationsList } from "@/components/PublicationsList.jsx";
import { SourceCard } from "@/components/SourceCard.jsx";
import { TrialsList } from "@/components/TrialsList.jsx";
import { Tabs } from "@/components/ui/tabs.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.jsx";

const TAB_DEFINITIONS = [
  { value: "insights", label: "Insights" },
  { value: "trials", label: "Trials" },
  { value: "sources", label: "Sources" }
];

function LoadingSkeleton() {
  return (
    <div className="loading-overlay">
      <div className="loading-spinner-ring" />
      <p className="loading-text">Running full pipeline — this may take 20–40 seconds...</p>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div className="skeleton skeleton-line" />
        <div className="skeleton skeleton-line" />
        <div className="skeleton skeleton-line" />
      </div>
    </div>
  );
}

export function ResultsTabs({ result, isLoading }) {
  const [activeTab, setActiveTab] = useState("insights");
  const deferredSources = useDeferredValue(result?.sources || []);

  if (isLoading) {
    return (
      <Card className="results-shell animate-in">
        <CardHeader>
          <CardTitle>Results</CardTitle>
        </CardHeader>
        <CardContent>
          <LoadingSkeleton />
        </CardContent>
      </Card>
    );
  }

  if (!result) {
    return (
      <Card className="results-shell animate-in animate-in-delay-2">
        <CardHeader>
          <CardTitle>Results</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="empty-state">
            Submit a query to populate insights, clinical trials, and source attribution.
          </p>
        </CardContent>
      </Card>
    );
  }

  const tabs = TAB_DEFINITIONS.map((tab) => ({
    ...tab,
    count:
      tab.value === "insights"
        ? result.insights.length
        : tab.value === "trials"
          ? result.trials.length
          : deferredSources.length
  }));

  return (
    <Card className="results-shell animate-in">
      <CardHeader>
        <CardTitle>Results</CardTitle>
      </CardHeader>
      <CardContent className="results-content">
        <div className="overview-panel">
          <p>{result.overview}</p>
        </div>

        <Tabs tabs={tabs} value={activeTab} onValueChange={setActiveTab} />

        {activeTab === "insights" ? (
          <PublicationsList insights={result.insights} sources={result.sources} />
        ) : null}

        {activeTab === "trials" ? <TrialsList trials={result.trials} sources={result.sources} /> : null}

        {activeTab === "sources" ? (
          <div className="stack">
            {deferredSources.map((source, index) => (
              <SourceCard key={source.id} source={source} index={index} />
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
