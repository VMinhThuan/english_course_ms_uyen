import mongoose from 'mongoose';
import dotenv from 'dotenv';
import connectDB from '../configs/database.js';
import Course from '../models/Course.js';
import Instructor from '../models/Instructor.js';
import Review from '../models/Review.js';
import Rating from '../models/Rating.js';
import User from '../models/User.js';

dotenv.config();

// English Course Data
const coursesData = [{
        slug: 'toeic-reading',
        title: 'TOEIC Reading Mastery',
        description: 'Master TOEIC reading comprehension with practice tests, strategies, and detailed explanations. This comprehensive course will help you achieve your target TOEIC score.',
        level: 'Intermediate',
        teacherName: 'Jenny Wilson',
        price: 99.99,
        discountedPrice: 49.65,
        discount: 50,
        category: 'reading',
        englishType: 'TOEIC',
        skills: ['Reading', 'Vocabulary', 'Grammar'],
        rating: 4.8,
        ratingCount: 245,
        modules: 32,
        hoursLeft: 11,
        image: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800',
        isPublished: true,
    },
    {
        slug: 'ielts-writing',
        title: 'IELTS Writing Excellence',
        description: 'Improve your IELTS writing scores with structured lessons, sample essays, and personalized feedback. Learn task 1 and task 2 strategies from experienced IELTS examiners.',
        level: 'Advanced',
        teacherName: 'Robert Fox',
        price: 99,
        discountedPrice: null,
        discount: 0,
        category: 'writing',
        englishType: 'IELTS',
        skills: ['Writing', 'Grammar', 'Vocabulary'],
        rating: 4.9,
        ratingCount: 156,
        modules: 28,
        hoursLeft: 0,
        image: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800',
        isPublished: true,
    },
    {
        slug: 'toefl-speaking',
        title: 'TOEFL Speaking Success',
        description: 'Enhance your TOEFL speaking skills with practice tests, pronunciation tips, and speaking strategies. Build confidence for all 4 speaking tasks.',
        level: 'Intermediate',
        teacherName: 'Cody Fisher',
        price: 89,
        discountedPrice: null,
        discount: 0,
        category: 'speaking',
        englishType: 'TOEFL',
        skills: ['Speaking', 'Pronunciation', 'Fluency'],
        rating: 4.7,
        ratingCount: 140,
        modules: 24,
        hoursLeft: 5,
        image: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800',
        isPublished: true,
    },
    {
        slug: 'ielts-listening',
        title: 'IELTS Listening Mastery',
        description: 'Develop your IELTS listening skills with authentic audio materials and comprehensive practice tests. Master all question types and improve your band score.',
        level: 'Intermediate',
        teacherName: 'Darrell Steward',
        price: 69,
        discountedPrice: null,
        discount: 0,
        category: 'listening',
        englishType: 'IELTS',
        skills: ['Listening', 'Note-taking', 'Comprehension'],
        rating: 4.6,
        ratingCount: 98,
        modules: 20,
        hoursLeft: 0,
        image: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800',
        isPublished: true,
    },
    {
        slug: 'toeic-listening',
        title: 'TOEIC Listening Practice',
        description: 'Improve your TOEIC listening scores with targeted exercises and test-taking strategies. Perfect for beginners starting their TOEIC journey.',
        level: 'Beginner',
        teacherName: 'Sarah Johnson',
        price: 59,
        discountedPrice: null,
        discount: 0,
        category: 'listening',
        englishType: 'TOEIC',
        skills: ['Listening', 'Comprehension'],
        rating: 4.5,
        ratingCount: 87,
        modules: 18,
        hoursLeft: 0,
        image: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800',
        isPublished: true,
    },
    {
        slug: 'general-english',
        title: 'General English Communication',
        description: 'Build your overall English proficiency with integrated skills practice for daily communication. Perfect for everyday English use.',
        level: 'Beginner',
        teacherName: 'Michael Brown',
        price: 0,
        discountedPrice: null,
        discount: 0,
        category: 'general',
        englishType: 'General',
        skills: ['Speaking', 'Listening', 'Reading', 'Writing'],
        rating: 4.7,
        ratingCount: 210,
        modules: 30,
        hoursLeft: 0,
        image: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800',
        isPublished: true,
    },
    {
        slug: 'toefl-reading',
        title: 'TOEFL Reading Comprehension',
        description: 'Master TOEFL reading passages with advanced strategies and extensive practice materials. Learn to tackle academic texts effectively.',
        level: 'Advanced',
        teacherName: 'Emily Davis',
        price: 109,
        discountedPrice: null,
        discount: 0,
        category: 'reading',
        englishType: 'TOEFL',
        skills: ['Reading', 'Critical Thinking', 'Vocabulary'],
        rating: 4.9,
        ratingCount: 134,
        modules: 35,
        hoursLeft: 0,
        image: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800',
        isPublished: true,
    },
    {
        slug: 'ielts-all-skills',
        title: 'IELTS Complete Preparation',
        description: 'Comprehensive IELTS preparation covering all four skills: Reading, Writing, Listening, and Speaking. Achieve your target band score.',
        level: 'Advanced',
        teacherName: 'David Wilson',
        price: 149,
        discountedPrice: null,
        discount: 0,
        category: 'all-skills',
        englishType: 'IELTS',
        skills: ['Reading', 'Writing', 'Listening', 'Speaking'],
        rating: 4.8,
        ratingCount: 245,
        modules: 40,
        hoursLeft: 0,
        image: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800',
        isPublished: true,
    },
    {
        slug: 'toeic-all-skills',
        title: 'TOEIC Complete Preparation',
        description: 'Complete TOEIC preparation course covering both Listening and Reading sections. Comprehensive practice tests and strategies.',
        level: 'Intermediate',
        teacherName: 'Jenny Wilson',
        price: 129,
        discountedPrice: 99.99,
        discount: 23,
        category: 'all-skills',
        englishType: 'TOEIC',
        skills: ['Listening', 'Reading', 'Vocabulary', 'Grammar'],
        rating: 4.7,
        ratingCount: 189,
        modules: 45,
        hoursLeft: 8,
        image: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800',
        isPublished: true,
    },
    {
        slug: 'ielts-speaking',
        title: 'IELTS Speaking Mastery',
        description: 'Excel in IELTS speaking with structured practice, pronunciation improvement, and fluency development. Master all three parts of the speaking test.',
        level: 'Intermediate',
        teacherName: 'Cody Fisher',
        price: 79,
        discountedPrice: null,
        discount: 0,
        category: 'speaking',
        englishType: 'IELTS',
        skills: ['Speaking', 'Pronunciation', 'Fluency', 'Vocabulary'],
        rating: 4.6,
        ratingCount: 112,
        modules: 22,
        hoursLeft: 3,
        image: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800',
        isPublished: true,
    },
    {
        slug: 'toefl-writing',
        title: 'TOEFL Writing Excellence',
        description: 'Master TOEFL integrated and independent writing tasks. Learn essay structures, time management, and scoring strategies.',
        level: 'Advanced',
        teacherName: 'Robert Fox',
        price: 94,
        discountedPrice: null,
        discount: 0,
        category: 'writing',
        englishType: 'TOEFL',
        skills: ['Writing', 'Grammar', 'Critical Thinking'],
        rating: 4.8,
        ratingCount: 167,
        modules: 26,
        hoursLeft: 0,
        image: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800',
        isPublished: true,
    },
    {
        slug: 'business-english',
        title: 'Business English Communication',
        description: 'Enhance your professional English skills for meetings, presentations, emails, and business negotiations.',
        level: 'Intermediate',
        teacherName: 'Robert Fox',
        price: 89,
        discountedPrice: 69.99,
        discount: 21,
        category: 'business',
        englishType: 'Business',
        skills: ['Speaking', 'Writing', 'Presentation', 'Negotiation'],
        rating: 4.7,
        ratingCount: 203,
        modules: 30,
        hoursLeft: 6,
        image: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800',
        isPublished: true,
    },
];

