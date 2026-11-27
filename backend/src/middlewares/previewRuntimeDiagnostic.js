import crypto from 'node:crypto';
import mongoose from 'mongoose';
import connectDB from '../configs/database.js';
import LearningSession from '../models/LearningSession.js';
import { getRateLimitIndexStatus } from './rateLimit.js';

const diagnosticTokenHeader = 'x-round2-runtime-diagnostic-token';

const hasMatchingToken = (provided, expected) => {
  if (!provided || !expected) return false;
  const providedBuffer = Buffer.from(String(provided));
  const expectedBuffer = Buffer.from(String(expected));
  return providedBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(providedBuffer, expectedBuffer);
};

const notFound = (res) => res.status(404).json({ status: 'error', code: 'NOT_FOUND' });

const listLearningIndexes = async () => {
  try {
    return await LearningSession.collection.listIndexes().toArray();
  } catch (error) {
    if (error?.codeName === 'NamespaceNotFound' || error?.code === 26) return [];
    throw error;
  }
};

const getTopology = async () => {
  const client = mongoose.connection.getClient();
  const hello = await client.db('admin').command({ hello: 1 });
  return {
    type: hello.msg === 'isdbgrid' ? 'sharded-mongos' : (hello.setName ? 'replicaSet' : 'standalone'),
    setName: hello.setName || null,
    logicalSessionTimeoutMinutes: hello.logicalSessionTimeoutMinutes ?? null,
  };
};

const runReadOnlyTransactionProbe = async () => {
  const session = mongoose.connection.getClient().startSession();
  try {
    session.startTransaction();
    await mongoose.connection.db.collection('users').findOne(
      {},
      { projection: { _id: 1 }, session },
    );
    await session.abortTransaction();
    return 'PASS_READ_ONLY_ABORTED';
  } catch (error) {
    await session.abortTransaction().catch(() => {});
    return `FAIL:${error?.codeName || error?.name || 'Error'}`;
  } finally {
    await session.endSession();
  }
};

export const previewRuntimeDiagnostic = async (req, res) => {
  if (String(process.env.VERCEL_ENV || '').toLowerCase() !== 'preview') return notFound(res);
  if (!hasMatchingToken(req.get(diagnosticTokenHeader), process.env.ROUND2_RUNTIME_DIAGNOSTIC_TOKEN)) {
    return notFound(res);
  }

  try {
    await connectDB();
    const learningIndexes = await listLearningIndexes();
    const duplicateActiveStudents = await LearningSession.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: '$student', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 10 },
    ]);
    const rateLimitIndexes = await getRateLimitIndexStatus();
    const topology = await getTopology();
    const learningSessionIndex = learningIndexes.find((index) => (
      index.name === 'learning_session_one_active_per_student'
      && index.unique === true
      && JSON.stringify(index.partialFilterExpression) === JSON.stringify({ status: 'active' })
    ));

    return res.json({
      status: 'success',
      runtime: {
        nodeEnv: process.env.NODE_ENV || 'development',
        vercelEnv: process.env.VERCEL_ENV || null,
        vercelRegion: process.env.VERCEL_REGION || null,
        trustProxyHops: process.env.TRUST_PROXY_HOPS === undefined ? 0 : Number(process.env.TRUST_PROXY_HOPS),
      },
      request: {
        ip: req.ip || null,
        ips: Array.isArray(req.ips) ? req.ips : [],
        socketRemoteAddress: req.socket?.remoteAddress || null,
        headers: {
          xForwardedFor: req.get('x-forwarded-for') || null,
          xRealIp: req.get('x-real-ip') || null,
          forwarded: req.get('forwarded') || null,
        },
      },
      database: {
        name: mongoose.connection.name || null,
        topology,
        transactionProbe: await runReadOnlyTransactionProbe(),
        rateLimitIndexes,
        learningSession: {
          collectionPresent: learningIndexes.length > 0,
          requiredUniqueIndexPresent: Boolean(learningSessionIndex),
          duplicateActiveStudents: duplicateActiveStudents.length,
        },
      },
    });
  } catch (error) {
    console.error('Preview runtime diagnostic failed', {
      errorName: error?.name || 'Error',
      errorCode: typeof error?.code === 'string' ? error.code : undefined,
    });
    return res.status(503).json({
      status: 'error',
      code: 'PREVIEW_RUNTIME_DIAGNOSTIC_UNAVAILABLE',
      message: 'Preview runtime diagnostic is unavailable.',
    });
  }
};
