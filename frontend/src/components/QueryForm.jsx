import { Button } from "@/components/ui/button.jsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.jsx";
import { Input } from "@/components/ui/input.jsx";
import { Textarea } from "@/components/ui/textarea.jsx";

export function QueryForm({
  disease,
  query,
  location,
  onDiseaseChange,
  onQueryChange,
  onLocationChange,
  onSubmit,
  isLoading
}) {
  return (
    <Card className="hero-card animate-in">
      <CardHeader>
        <CardTitle>Ask for source-grounded medical research</CardTitle>
        <CardDescription>
          Deep retrieval stays intact — 150–300 results are fetched, ranked with
          3-stage scoring, and grounded through Hugging Face reasoning.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="query-form" onSubmit={onSubmit}>
          <label className="field">
            <span className="field-label">Disease or condition</span>
            <Input
              id="disease-input"
              value={disease}
              onChange={(event) => onDiseaseChange(event.target.value)}
              placeholder="e.g. Type 2 diabetes"
              required
            />
          </label>

          <label className="field">
            <span className="field-label">Research question</span>
            <Textarea
              id="query-input"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="e.g. What do recent trials say about GLP-1 and CV outcomes?"
              rows={5}
              required
            />
          </label>

          <label className="field">
            <span className="field-label">Location <span className="field-optional">(optional)</span></span>
            <Input
              id="location-input"
              value={location}
              onChange={(event) => onLocationChange(event.target.value)}
              placeholder="e.g. Toronto, Canada"
            />
          </label>

          <div className="form-actions">
            <Button id="submit-btn" type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <span className="btn-spinner" />
                  Researching...
                </>
              ) : (
                "Run query"
              )}
            </Button>
            <p className="form-hint">
              Pipeline: Input → Expansion → Retrieval → Chunking → Ranking → LLM → Response
            </p>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
