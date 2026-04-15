import { Badge } from "@/components/ui/badge.jsx";
import { Card, CardContent } from "@/components/ui/card.jsx";

export function PublicationsList({ insights, sources }) {
  const sourceMap = new Map((sources || []).map((source) => [source.id, source]));

  if (!insights?.length) {
    return <p className="empty-state">No grounded insights were returned for this query.</p>;
  }

  return (
    <div className="stack">
      {insights.map((insight, index) => {
        const source = sourceMap.get(insight.sourceId);
        const delayClass = `animate-in animate-in-delay-${Math.min(index + 1, 8)}`;

        return (
          <Card key={`${insight.sourceId}-${insight.title}`} className={delayClass}>
            <CardContent className="result-card-content">
              <div className="result-card-header">
                <h3>{insight.title}</h3>
                <Badge tone="blue">{insight.sourceId.split("-").pop()}</Badge>
              </div>
              <p>{insight.summary}</p>
              {source ? (
                <a href={source.url} target="_blank" rel="noreferrer" className="result-link">
                  {source.title}
                </a>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
