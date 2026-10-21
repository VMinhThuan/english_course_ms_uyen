import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { errorHandler } from './middlewares/errorHandler.js';
import connectDB from './configs/database.js';
import { protectLegacyUpload, protectPrivateUpload, protectPublicUpload } from './middlewares/protectedUploads.js';
import { getPublicUploadDir, getUploadDir } from './utils/uploadConfig.js';

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
import { adminToeicRoutes, studentToeicRoutes } from './routes/toeicRoutes.js';
import mediaRoutes from './routes/mediaRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env if present (local dev)
dotenv.config({ path: join(__dirname, '../.env') });

const app = express();

const normalizeOrigin = (value) => {
    const trimmed = value.trim();
    try {
        return new URL(trimmed).origin;
    } catch {
        return trimmed.replace(/\/+$/, '');
    }
};

const allowedOrigins = new Set([
    process.env.FRONTEND_URL,
    ...(process.env.FRONTEND_ORIGINS || '').split(','),
    'https://frontend-ru4l.vercel.app',
].filter((origin) => typeof origin === 'string' && origin.trim()).map(normalizeOrigin));

const corsOptions = {
    origin: function(origin, callback) {
        if (!origin) return callback(null, true);
        if (process.env.NODE_ENV !== 'production') return callback(null, true);

        // Credentialed cross-site cookies require an explicit trusted origin.
        if (allowedOrigins.has(normalizeOrigin(origin))) {
            callback(null, true);
        } else {
            callback(new Error(`Not allowed by CORS: ${origin}`));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    exposedHeaders: ['Authorization', 'Content-Disposition'],
    preflightContinue: false,
    optionsSuccessStatus: 204,
};

// 1. CORS first - handles preflight OPTIONS without touching database
app.options('*', cors(corsOptions));
app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const uploadStaticHeaders = (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
};

// New public media is separated from lesson/material uploads. Private and legacy files are
// intercepted before static serving so a public URL cannot bypass a Material access check.
app.use('/uploads/public', protectPublicUpload, express.static(getPublicUploadDir(), { setHeaders: uploadStaticHeaders }));
app.use('/uploads/private', protectPrivateUpload);
app.use('/uploads', protectLegacyUpload, express.static(getUploadDir(), { setHeaders: uploadStaticHeaders }));

// 2. Fast health endpoints - no database required
app.get('/', (req, res) => {
    res.json({
        status: 'success',
        message: 'English Course Backend API is running on Vercel',
        version: '1.0.0',
    });
});

app.get('/health', (req, res) => {
    res.json({
        status: 'success',
        message: 'Server is healthy',
        env: process.env.NODE_ENV || 'development',
    });
});

// 3. Database connection middleware for API routes only
app.use('/api', async (req, res, next) => {
    // OPTIONS already handled by cors middleware
    if (req.method === 'OPTIONS') {
        return next();
    }
    try {
        await connectDB();
        next();
    } catch (err) {
        console.error('Database connection error in /api middleware:', err.message);
        return res.status(500).json({
            status: 'error',
            message: 'Database connection failed. Please check MONGODB_URI and ensure 0.0.0.0/0 is whitelisted in MongoDB Atlas Network Access.',
            error: err.message,
        });
    }
});

// 4. API Routes
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

// Error handler (must be last)
app.use(errorHandler);

export default app;
