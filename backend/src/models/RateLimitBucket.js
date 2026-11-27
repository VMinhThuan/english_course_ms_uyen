import mongoose from 'mongoose';

const rateLimitBucketSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      maxlength: 512,
    },
    scope: {
      type: String,
      required: true,
      maxlength: 120,
    },
    count: {
      type: Number,
      required: true,
      min: 1,
    },
    windowStart: {
      type: Date,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    collection: 'rate_limit_buckets',
    versionKey: false,
    bufferCommands: false,
  },
);

rateLimitBucketSchema.index(
  { key: 1 },
  { unique: true, name: 'rate_limit_bucket_key_unique' },
);
rateLimitBucketSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, name: 'rate_limit_bucket_expires_ttl' },
);

const RateLimitBucket = mongoose.model('RateLimitBucket', rateLimitBucketSchema);

export default RateLimitBucket;
