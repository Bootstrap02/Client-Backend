const mongoose = require('mongoose');

const dbConnect = async () => {
  try {
    if (!process.env.DATABASE_URI) throw new Error('DATABASE_URI is not configured');
    await mongoose.connect(process.env.DATABASE_URI);
    console.log('MongoDB connected');
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    throw err;
  }
};

module.exports = dbConnect;
