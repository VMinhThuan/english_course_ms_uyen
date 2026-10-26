import Vocabulary from '../models/Vocabulary.js';
import Lesson from '../models/Lesson.js';
import Course from '../models/Course.js';
import DocxVocabularyParser from '../services/docxVocabularyParser.js';

const MAX_STUDENT_VOCABULARY_PAGE_SIZE = 100;
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ACCENTED_VOWELS = {
  a: 'aàáạảãâầấậẩẫăằắặẳẵ',
  e: 'eèéẹẻẽêềếệểễ',
  i: 'iìíịỉĩ',
  o: 'oòóọỏõôồốộổỗơờớợởỡ',
  u: 'uùúụủũưừứựửữ',
  y: 'yỳýỵỷỹ',
};
const createVocabularySearchRegex = (search) => {
  const normalized = String(search || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd');
  const pattern = [...normalized].map((character) => {
    if (/\s/.test(character)) return '\\s+';
    if (character === 'd') return '[dđ]';
    const vowels = ACCENTED_VOWELS[character];
    if (vowels) return `[${vowels}]`;
    return escapeRegex(character);
  }).join('');
  return new RegExp(pattern, 'i');
};

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

    const filter = { catalogOnly: { $ne: true } };
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
    const vocabulary = await Vocabulary.findOne({ _id: id, catalogOnly: { $ne: true } })
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
    const vocabulary = await Vocabulary.findOne({ _id: id, catalogOnly: { $ne: true } });

    if (!vocabulary) {
      return res.status(404).json({
        status: 'error',
        message: 'Vocabulary item not found',
      });
    }

    const updates = { ...req.body };
    delete updates.catalogOnly;
    delete updates.catalogStatus;

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

    const updatedVocabulary = await Vocabulary.findOneAndUpdate(
      { _id: id, catalogOnly: { $ne: true } },
      updates,
      {
        new: true,
        runValidators: true,
      }
    );

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
    const vocabulary = await Vocabulary.findOneAndDelete({ _id: id, catalogOnly: { $ne: true } });

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
    const { topic, search, sort = 'word_asc', ids: rawIds } = req.query;
    const isPaginatedRequest = ['page', 'limit', 'search', 'sort', 'ids']
      .some((parameter) => Object.prototype.hasOwnProperty.call(req.query, parameter));
    const pageNum = Number(req.query.page || 1);
    const limitNum = Number(req.query.limit || 50);

    if (!Number.isInteger(pageNum) || pageNum < 1 || pageNum > 1_000_000
      || !Number.isInteger(limitNum) || limitNum < 1 || limitNum > MAX_STUDENT_VOCABULARY_PAGE_SIZE) {
      return res.status(400).json({ status: 'error', code: 'INVALID_PAGINATION', message: 'Trang hoặc số lượng từ vựng không hợp lệ.' });
    }
    if (typeof search === 'string' && search.length > 80) {
      return res.status(400).json({ status: 'error', code: 'INVALID_VOCABULARY_SEARCH', message: 'Từ khóa tìm kiếm tối đa 80 ký tự.' });
    }
    if (topic !== undefined && (typeof topic !== 'string' || topic.length > 120)) {
      return res.status(400).json({ status: 'error', code: 'INVALID_VOCABULARY_TOPIC', message: 'Chủ đề từ vựng không hợp lệ.' });
    }
    if (!['word_asc', 'word_desc'].includes(sort)) {
      return res.status(400).json({ status: 'error', code: 'INVALID_VOCABULARY_SORT', message: 'Thứ tự sắp xếp từ vựng không hợp lệ.' });
    }

    const filter = { status: 'published', catalogOnly: { $ne: true } };

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

    if (rawIds !== undefined) {
      const ids = String(rawIds).split(',').filter((value) => /^[a-f\d]{24}$/i.test(value));
      if (!ids.length || ids.length > MAX_STUDENT_VOCABULARY_PAGE_SIZE) {
        return res.status(400).json({ status: 'error', code: 'INVALID_VOCABULARY_IDS', message: 'Danh sách từ vựng không hợp lệ.' });
      }
      filter._id = { $in: ids };
    }

    if (typeof search === 'string' && search.trim()) {
      const query = createVocabularySearchRegex(search);
      filter.$or = [
        { word: query },
        { meaning: query },
        { partOfSpeech: query },
        { pronunciation: query },
        { explanation: query },
        { example: query },
        { exampleEnglish: query },
        { exampleVietnamese: query },
      ];
    }

    const vocabularyQuery = Vocabulary.find(filter)
      .sort(isPaginatedRequest
        ? { word: sort === 'word_desc' ? -1 : 1, _id: 1 }
        : { order: 1, createdAt: 1 })
      .select('-__v');
    if (isPaginatedRequest) {
      vocabularyQuery.skip((pageNum - 1) * limitNum).limit(limitNum);
    }

    const [vocabulary, total, topics] = await Promise.all([
      vocabularyQuery,
      Vocabulary.countDocuments(filter),
      Vocabulary.distinct('topic', {
        status: 'published',
        catalogOnly: { $ne: true },
        ...(lessonId ? { lesson: lessonId } : {}),
      }),
    ]);

    res.json({
      status: 'success',
      data: {
        vocabulary,
        topics: topics.filter(Boolean).sort((left, right) => left.localeCompare(right, 'vi')),
        ...(isPaginatedRequest ? {
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            pages: Math.ceil(total / limitNum) || 1,
          },
        } : {}),
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Admin preview vocabulary from DOCX upload or raw text
// @route   POST /api/v1/admin/vocabulary/import-docx/preview
// @access  Private (Admin/Teacher)
export const previewDocxVocabulary = async (req, res, next) => {
  try {
    const { courseId, lessonId, rawText } = req.body;
    const file = req.file;

    if (!courseId || !lessonId) {
      return res.status(400).json({
        status: 'error',
        message: 'Vui lòng chọn khóa học và bài học đích.',
      });
    }

    if (!file && (!rawText || !rawText.trim())) {
      return res.status(400).json({
        status: 'error',
        message: 'Vui lòng tải lên file DOCX hoặc dán nội dung văn bản từ vựng.',
      });
    }

    // Verify course & lesson
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        status: 'error',
        message: 'Khóa học không tồn tại.',
      });
    }

    if (req.user && req.user.role === 'teacher' && course.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        status: 'error',
        code: 'FORBIDDEN',
        message: 'Bạn không có quyền quản lý khóa học này.',
      });
    }

    const lesson = await Lesson.findById(lessonId);
    if (!lesson) {
      return res.status(404).json({
        status: 'error',
        message: 'Bài học không tồn tại.',
      });
    }

    if (lesson.course.toString() !== courseId.toString()) {
      return res.status(400).json({
        status: 'error',
        message: 'Bài học không thuộc khóa học đã chọn.',
      });
    }

    // Parse DOCX or text
    let parseResult;
    if (file) {
      parseResult = await DocxVocabularyParser.parseDocxBuffer(file.buffer, {
        defaultTopic: lesson.topic || 'General',
        courseId,
        lessonId,
      });
    } else {
      parseResult = DocxVocabularyParser.parseText(rawText, {
        defaultTopic: lesson.topic || 'General',
        courseId,
        lessonId,
      });
    }

    const { items, summary, topics, warnings } = parseResult;

    // Check for duplicates in the target lesson
    const existingList = await Vocabulary.find({
      lesson: lessonId,
      catalogOnly: { $ne: true },
    }).select('word meaning topic partOfSpeech');
    const existingMap = new Map();
    existingList.forEach((v) => {
      existingMap.set(v.word.trim().toLowerCase(), v);
    });

    let duplicateCount = 0;
    const itemsWithDup = items.map((item) => {
      const lower = (item.word || '').trim().toLowerCase();
      const existing = existingMap.get(lower);
      if (existing) {
        duplicateCount++;
        return {
          ...item,
          isDuplicate: true,
          duplicateId: existing._id,
          existingMeaning: existing.meaning,
        };
      }
      return {
        ...item,
        isDuplicate: false,
      };
    });

    res.json({
      status: 'success',
      data: {
        course: { id: course._id, title: course.title },
        lesson: { id: lesson._id, title: lesson.title },
        file: file
          ? {
              originalName: file.originalname,
              size: file.size,
              mimetype: file.mimetype,
            }
          : null,
        totalDetected: items.length,
        summary: {
          total: items.length,
          valid: items.filter((i) => i.isValid).length,
          invalid: items.filter((i) => !i.isValid).length,
          duplicates: duplicateCount,
        },
        topics,
        items: itemsWithDup,
        warnings,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Admin confirm bulk import vocabulary from DOCX
// @route   POST /api/v1/admin/vocabulary/import-docx/confirm
// @access  Private (Admin/Teacher)
export const confirmDocxVocabularyImport = async (req, res, next) => {
  try {
    const { courseId, lessonId, items, duplicateAction = 'skip' } = req.body;

    if (!courseId || !lessonId) {
      return res.status(400).json({
        status: 'error',
        message: 'Khóa học và bài học là bắt buộc.',
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Danh sách từ vựng không được để trống.',
      });
    }

    if (items.length > 500) {
      return res.status(400).json({
        status: 'error',
        message: 'Mỗi lần import tối đa 500 từ vựng.',
      });
    }

    // Verify course & lesson
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        status: 'error',
        message: 'Khóa học không tồn tại.',
      });
    }

    if (req.user && req.user.role === 'teacher' && course.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        status: 'error',
        code: 'FORBIDDEN',
        message: 'Bạn không có quyền quản lý bài học trong khóa học này.',
      });
    }

    const lesson = await Lesson.findById(lessonId);
    if (!lesson) {
      return res.status(404).json({
        status: 'error',
        message: 'Bài học không tồn tại.',
      });
    }

    if (lesson.course.toString() !== courseId.toString()) {
      return res.status(400).json({
        status: 'error',
        message: 'Bài học không thuộc khóa học đã chọn.',
      });
    }

    // Existing vocabulary in lesson
    const existingList = await Vocabulary.find({
      lesson: lessonId,
      catalogOnly: { $ne: true },
    });
    const existingMap = new Map();
    existingList.forEach((v) => {
      existingMap.set(v.word.trim().toLowerCase(), v);
    });

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const errors = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const word = (item.word || '').trim();
      const meaning = (item.meaning || '').trim();

      if (!word || !meaning) {
        failedCount++;
        errors.push({
          index: i + 1,
          word: word || 'N/A',
          message: 'Từ vựng và nghĩa không được để trống.',
        });
        continue;
      }

      const lowerWord = word.toLowerCase();
      const isExisting = existingMap.has(lowerWord);

      if (isExisting) {
        if (duplicateAction === 'skip') {
          skippedCount++;
          continue;
        }

        if (duplicateAction === 'overwrite') {
          const existingDoc = existingMap.get(lowerWord);
          await Vocabulary.findByIdAndUpdate(existingDoc._id, {
            partOfSpeech: item.partOfSpeech || existingDoc.partOfSpeech || '',
            meaning,
            pronunciation: item.pronunciation || existingDoc.pronunciation || '',
            explanation: item.explanation || existingDoc.explanation || '',
            example: item.exampleEnglish || item.example || existingDoc.example || '',
            exampleEnglish: item.exampleEnglish || item.example || existingDoc.exampleEnglish || '',
            exampleVietnamese: item.exampleVietnamese || existingDoc.exampleVietnamese || '',
            topic: item.topic || lesson.topic || existingDoc.topic || 'General',
            order: Number(item.order) || existingDoc.order || 0,
            status: item.status || 'published',
          });
          updatedCount++;
          continue;
        }
      }

      // Create new vocabulary
      const exEng = item.exampleEnglish || item.example || '';
      const exVi = item.exampleVietnamese || '';

      await Vocabulary.create({
        word,
        partOfSpeech: item.partOfSpeech || '',
        meaning,
        pronunciation: item.pronunciation || '',
        explanation: item.explanation || '',
        example: exEng,
        exampleEnglish: exEng,
        exampleVietnamese: exVi,
        lesson: lessonId,
        course: courseId,
        topic: item.topic || lesson.topic || 'General',
        order: Number(item.order) || (existingList.length + createdCount + 1),
        status: item.status || 'published',
      });
      createdCount++;
    }

    res.json({
      status: 'success',
      message: `Đã xử lý xong: Tạo mới ${createdCount}, Cập nhật ${updatedCount}, Bỏ qua ${skippedCount}, Lỗi ${failedCount}`,
      data: {
        total: items.length,
        created: createdCount,
        updated: updatedCount,
        skipped: skippedCount,
        failed: failedCount,
        errors,
      },
    });
  } catch (error) {
    next(error);
  }
};

