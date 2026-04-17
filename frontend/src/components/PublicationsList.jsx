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

        const authors = source?.authors || [];
        const authorsDisplay = authors.length > 3
          ? `${authors.slice(0, 3).join(", ")} et al.`
          : authors.join(", ");

        return (
          <Card key={`${insight.sourceId}-${insight.title}`} className={delayClass}>
            <CardContent className="result-card-content">
              <div className="result-card-header">
                <h3>{insight.title}</h3>
                <div className="insight-meta">
                  {source?.platform ? (
                    <Badge tone="blue">{source.platform}</Badge>
                  ) : (
                    <Badge tone="blue">{insight.sourceId.split("-").shift()}</Badge>
                  )}
                  {source?.year ? <Badge tone="muted">{source.year}</Badge> : null}
                </div>
              </div>

              {authorsDisplay ? (
                <p className="source-authors">{authorsDisplay}</p>
              ) : null}

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
