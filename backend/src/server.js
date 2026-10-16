import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from backend root directory
dotenv.config({ path: join(__dirname, '../.env') });

import app from './app.js';
import connectDB from './configs/database.js';

// Validate required environment variables in local dev
if (!process.env.MONGODB_URI) {
    console.warn('⚠️ Warning: MONGODB_URI is not defined in .env file');
}

if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET) {
    console.warn('⚠️ Warning: JWT secrets not defined in .env file');
}

const PORT = process.env.PORT || 3000;

// Connect to database and start server
connectDB()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
        });
    })
    .catch((err) => {
        console.error('Failed to connect to MongoDB:', err.message);
        // Start server anyway in dev so endpoints can be tested or show error
        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT} (without DB connection)`);
        });
    });