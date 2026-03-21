import mongoose from 'mongoose';

const recentRaidSchema = new mongoose.Schema(
  {
    adminUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', required: true, index: true },
    raid: { type: String, required: true },
    label: { type: String, default: '' },  // optional display label (e.g. "quiz gen — 4 services")
    searchedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

// Compound index for efficient per-user queries sorted by recency
recentRaidSchema.index({ adminUserId: 1, searchedAt: -1 });

const RecentRaid = mongoose.model('RecentRaid', recentRaidSchema);
export default RecentRaid;
