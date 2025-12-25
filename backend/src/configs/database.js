import mongoose from 'mongoose';

const connectDB = async() => {
    try {
        const mongoURI = process.env.MONGODB_URI;

        if (!mongoURI) {
            console.error('❌ Error: MONGODB_URI is not defined');
            console.error('📝 Please check your .env file');
            process.exit(1);
        }

        const conn = await mongoose.connect(mongoURI);
        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`❌ MongoDB Connection Error: ${error.message}`);
        console.error('📝 Please check your MONGODB_URI in .env file');
        process.exit(1);
    }
};

export default connectDB;