const instructorsData = [{
        name: 'Jenny Wilson',
        title: 'Senior English Instructor',
        specialization: 'TOEIC & IELTS',
        experience: '10+ years',
        bio: 'Expert in English test preparation with proven track record of helping students achieve their target scores.',
        rating: 4.9,
        students: 5000,
        courses: 25,
        avatar: 'JW',
    },
    {
        name: 'Robert Fox',
        title: 'Business English Specialist',
        specialization: 'Business Communication',
        experience: '8+ years',
        bio: 'Former corporate trainer with extensive experience in professional English communication.',
        rating: 4.8,
        students: 3500,
        courses: 18,
        avatar: 'RF',
    },
    {
        name: 'Sarah Johnson',
        title: 'Grammar & Writing Expert',
        specialization: 'Academic Writing',
        experience: '12+ years',
        bio: 'Published author and experienced educator specializing in English grammar and academic writing.',
        rating: 4.9,
        students: 6000,
        courses: 30,
        avatar: 'SJ',
    },
    {
        name: 'Cody Fisher',
        title: 'Speaking & Pronunciation Coach',
        specialization: 'Speaking & Fluency',
        experience: '7+ years',
        bio: 'Specialized in helping students improve their speaking confidence and pronunciation accuracy.',
        rating: 4.7,
        students: 2800,
        courses: 15,
        avatar: 'CF',
    },
    {
        name: 'Darrell Steward',
        title: 'Listening Skills Expert',
        specialization: 'Listening & Comprehension',
        experience: '9+ years',
        bio: 'Expert in developing listening skills through authentic materials and interactive exercises.',
        rating: 4.6,
        students: 3200,
        courses: 20,
        avatar: 'DS',
    },
    {
        name: 'Michael Brown',
        title: 'General English Instructor',
        specialization: 'General English',
        experience: '6+ years',
        bio: 'Passionate about teaching English for everyday communication and practical use.',
        rating: 4.7,
        students: 4100,
        courses: 22,
        avatar: 'MB',
    },
    {
        name: 'Emily Davis',
        title: 'Advanced English Specialist',
        specialization: 'Advanced Reading & Writing',
        experience: '11+ years',
        bio: 'Specialized in advanced English skills for academic and professional purposes.',
        rating: 4.9,
        students: 3800,
        courses: 18,
        avatar: 'ED',
    },
    {
        name: 'David Wilson',
        title: 'IELTS Complete Preparation Expert',
        specialization: 'IELTS All Skills',
        experience: '13+ years',
        bio: 'Comprehensive IELTS preparation expert with proven success in all four skills.',
        rating: 4.8,
        students: 5500,
        courses: 28,
        avatar: 'DW',
    },
];

