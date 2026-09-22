import Instructor from '../models/Instructor.js';
import Course from '../models/Course.js';

// @desc    Get all instructors
// @route   GET /api/v1/instructors
// @access  Public
export const getInstructors = async (req, res, next) => {
  try {
    const { courseId } = req.query;
    const query = { isActive: true };

    // If courseId provided, get instructors for that course
    // For now, return all active instructors
    const instructors = await Instructor.find(query)
      .populate('user', 'fullName email avatar')
      .sort({ rating: -1 });

    const instructorsData = instructors.map(instructor => {
      const instructorObj = instructor.toObject();
      return {
        id: instructorObj._id.toString(),
        name: instructorObj.name,
        title: instructorObj.title,
        specialization: instructorObj.specialization,
        experience: instructorObj.experience,
        bio: instructorObj.bio,
        rating: instructorObj.rating,
        students: instructorObj.students,
        courses: instructorObj.courses,
        avatar: instructorObj.avatar,
        user: instructorObj.user,
      };
    });

    res.json({
      success: true,
      data: {
        instructors: instructorsData,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get instructor by ID
// @route   GET /api/v1/instructors/:id
// @access  Public
export const getInstructorById = async (req, res, next) => {
  try {
    const instructor = await Instructor.findById(req.params.id)
      .populate('user', 'fullName email avatar');

    if (!instructor) {
      return res.status(404).json({
        success: false,
        message: 'Instructor not found',
      });
    }

    // Get courses taught by this instructor
    const courses = await Course.find({ 
      teacher: instructor.user._id,
      isPublished: true 
    })
      .select('title description level price rating ratingCount englishType')
      .limit(10);

    const instructorObj = instructor.toObject();
    res.json({
      success: true,
      data: {
        instructor: {
          id: instructorObj._id.toString(),
          name: instructorObj.name,
          title: instructorObj.title,
          specialization: instructorObj.specialization,
          experience: instructorObj.experience,
          bio: instructorObj.bio,
          rating: instructorObj.rating,
          students: instructorObj.students,
          courses: instructorObj.courses,
          avatar: instructorObj.avatar,
          user: instructorObj.user,
          courses: courses,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get instructors by course
// @route   GET /api/v1/instructors/course/:courseId
// @access  Public
export const getInstructorsByCourse = async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.courseId);
    
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      });
    }

    // Get instructor for this course
    const instructor = await Instructor.findOne({ user: course.teacher })
      .populate('user', 'fullName email avatar');

    if (!instructor) {
      return res.json({
        success: true,
        data: {
          instructors: [],
        },
      });
    }

    const instructorObj = instructor.toObject();
    res.json({
      success: true,
      data: {
        instructors: [{
          id: instructorObj._id.toString(),
          name: instructorObj.name,
          title: instructorObj.title,
          specialization: instructorObj.specialization,
          experience: instructorObj.experience,
          bio: instructorObj.bio,
          rating: instructorObj.rating,
          students: instructorObj.students,
          courses: instructorObj.courses,
          avatar: instructorObj.avatar,
        }],
      },
    });
  } catch (error) {
    next(error);
  }
};


