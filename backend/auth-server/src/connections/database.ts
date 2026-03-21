import mongoose from 'mongoose';
import config from '../config';

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(config.mongodb.uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    return conn;
  } catch (error: any) {
    process.exit(1);
  }
};

export default connectDB;
