import mongoose from 'mongoose';

let cachedConnection = null;

export const getDatabaseConnectionOptions = (env = process.env) => ({
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
    bufferCommands: false,
    autoIndex: ['development', 'test'].includes(String(env.NODE_ENV || '').toLowerCase())
      && String(env.MONGOOSE_AUTO_INDEX || '').toLowerCase() === 'true',
});

const connectDB = async () => {
    // If already connected, reuse existing connection
    if (mongoose.connection.readyState === 1) {
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
        const conn = await mongoose.connect(mongoURI, getDatabaseConnectionOptions());
        cachedConnection = conn;
        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
        return conn;
    } catch (error) {
        console.error(`❌ MongoDB Connection Error: ${error.message}`);
        throw error;
    }
};

export default connectDB;