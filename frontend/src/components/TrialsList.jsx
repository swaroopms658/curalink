import { useState } from "react";
import { Badge } from "@/components/ui/badge.jsx";
import { Card, CardContent } from "@/components/ui/card.jsx";

function StatusBadge({ status }) {
  const normalized = (status || "Unknown").toLowerCase();
  let tone = "muted";
  if (normalized.includes("recruiting") && !normalized.includes("not")) tone = "accent";
  if (normalized.includes("completed")) tone = "blue";
  if (normalized.includes("terminated") || normalized.includes("withdrawn")) tone = "danger";
  if (normalized.includes("active")) tone = "amber";

  return <Badge tone={tone}>{status || "Unknown"}</Badge>;
}

function ExpandableSection({ label, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="trial-expandable">
      <button
        type="button"
        className="trial-expandable-toggle"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="trial-expandable-icon">{open ? "▾" : "▸"}</span>
        {label}
      </button>
      {open ? <div className="trial-expandable-content">{children}</div> : null}
    </div>
  );
}

function LocationsList({ locations }) {
  if (!locations?.length) return null;

  return (
    <ExpandableSection label={`Locations (${locations.length})`}>
      <ul className="trial-detail-list">
        {locations.map((loc, i) => (
          <li key={i}>
            {[loc.facility, loc.city, loc.state, loc.country].filter(Boolean).join(", ")}
          </li>
        ))}
      </ul>
    </ExpandableSection>
  );
}

function ContactsList({ contacts }) {
  if (!contacts?.length) return null;

  return (
    <ExpandableSection label={`Contacts (${contacts.length})`}>
      <ul className="trial-detail-list">
        {contacts.map((c, i) => (
          <li key={i}>
            <strong>{c.name}</strong>
            {c.role ? ` — ${c.role}` : ""}
            {c.phone ? <span className="trial-contact-info"> · {c.phone}</span> : ""}
            {c.email ? <span className="trial-contact-info"> · {c.email}</span> : ""}
          </li>
        ))}
      </ul>
    </ExpandableSection>
  );
}

function EligibilityBlock({ text }) {
  if (!text) return null;

  return (
    <ExpandableSection label="Eligibility Criteria">
      <p className="trial-eligibility-text">{text}</p>
    </ExpandableSection>
  );
}

export function TrialsList({ trials, sources }) {
  const sourceMap = new Map((sources || []).map((source) => [source.id, source]));

  if (!trials?.length) {
    return <p className="empty-state">No grounded clinical trials were returned for this query.</p>;
  }

  return (
    <div className="stack">
      {trials.map((trial, index) => {
        const source = sourceMap.get(trial.sourceId) || {};
        const delayClass = `animate-in animate-in-delay-${Math.min(index + 1, 8)}`;

        return (
          <Card key={`${trial.sourceId}-${trial.title}`} className={delayClass}>
            <CardContent className="result-card-content">
              <div className="result-card-header">
                <h3>{trial.title}</h3>
                <div className="trial-meta">
                  <StatusBadge status={source.recruitingStatus} />
                  <Badge tone="muted">{trial.sourceId}</Badge>
                </div>
              </div>
              <p>{trial.summary}</p>

              <EligibilityBlock text={source.eligibility} />
              <LocationsList locations={source.studyLocations} />
              <ContactsList contacts={source.contacts} />

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