const reviewsData = [{
        userName: 'Lina',
        userAvatar: 'L',
        rating: 5,
        timeAgo: '3 Month',
        text: 'This TOEIC Reading course has been incredibly helpful for my exam preparation. The practice tests and detailed explanations helped me understand the reading strategies better. I improved my score by 150 points!',
    },
    {
        userName: 'Sarah',
        userAvatar: 'S',
        rating: 5,
        timeAgo: '2 Month',
        text: 'Excellent course structure and comprehensive materials. The instructor explains complex grammar points clearly, and the vocabulary exercises are very practical. Highly recommend for anyone preparing for TOEIC.',
    },
    {
        userName: 'John',
        userAvatar: 'J',
        rating: 5,
        timeAgo: '1 Month',
        text: 'The IELTS Writing course exceeded my expectations. The feedback on my essays was detailed and constructive. I achieved band 7.5 thanks to this course!',
    },
    {
        userName: 'Maria',
        userAvatar: 'M',
        rating: 4,
        timeAgo: '2 Month',
        text: 'Good course for TOEFL Speaking practice. The pronunciation tips were very helpful, though I wish there were more interactive speaking exercises.',
    },
    {
        userName: 'David',
        userAvatar: 'D',
        rating: 5,
        timeAgo: '4 Month',
        text: 'IELTS Listening Mastery helped me improve from band 6 to band 7.5. The authentic audio materials and practice tests were exactly what I needed.',
    },
    {
        userName: 'Emma',
        userAvatar: 'E',
        rating: 4,
        timeAgo: '1 Month',
        text: 'Great beginner-friendly course for TOEIC Listening. The step-by-step approach made it easy to follow and understand.',
    },
    {
        userName: 'Tom',
        userAvatar: 'T',
        rating: 5,
        timeAgo: '3 Month',
        text: 'General English Communication is perfect for daily use. I can now confidently communicate in English at work and in social situations.',
    },
    {
        userName: 'Lisa',
        userAvatar: 'L',
        rating: 5,
        timeAgo: '2 Month',
        text: 'TOEFL Reading Comprehension is comprehensive and well-structured. The strategies for tackling academic texts are invaluable.',
    },
    {
        userName: 'Mike',
        userAvatar: 'M',
        rating: 4,
        timeAgo: '1 Month',
        text: 'IELTS Complete Preparation covers everything you need. All four skills are thoroughly addressed with plenty of practice materials.',
    },
    {
        userName: 'Anna',
        userAvatar: 'A',
        rating: 5,
        timeAgo: '2 Month',
        text: 'Business English Communication transformed my professional communication skills. Highly recommended for working professionals.',
    },
];

