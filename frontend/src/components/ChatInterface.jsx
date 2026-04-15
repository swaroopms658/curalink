import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.jsx";
import { Badge } from "@/components/ui/badge.jsx";

export function ChatInterface({
  disease,
  query,
  sessionId,
  isLoading,
  error,
  pipelineStages,
  pipelineStage,
  hasResult
}) {
  const getStatusTone = () => {
    if (error) return "danger";
    if (isLoading) return "amber";
    if (hasResult) return "accent";
    return "muted";
  };

  const getStatusLabel = () => {
    if (error) return "Error";
    if (isLoading) return "Processing";
    if (hasResult) return "Complete";
    return "Idle";
  };

  const getDotClass = () => {
    if (error) return "status-dot status-dot-error";
    if (isLoading) return "status-dot status-dot-loading";
    if (hasResult) return "status-dot status-dot-success";
    return "status-dot status-dot-idle";
  };

  return (
    <Card className="status-card animate-in animate-in-delay-1">
      <CardHeader>
        <CardTitle>Session</CardTitle>
      </CardHeader>
      <CardContent className="status-card-content">
        <div className="status-row">
          <span>Session ID</span>
          <code>{sessionId ? `${sessionId.slice(0, 8)}...` : "—"}</code>
        </div>
        <div className="status-row">
          <span>Disease</span>
          <strong>{disease || "Not set"}</strong>
        </div>
        <div className="status-row">
          <span>Status</span>
          <Badge tone={getStatusTone()}>
            <span className={getDotClass()} style={{ marginRight: 6 }} />
            {getStatusLabel()}
          </Badge>
        </div>

        {isLoading && pipelineStages ? (
          <div className="pipeline-steps">
            {pipelineStages.map((stage, index) => {
              let stepClass = "pipeline-step";
              let icon = "○";

              if (index < pipelineStage) {
                stepClass += " pipeline-step-done";
                icon = "✓";
              } else if (index === pipelineStage) {
                stepClass += " pipeline-step-active";
                icon = "●";
              }

              return (
                <div key={stage} className={stepClass}>
                  <span className="pipeline-step-icon">{icon}</span>
                  <span>{stage}</span>
                </div>
              );
            })}
          </div>
        ) : null}

        {error ? <p className="error-text">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
