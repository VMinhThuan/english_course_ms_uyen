// Load .env file FIRST before any other imports
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get current directory (ES modules) - needed for .env path
const __filename = fileURLToPath(
    import.meta.url);
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
import enrollmentRoutes from './routes/enrollmentRoutes.js';
import lessonRoutes from './routes/lessonRoutes.js';
import testRoutes from './routes/testRoutes.js';

// Validate required environment variables
if (!process.env.MONGODB_URI) {
    console.error('❌ Error: MONGODB_URI is not defined in .env file');
    console.error('📝 Please create a .env file in the backend directory with MONGODB_URI');
    console.error('📖 See MONGODB_SETUP.md for instructions');
    process.exit(1);
}

// Validate JWT secrets
if (!process.env.JWT_SECRET) {
    console.error('❌ Error: JWT_SECRET is not defined in .env file');
    console.error('📝 Please add JWT_SECRET to your .env file');
    console.error('💡 Run: npm run fix-env (or add manually)');
    process.exit(1);
}

if (!process.env.JWT_REFRESH_SECRET) {
    console.error('❌ Error: JWT_REFRESH_SECRET is not defined in .env file');
    console.error('📝 Please add JWT_REFRESH_SECRET to your .env file');
    console.error('💡 Run: npm run fix-env (or add manually)');
    process.exit(1);
}

console.log('✅ Environment variables validated');

const app = express();

// CORS configuration - Allow all origins in development
const corsOptions = {
    origin: function(origin, callback) {
        // In development, allow all origins
        if (process.env.NODE_ENV !== 'production') {
            return callback(null, true);
        }

        // In production, check allowed origins
        const allowedOrigins = [
            process.env.FRONTEND_URL || 'http://localhost:5173',
            'http://localhost:5173',
            'http://localhost:3000',
        ];

        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        if (allowedOrigins.indexOf(origin) !== -1) {
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

// Handle preflight requests explicitly
app.options('*', cors(corsOptions));

// Middlewares
app.use(cors(corsOptions));
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