const ratingsData = {
    5: 180,
    4: 45,
    3: 15,
    2: 3,
    1: 2,
};

const seedData = async() => {
    try {
        await connectDB();

        console.log('🗑️  Clearing existing data...');
        await Course.deleteMany({});
        await Instructor.deleteMany({});
        await Review.deleteMany({});
        await Rating.deleteMany({});

        console.log('👥 Creating instructors...');
        const createdInstructors = [];

        for (const instructorData of instructorsData) {
            // Check if user exists, if not create one
            let user = await User.findOne({ fullName: instructorData.name });

            if (!user) {
                user = await User.create({
                    email: `${instructorData.name.toLowerCase().replace(/\s+/g, '.')}@example.com`,
                    password: 'password123', // Default password, should be changed
                    fullName: instructorData.name,
                    role: 'teacher',
                    phoneNumber: '',
                });
            }

            const instructor = await Instructor.create({
                ...instructorData,
                user: user._id,
            });
            createdInstructors.push({ name: instructorData.name, instructor });
        }

        console.log('📚 Creating courses...');
        const createdCourses = [];

        for (const courseData of coursesData) {
            // Find instructor by name
            const instructorName = courseData.teacherName || 'Jenny Wilson';
            const instructor = createdInstructors.find(i => i.name === instructorName)?.instructor;

            if (!instructor) {
                console.error(`Instructor not found for course: ${courseData.title}, teacherName: ${courseData.teacherName}`);
                continue;
            }

            // Remove teacherName from courseData before creating
            const { teacherName, ...courseDataWithoutTeacher } = courseData;

            // Use slug from courseData or generate from title
            const slug = courseData.slug || courseData.title
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/(^-|-$)/g, '');

            const course = await Course.create({
                ...courseDataWithoutTeacher,
                teacher: instructor.user,
                slug: slug,
            });
            createdCourses.push(course);

            // Create rating for course
            await Rating.create({
                course: course._id,
                ratings: ratingsData,
                totalRatings: Object.values(ratingsData).reduce((a, b) => a + b, 0),
                averageRating: courseData.rating,
            });

            // Create reviews for each course (distribute reviews across courses)
            const reviewsPerCourse = Math.floor(reviewsData.length / coursesData.length) +
                (createdCourses.length <= reviewsData.length % coursesData.length ? 1 : 0);

            const startIndex = (createdCourses.length - 1) * reviewsPerCourse;
            const endIndex = Math.min(startIndex + reviewsPerCourse, reviewsData.length);

            for (let i = startIndex; i < endIndex && i < reviewsData.length; i++) {
                const reviewData = reviewsData[i];

                // Find or create user for review
                let reviewUser = await User.findOne({ fullName: reviewData.userName });
                if (!reviewUser) {
                    reviewUser = await User.create({
                        email: `${reviewData.userName.toLowerCase()}@example.com`,
                        password: 'password123',
                        fullName: reviewData.userName,
                        role: 'student',
                        phoneNumber: '',
                    });
                }

                await Review.create({
                    ...reviewData,
                    course: course._id,
                    user: reviewUser._id,
                });
            }
        }

        const totalReviews = await Review.countDocuments();

        console.log(`✅ Seeded ${createdInstructors.length} instructors`);
        console.log(`✅ Seeded ${createdCourses.length} English courses`);
        console.log(`✅ Seeded ${totalReviews} reviews`);
        console.log(`✅ Seeded ${createdCourses.length} ratings`);

        console.log('🎉 Database seeding completed!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error seeding database:', error);
        process.exit(1);
    }
};

seedData();