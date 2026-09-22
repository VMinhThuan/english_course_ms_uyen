import mongoose from 'mongoose';
import dotenv from 'dotenv';
import connectDB from '../configs/database.js';
import Course from '../models/Course.js';
import Instructor from '../models/Instructor.js';
import Review from '../models/Review.js';
import Rating from '../models/Rating.js';
import User from '../models/User.js';

dotenv.config();

const checkDatabase = async() => {
    try {
        await connectDB();

        const db = mongoose.connection.db;
        const adminDb = db.admin();

        // Get all databases
        const { databases } = await adminDb.listDatabases();
        console.log('\n📊 Available Databases:');
        databases.forEach(db => {
            console.log(`  - ${db.name} (${(db.sizeOnDisk / 1024 / 1024).toFixed(2)} MB)`);
        });

        // Get current database name
        const currentDbName = db.databaseName;
        console.log(`\n📁 Current Database: ${currentDbName}`);

        // Get all collections
        const collections = await db.listCollections().toArray();
        console.log(`\n📚 Collections in "${currentDbName}":`);
        collections.forEach(col => {
            console.log(`  - ${col.name}`);
        });

        // Count documents in each collection
        console.log('\n📊 Document Counts:');
        const courseCount = await Course.countDocuments();
        const instructorCount = await Instructor.countDocuments();
        const reviewCount = await Review.countDocuments();
        const ratingCount = await Rating.countDocuments();
        const userCount = await User.countDocuments();

        console.log(`  - Courses: ${courseCount}`);
        console.log(`  - Instructors: ${instructorCount}`);
        console.log(`  - Reviews: ${reviewCount}`);
        console.log(`  - Ratings: ${ratingCount}`);
        console.log(`  - Users: ${userCount}`);

        // Show connection info
        console.log('\n🔗 Connection Info:');
        console.log(`  - Host: ${mongoose.connection.host}`);
        console.log(`  - Database: ${mongoose.connection.name}`);
        console.log(`  - State: ${mongoose.connection.readyState === 1 ? 'Connected ✅' : 'Disconnected ❌'}`);

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
};

checkDatabase();
