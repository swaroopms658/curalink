import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, unique: true },
    disease: { type: String, required: true },
    location: { type: String, default: "" },
    recentQueries: { type: [String], default: [] },
    expandedQuery: { type: String, default: "" },
    selectedSources: { type: [Object], default: [] }
  },
  { timestamps: true }
);

export const Session = mongoose.models.Session || mongoose.model("Session", sessionSchema);
