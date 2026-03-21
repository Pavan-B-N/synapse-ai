import mongoose from 'mongoose';

const adminOtpSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', required: true, index: true },
  hash: { type: String, required: true },
  purpose: { type: String, enum: ['registration', 'login'], required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
});

const AdminOTP = mongoose.model('AdminOTP', adminOtpSchema);
export default AdminOTP;
