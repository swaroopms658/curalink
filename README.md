# CuraLink — AI Medical Research Assistant

CuraLink is a professional-grade MERN application designed to streamline medical research. It automates the process of querying global research databases, ranking evidence with machine learning, and generating grounded, source-backed insights using Hugging Face LLMs.

## 🚀 Core Features

### 1. Intelligent Search Pipeline
- **Query Expansion**: Automatically enriches user questions with medical synonyms and intent-based terms.
- **Deep Retrieval**: Fetches 150–300 results per query from **PubMed**, **OpenAlex**, and **ClinicalTrials.gov**.
- **Context Awareness**: Supports multi-turn conversations by maintaining session history and injecting prior context into new searches.

### 2. Multi-Stage Ranking Layer
- **Embedding Similarity**: Uses `sentence-transformers/all-MiniLM-L6-v2` to score document relevance against the expanded query.
- **Weighted Scoring**: Evaluates evidence based on Similarity (40%), Keyword overlap (25%), Recency (20%), and Source Credibility (15%).
- **Intent Detection**: Prioritizes papers that specifically address interventions and outcomes.

### 3. Grounded Reasoning & Guardrails
- **LLM Synthesis**: Uses **Qwen-2.5-7B** (via Hugging Face) to generate research overviews and comparative insights.
- **Strict Grounding**: Every claim in the overview and every entry in the "Insights" and "Trials" tabs is mapped to a provideable source snippet.
- **Source Verification**: Integrated guardrails ensure the system never hallucinates or references non-existent sources.

### 4. Premium Interface
- **Modern UI**: Dark-themed glassmorphism design built with React and custom CSS animations.
- **Live Pipeline Tracking**: Real-time visual feedback on every stage of the backend process (Retrieval → Ranking → Reasoning).
- **Responsive Layout**: Seamless experience across desktop and mobile devices.

---

## 🛠 Tech Stack

- **Frontend**: React, Vite, Custom CSS (Glassmorphism), shadcn/ui components.
- **Backend**: Node.js, Express, Modular Service Architecture.
- **Database**: MongoDB (Session persistence and response caching).
- **AI/ML**: Hugging Face Inference API (Embeddings & Text Generation).

---

## 🚦 Getting Started

### Prerequisites
- Node.js (v18+)
- MongoDB Atlas account (or local MongoDB)
- Hugging Face API Token

### Environment Setup
Create a `.env` file in the root directory and add the following:

```env
PORT=4000
MONGODB_URI=your_mongodb_uri
HF_API_KEY=your_huggingface_key
HF_TEXT_MODEL=mistralai/Mistral-7B-Instruct-v0.3
HF_EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
```

### Installation
```bash
# Install dependencies
npm install
```

### Running Locally
```bash
# Start Backend
npm run dev:backend

# Start Frontend
npm run dev:frontend
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 📁 Project Structure

```text
curalink/
├── backend/
│   ├── src/
│   │   ├── config/       # API & DB configurations
│   │   ├── controllers/  # API route handlers
│   │   ├── models/       # Mongoose schemas
│   │   ├── routes/       # Express routing
│   │   ├── services/     # Modular pipeline logic (Expansion, Retrieval, Ranking)
│   │   └── utils/        # Shared utilities (Logger)
├── frontend/
│   ├── src/
│   │   ├── components/   # UI primitives and composite components
│   │   ├── pages/        # Main route views
│   │   ├── services/     # API interaction layer
│   │   └── styles/       # Global CSS and animations
└── package.json          # Root build and dev scripts
```

---

## 📝 API Documentation

### `POST /api/query`
The primary endpoint for initiating research.

**Request Body:**
```json
{
  "disease": "Type 2 diabetes",
  "query": "Weight loss effects of semaglutide",
  "sessionId": "optional-session-id"
}
```

**Response:**
```json
{
  "overview": "...",
  "insights": [],
  "trials": [],
  "sources": []
}
```

---

## ⚖️ License
This project is licensed under the MIT License.
