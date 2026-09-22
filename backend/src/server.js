// Load .env file FIRST before any other imports
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get current directory (ES modules) - needed for .env path
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from backend root directory BEFORE other imports
dotenv.config({ path: join(__dirname, '../.env') });

// Now import other modules (they can safely use process.env)
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import connectDB from './configs/database.js';
import { errorHandler } from './middlewares/errorHandler.js';

// Import routes
import authRoutes from './routes/authRoutes.js';
import courseRoutes from './routes/courseRoutes.js';
import instructorRoutes from './routes/instructorRoutes.js';
import enrollmentRoutes from './routes/enrollmentRoutes.js';
import lessonRoutes from './routes/lessonRoutes.js';
import materialRoutes from './routes/materialRoutes.js';
import vocabularyRoutes from './routes/vocabularyRoutes.js';
import progressRoutes from './routes/progressRoutes.js';
import testRoutes from './routes/testRoutes.js';
import questionRoutes from './routes/questionRoutes.js';
import assessmentRoutes from './routes/assessmentRoutes.js';
import attemptRoutes from './routes/attemptRoutes.js';
import adminRoutes from './routes/adminRoutes.js';

// Validate required environment variables
if (!process.env.MONGODB_URI) {
    console.error('❌ Error: MONGODB_URI is not defined in .env file');
    process.exit(1);
}

if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET) {
    console.error('❌ Error: JWT secrets not defined in .env file');
    process.exit(1);
}

console.log('✅ Environment variables validated');

const app = express();

const corsOptions = {
    origin: function(origin, callback) {
        if (process.env.NODE_ENV !== 'production') {
            return callback(null, true);
        }
        const allowedOrigins = [
            process.env.FRONTEND_URL || 'http://localhost:5173',
            'http://localhost:5173',
            'http://localhost:3000',
        ];
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    exposedHeaders: ['Authorization'],
    preflightContinue: false,
    optionsSuccessStatus: 204,
};

app.options('*', cors(corsOptions));
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve uploaded static files
app.use('/uploads', express.static(join(__dirname, '../uploads')));

import { adminToeicRoutes, studentToeicRoutes } from './routes/toeicRoutes.js';
import mediaRoutes from './routes/mediaRoutes.js';

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/courses', courseRoutes);
app.use('/api/v1/instructors', instructorRoutes);
app.use('/api/v1/enrollments', enrollmentRoutes);
app.use('/api/v1/lessons', lessonRoutes);
app.use('/api/v1/materials', materialRoutes);
app.use('/api/v1/vocabulary', vocabularyRoutes);
app.use('/api/v1/progress', progressRoutes);
app.use('/api/v1/tests', testRoutes);
app.use('/api/v1/questions', questionRoutes);
app.use('/api/v1/assessments', assessmentRoutes);
app.use('/api/v1/attempts', attemptRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/admin', adminToeicRoutes);
app.use('/api/v1/admin/media', mediaRoutes);
app.use('/api/v1/toeic', studentToeicRoutes);


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