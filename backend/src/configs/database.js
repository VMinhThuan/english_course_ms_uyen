import mongoose from 'mongoose';

let connectingPromise = null;

// Do not queue model operations while MongoDB is unavailable. Every HTTP API
// route is gated by createDatabaseReadinessMiddleware() before reaching a
// controller, so buffering would only turn a deterministic 503 into a later,
// harder-to-diagnose query timeout.
mongoose.set('bufferCommands', false);

export const getDatabaseConnectionOptions = (env = process.env) => ({
    serverSelectionTimeoutMS: Number(env.MONGODB_TIMEOUT_MS) || (String(env.NODE_ENV || '').toLowerCase() === 'test' ? 5000 : 30000),
    connectTimeoutMS: Number(env.MONGODB_CONNECT_TIMEOUT_MS) || (String(env.NODE_ENV || '').toLowerCase() === 'test' ? 5000 : 30000),
    bufferCommands: false,
    autoIndex: ['development', 'test'].includes(String(env.NODE_ENV || '').toLowerCase())
      && String(env.MONGOOSE_AUTO_INDEX || '').toLowerCase() === 'true',
});

export const isDatabaseReady = () => mongoose.connection.readyState === 1;

export const databaseUnavailableResponse = {
    status: 'error',
    code: 'DATABASE_UNAVAILABLE',
    message: 'Dịch vụ cơ sở dữ liệu hiện chưa sẵn sàng. Vui lòng thử lại sau.',
};

// This is deliberately a middleware factory so it can be tested without a
// network connection and reused by any future router mounted outside /api.
export const createDatabaseReadinessMiddleware = ({ connect = connectDB, logger = console } = {}) => async (req, res, next) => {
    if (req.method === 'OPTIONS') return next();

    try {
        await connect();
        return next();
    } catch (error) {
        // Keep connection details (and any URI parsing details) out of HTTP
        // responses. The server log retains the error needed for operations.
        logger.error('Database is unavailable for API request', {
            errorName: error?.name || 'Error',
            errorCode: typeof error?.code === 'string' ? error.code : undefined,
        });
        res.set('Retry-After', '5');
        return res.status(503).json(databaseUnavailableResponse);
    }
};

const connectDB = async () => {
    // If already connected, reuse existing connection
    if (mongoose.connection.readyState === 1) {
        return mongoose.connection;
    }

    if (connectingPromise) {
        return connectingPromise;
    }

    const mongoURI = process.env.MONGODB_URI;

    if (!mongoURI) {
        const errorMsg = 'MONGODB_URI is not defined in environment variables';
        console.error(`❌ Error: ${errorMsg}`);
        throw new Error(errorMsg);
    }

    connectingPromise = mongoose.connect(mongoURI, getDatabaseConnectionOptions())
        .then((conn) => {
            connectingPromise = null;
            console.log(`✅ MongoDB Connected: ${conn.connection.name || conn.connection.host || 'ready'}`);
            return conn;
        })
        .catch((error) => {
            connectingPromise = null;
            console.error(`❌ MongoDB Connection Error: ${error.message}`);
            throw error;
        });

    return connectingPromise;
};

export default connectDB;
