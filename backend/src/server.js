import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import connectDB from './configs/database.js';
import { errorHandler } from './middlewares/errorHandler.js';

// Import routes
import authRoutes from './routes/authRoutes.js';
import courseRoutes from './routes/courseRoutes.js';
import enrollmentRoutes from './routes/enrollmentRoutes.js';
import lessonRoutes from './routes/lessonRoutes.js';
import testRoutes from './routes/testRoutes.js';

// Get current directory (ES modules)
const __filename = fileURLToPath(
    import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from backend root directory
dotenv.config({ path: join(__dirname, '../.env') });

// Validate required environment variables
if (!process.env.MONGODB_URI) {
    console.error('❌ Error: MONGODB_URI is not defined in .env file');
    console.error('📝 Please create a .env file in the backend directory with MONGODB_URI');
    console.error('📖 See MONGODB_SETUP.md for instructions');
    process.exit(1);
}

const app = express();

// Middlewares
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/courses', courseRoutes);
app.use('/api/v1/enrollments', enrollmentRoutes);
app.use('/api/v1/lessons', lessonRoutes);
app.use('/api/v1/tests', testRoutes);

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'success',
        message: 'Server is running',
    });
});

// Error handler (must be last)
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

// Connect to database
connectDB();

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});