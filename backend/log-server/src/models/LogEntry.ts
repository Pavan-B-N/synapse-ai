import mongoose from 'mongoose';

const logEntrySchema = new mongoose.Schema(
  {
    service: { type: String, required: true, index: true },
    level: {
      type: String,
      enum: ['error', 'warn', 'info', 'debug', 'verbose'],
      required: true,
      index: true,
    },
    message: { type: String, required: true },
    timestamp: { type: Date, default: Date.now, index: true },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    raid: { type: String, index: true, sparse: true },
    traceId: { type: String, index: true, sparse: true },
    spanId: { type: String },
    userId: { type: String, index: true, sparse: true },
    statusCode: { type: Number },
    responseTime: { type: Number },
    path: { type: String },
    method: { type: String },
    ip: { type: String },
    userAgent: { type: String },
  },
  {
    timestamps: true,
    timeseries: undefined, // can enable if MongoDB 5.0+
  }
);

logEntrySchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 }); // TTL 30 days
logEntrySchema.index({ service: 1, level: 1, createdAt: -1 });
logEntrySchema.index({ raid: 1, timestamp: 1 });

const LogEntry = mongoose.model('LogEntry', logEntrySchema);
export default LogEntry;
