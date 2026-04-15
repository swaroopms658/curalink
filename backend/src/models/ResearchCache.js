import mongoose from "mongoose";

const researchCacheSchema = new mongoose.Schema(
  {
    cacheKey: { type: String, required: true, unique: true },
    response: { type: Object, required: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } }
  },
  { timestamps: true }
);

export const ResearchCache =
  mongoose.models.ResearchCache || mongoose.model("ResearchCache", researchCacheSchema);
