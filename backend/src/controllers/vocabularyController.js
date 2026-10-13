import Vocabulary from '../models/Vocabulary.js';
import Lesson from '../models/Lesson.js';

// @desc    Admin create vocabulary
// @route   POST /api/v1/admin/vocabulary
// @access  Private (Admin/Teacher)
export const createVocabulary = async (req, res, next) => {
  try {
    const {
      word,
      meaning,
      partOfSpeech,
      pronunciation,
      explanation,
      example,
      exampleEnglish,
      exampleVietnamese,
      audioUrl,
      lessonId,
      lesson: lessonParam,
      topic,
      order,
      status,
    } = req.body;
    const targetLessonId = lessonId || lessonParam;

    if (!targetLessonId) {
      return res.status(400).json({
        status: 'error',
        message: 'Lesson ID is required',
      });
    }

    if (!word || !meaning) {
      return res.status(400).json({
        status: 'error',
        message: 'Word and meaning are required',
      });
    }

    // Validate referenced lesson exists
    const parentLesson = await Lesson.findById(targetLessonId);
    if (!parentLesson) {
      return res.status(404).json({
        status: 'error',
        message: 'Referenced lesson does not exist',
      });
    }

    const exEng = exampleEnglish || example || '';
    const exVi = exampleVietnamese || '';

    const vocabulary = await Vocabulary.create({
      word,
      meaning,
      partOfSpeech: partOfSpeech || '',
      pronunciation: pronunciation || '',
      explanation: explanation || '',
      example: example || exEng,
      exampleEnglish: exEng,
      exampleVietnamese: exVi,
      audioUrl: audioUrl || '',
      lesson: parentLesson._id,
      course: parentLesson.course, // Derived strictly on backend
      topic: topic || parentLesson.topic || 'General',
      order: order !== undefined ? parseInt(order, 10) : 0,
      status: status || 'published',
    });

    res.status(201).json({
      status: 'success',
      message: 'Vocabulary word created successfully',
      data: {
        vocabulary,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Admin get vocabulary list with search & filters & pagination
// @route   GET /api/v1/admin/vocabulary
// @access  Private (Admin/Teacher)
export const getAdminVocabulary = async (req, res, next) => {
  try {
    const { lesson, lessonId, topic, status, search, page = 1, limit = 50 } = req.query;

    const filter = {};
    const targetLesson = lessonId || lesson;

    if (targetLesson) filter.lesson = targetLesson;
    if (topic) filter.topic = topic;
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { word: { $regex: search, $options: 'i' } },
        { meaning: { $regex: search, $options: 'i' } },
        { explanation: { $regex: search, $options: 'i' } },
        { exampleEnglish: { $regex: search, $options: 'i' } },
      ];
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;

    const total = await Vocabulary.countDocuments(filter);
    const vocabularyList = await Vocabulary.find(filter)
      .populate('lesson', 'title status')
      .populate('course', 'title')
      .sort({ order: 1, createdAt: 1 })
      .skip(skip)
      .limit(limitNum);

    res.json({
      status: 'success',
      data: {
        vocabulary: vocabularyList,
        pagination: {
          total,
          page: pageNum,
          pages: Math.ceil(total / limitNum) || 1,
          limit: limitNum,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Admin get vocabulary item by ID
// @route   GET /api/v1/admin/vocabulary/:id
// @access  Private (Admin/Teacher)
export const getAdminVocabularyById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const vocabulary = await Vocabulary.findById(id)
      .populate('lesson', 'title status')
      .populate('course', 'title');

    if (!vocabulary) {
      return res.status(404).json({
        status: 'error',
        message: 'Vocabulary item not found',
      });
    }

    res.json({
      status: 'success',
      data: {
        vocabulary,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Admin update vocabulary
// @route   PUT /api/v1/admin/vocabulary/:id
// @access  Private (Admin/Teacher)
export const updateVocabulary = async (req, res, next) => {
  try {
    const { id } = req.params;
    const vocabulary = await Vocabulary.findById(id);

    if (!vocabulary) {
      return res.status(404).json({
        status: 'error',
        message: 'Vocabulary item not found',
      });
    }

    const updates = { ...req.body };

    if (updates.exampleEnglish && !updates.example) {
      updates.example = updates.exampleEnglish;
    } else if (updates.example && !updates.exampleEnglish) {
      updates.exampleEnglish = updates.example;
    }

    if (updates.lesson || updates.lessonId) {
      const targetLessonId = updates.lessonId || updates.lesson;
      const parentLesson = await Lesson.findById(targetLessonId);
      if (!parentLesson) {
        return res.status(404).json({
          status: 'error',
          message: 'Referenced lesson does not exist',
        });
      }
      updates.lesson = parentLesson._id;
      updates.course = parentLesson.course;
    }

    const updatedVocabulary = await Vocabulary.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    res.json({
      status: 'success',
      message: 'Vocabulary updated successfully',
      data: {
        vocabulary: updatedVocabulary,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Admin delete vocabulary
// @route   DELETE /api/v1/admin/vocabulary/:id
// @access  Private (Admin/Teacher)
export const deleteVocabulary = async (req, res, next) => {
  try {
    const { id } = req.params;
    const vocabulary = await Vocabulary.findByIdAndDelete(id);

    if (!vocabulary) {
      return res.status(404).json({
        status: 'error',
        message: 'Vocabulary item not found',
      });
    }

    res.json({
      status: 'success',
      message: 'Vocabulary item deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Student get vocabulary list for a lesson or topic
// @route   GET /api/v1/lessons/:lessonId/vocabulary OR /api/v1/vocabulary/lesson/:lessonId
// @access  Private (Student/Admin)
export const getStudentVocabularyByLesson = async (req, res, next) => {
  try {
    const lessonId = req.params.lessonId || req.query.lessonId || req.query.lesson;
    const { topic } = req.query;

    const filter = { status: 'published' };

    if (lessonId) {
      const lesson = await Lesson.findById(lessonId);
      if (!lesson) {
        return res.status(404).json({
          status: 'error',
          message: 'Lesson not found',
        });
      }

      if (req.user && req.user.role === 'student' && lesson.status !== 'published') {
        return res.status(404).json({
          status: 'error',
          message: 'Lesson not found',
        });
      }
      filter.lesson = lessonId;
    }

    if (topic) {
      filter.topic = topic;
    }

    const vocabulary = await Vocabulary.find(filter)
      .sort({ order: 1, createdAt: 1 })
      .select('-__v');

    res.json({
      status: 'success',
      data: {
        vocabulary,
      },
    });
  } catch (error) {
    next(error);
  }
};
