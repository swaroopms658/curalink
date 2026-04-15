import { Badge } from "@/components/ui/badge.jsx";
import { Card, CardContent } from "@/components/ui/card.jsx";

function ScoreBar({ score }) {
  if (typeof score !== "number") {
    return null;
  }

  const percentage = Math.min(Math.max(score * 100, 0), 100);

  return (
    <div className="score-bar-container">
      <div className="score-bar">
        <div
          className="score-bar-fill"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="score-label">{score.toFixed(2)}</span>
    </div>
  );
}

function getSourceBadgeTone(source) {
  switch (source) {
    case "pubmed":
      return "blue";
    case "openalex":
      return "accent";
    case "clinicaltrials":
      return "amber";
    default:
      return "muted";
  }
}

export function SourceCard({ source, index }) {
  const delayClass = `source-card animate-in animate-in-delay-${Math.min((index || 0) + 1, 8)}`;

  return (
    <Card className={delayClass}>
      <CardContent className="source-card-content">
        <div className="source-card-topline">
          <Badge tone={getSourceBadgeTone(source.source)}>{source.source}</Badge>
          <Badge tone="muted">{source.type}</Badge>
        </div>

        <h3 className="source-title">{source.title}</h3>

        <ScoreBar score={source.score} />

        <p className="source-snippet">{source.snippet}</p>

        <div className="source-footer">
          <code>{source.id}</code>
          <a href={source.url} target="_blank" rel="noreferrer">
            Open source →
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
