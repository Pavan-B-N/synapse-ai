import mongoose from 'mongoose';

const otpSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  hash: { type: String, required: true },
  purpose: { type: String, enum: ['registration', 'login'], required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
});

const OTP = mongoose.model('OTP', otpSchema);
export default OTP;
