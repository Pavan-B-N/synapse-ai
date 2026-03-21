import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, default: '' },
    content: { type: String, required: true, maxlength: 1000 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const channelPostSchema = new mongoose.Schema(
  {
    channelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel', required: true, index: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, default: '' },
    type: { type: String, enum: ['pdf', 'youtube', 'markdown'], required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    content: { type: String, default: '' },       // markdown content or description
    fileUrl: { type: String, default: '' },        // PDF file path
    youtubeUrl: { type: String, default: '' },     // YouTube embed URL
    youtubeVideoId: { type: String, default: '' }, // extracted video ID for embedding
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    dislikes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    likeCount: { type: Number, default: 0 },
    dislikeCount: { type: Number, default: 0 },
    commentCount: { type: Number, default: 0 },
    comments: [commentSchema],
  },
  { timestamps: true }
);

channelPostSchema.index({ channelId: 1, createdAt: -1 });
channelPostSchema.index({ likeCount: -1 });

const ChannelPost = mongoose.model('ChannelPost', channelPostSchema);
export default ChannelPost;
