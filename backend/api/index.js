import app from '../src/app.js';
import connectDB from '../src/configs/database.js';

export default async function handler(req, res) {
    try {
        await connectDB();
    } catch (error) {
        console.error('❌ Serverless MongoDB connection error:', error.message);
        return res.status(500).json({
            status: 'error',
            message: 'Database connection failed. Please check MONGODB_URI configuration on Vercel.',
            error: error.message,
        });
    }

    return app(req, res);
}
