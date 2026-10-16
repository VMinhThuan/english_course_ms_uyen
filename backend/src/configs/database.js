import mongoose from 'mongoose';

let cachedConnection = null;

const connectDB = async () => {
    // If already connected or connecting, reuse the existing connection
    if (mongoose.connection.readyState >= 1) {
        return mongoose.connection;
    }

    if (cachedConnection) {
        return cachedConnection;
    }

    const mongoURI = process.env.MONGODB_URI;

    if (!mongoURI) {
        const errorMsg = 'MONGODB_URI is not defined in environment variables';
        console.error(`❌ Error: ${errorMsg}`);
        throw new Error(errorMsg);
    }

    try {
        const conn = await mongoose.connect(mongoURI, {
            serverSelectionTimeoutMS: 8000,
            bufferCommands: false,
        });
        cachedConnection = conn;
        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
        return conn;
    } catch (error) {
        console.error(`❌ MongoDB Connection Error: ${error.message}`);
        throw error;
    }
};

export default connectDB;