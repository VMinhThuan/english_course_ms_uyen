import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
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
    role: {
        type: String,
        enum: ['student', 'teacher', 'admin'],
        default: 'student',
    },
    avatar: {
        type: String,
        default: '',
    },
    isActive: {
        type: Boolean,
        default: true,
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
    return obj;
};

const User = mongoose.model('User', userSchema);

export default User;