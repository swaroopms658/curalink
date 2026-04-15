import { Badge } from "@/components/ui/badge.jsx";
import { Card, CardContent } from "@/components/ui/card.jsx";

export function TrialsList({ trials }) {
  if (!trials?.length) {
    return <p className="empty-state">No grounded clinical trials were returned for this query.</p>;
  }

  return (
    <div className="stack">
      {trials.map((trial, index) => {
        const delayClass = `animate-in animate-in-delay-${Math.min(index + 1, 8)}`;

        return (
          <Card key={`${trial.sourceId}-${trial.title}`} className={delayClass}>
            <CardContent className="result-card-content">
              <div className="result-card-header">
                <h3>{trial.title}</h3>
                <div className="trial-meta">
                  <Badge tone="accent">Trial</Badge>
                  <Badge tone="muted">{trial.sourceId}</Badge>
                </div>
              </div>
              <p>{trial.summary}</p>
              <a href={trial.url} target="_blank" rel="noreferrer" className="result-link">
                View trial record
              </a>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
