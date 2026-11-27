import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const authSessionSchema = new mongoose.Schema({
    sessionId: { type: String, trim: true, maxlength: 80 },
    createdAt: { type: Date },
    lastSeenAt: { type: Date },
    refreshJti: { type: String, trim: true, maxlength: 100 },
    refreshTokenHash: { type: String, trim: true, maxlength: 128 },
    previousRefreshJti: { type: String, trim: true, maxlength: 100, default: null },
    previousRefreshTokenHash: { type: String, trim: true, maxlength: 128, default: null },
    previousRefreshValidUntil: { type: Date, default: null },
}, { _id: false, select: false });

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
    },
    username: {
        type: String,
        trim: true,
        lowercase: true,
        minlength: 3,
        maxlength: 30,
        match: /^[a-z0-9._-]+$/,
        unique: true,
        sparse: true,
    },
    password: {
        type: String,
        required: true,
        minlength: 6,
    },
    fullName: {
        type: String,
        required: false,
        trim: true,
        default: '',
    },
    phoneNumber: {
        type: String,
        required: false,
        trim: true,
        default: '',
    },
    groupName: {
        type: String,
        trim: true,
        maxlength: 100,
        default: '',
    },
    role: {
        type: String,
        enum: ['student', 'teacher', 'admin'],
        default: 'student',
    },
    status: {
        type: String,
        enum: ['pending', 'active', 'rejected', 'suspended'],
        default: 'pending',
    },
    avatar: {
        type: String,
        default: '',
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    timezone: {
        type: String,
        default: 'Asia/Ho_Chi_Minh',
        trim: true,
    },
    approvedAt: {
        type: Date,
    },
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    rejectedAt: {
        type: Date,
    },
    rejectedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    rejectionReason: {
        type: String,
        default: '',
    },
    suspendedAt: {
        type: Date,
    },
    suspendedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    // Authentication session authority. This is deliberately hidden from the
    // default User projection and is never returned by the public user shape.
    authSession: {
        type: authSessionSchema,
        default: null,
        select: false,
    },
}, {
    timestamps: true,
});

// Hash password before saving
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) {
        return next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Remove password from JSON output
userSchema.methods.toJSON = function() {
    const obj = this.toObject();
    delete obj.password;
    delete obj.authSession;
    return obj;
};

const User = mongoose.model('User', userSchema);

export default User;
