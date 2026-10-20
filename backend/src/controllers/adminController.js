import User from '../models/User.js';

const STUDENT_SELECT = 'fullName email username phoneNumber role status isActive createdAt updatedAt approvedAt lastLoginAt';
const STUDENT_STATUSES = new Set(['pending', 'active', 'rejected', 'suspended']);
const VIETNAMESE_LETTER_PATTERN = {
  a: '[aàáảãạăằắẳẵặâầấẩẫậ]',
  d: '[dđ]',
  e: '[eèéẻẽẹêềếểễệ]',
  i: '[iìíỉĩị]',
  o: '[oòóỏõọôồốổỗộơờớởỡợ]',
  u: '[uùúủũụưừứửữự]',
  y: '[yỳýỷỹỵ]',
};

const safeStudentSearchRegex = (value) => {
  const folded = value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  const pattern = Array.from(folded).map((character) => {
    if (character === ' ') return '\\s+';
    if (VIETNAMESE_LETTER_PATTERN[character]) return VIETNAMESE_LETTER_PATTERN[character];
    return character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('');
  return new RegExp(pattern, 'iu');
};

const parseBoundedInteger = (value, fallback, maximum) => {
  if (value === undefined || value === '') return fallback;
  if (!/^[0-9]+$/.test(String(value))) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : null;
};

const safeStudent = (student) => ({
  _id: student._id,
  id: student._id,
  fullName: student.fullName,
  email: student.email,
  username: student.username || '',
  phoneNumber: student.phoneNumber || '',
  role: student.role,
  status: student.status,
  isActive: student.isActive,
  createdAt: student.createdAt,
  updatedAt: student.updatedAt,
  approvedAt: student.approvedAt || null,
  lastLoginAt: student.lastLoginAt || null,
});

// @desc    Get list of students (with filtering, search, pagination)
// @route   GET /api/v1/admin/students
// @access  Private (Admin only)
export const getStudents = async (req, res, next) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;

    const query = { role: 'student' };

    if (status && String(status).toUpperCase() !== 'ALL') {
      const normalizedStatus = String(status).toLowerCase();
      if (!STUDENT_STATUSES.has(normalizedStatus)) {
        return res.status(400).json({ status: 'error', code: 'INVALID_STATUS', message: 'Trạng thái học viên không hợp lệ.' });
      }
      query.status = normalizedStatus;
    }

    if (search) {
      if (typeof search !== 'string' || search.trim().length > 80) {
        return res.status(400).json({ status: 'error', code: 'INVALID_SEARCH', message: 'Từ khóa tìm kiếm quá dài.' });
      }
      const searchRegex = safeStudentSearchRegex(search);
      query.$or = [
        { fullName: searchRegex },
        { email: searchRegex },
        { username: searchRegex },
        { phoneNumber: searchRegex },
      ];
    }

    const pageNum = parseBoundedInteger(page, 1, 1000000);
    const limitNum = parseBoundedInteger(limit, 20, 100);
    if (pageNum === null || limitNum === null) {
      return res.status(400).json({ status: 'error', code: 'INVALID_PAGINATION', message: 'Trang hoặc số dòng mỗi trang không hợp lệ.' });
    }
    const skip = (pageNum - 1) * limitNum;

    const [students, total] = await Promise.all([
      User.find(query)
        .select(STUDENT_SELECT)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      User.countDocuments(query),
    ]);

    res.json({
      status: 'success',
      data: {
        students: students.map(safeStudent),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getStudent = async (req, res, next) => {
  try {
    if (!/^[\da-f]{24}$/i.test(req.params.id)) {
      return res.status(400).json({ status: 'error', code: 'INVALID_STUDENT_ID', message: 'Mã học viên không hợp lệ.' });
    }
    const student = await User.findOne({ _id: req.params.id, role: 'student' }).select(STUDENT_SELECT).lean();
    if (!student) return res.status(404).json({ status: 'error', message: 'Không tìm thấy thông tin học viên' });
    return res.json({ status: 'success', data: { student: safeStudent(student) } });
  } catch (error) { return next(error); }
};

// @desc Create an active student account from the admin UI.
// @route POST /api/v1/admin/students
// @access Private (existing admin/teacher RBAC)
export const createStudent = async (req, res, next) => {
  try {
    const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim().replace(/\s+/g, ' ') : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const errors = {};

    if (!fullName) errors.fullName = 'Vui lòng nhập họ và tên.';
    else if (fullName.length > 100) errors.fullName = 'Họ và tên không được vượt quá 100 ký tự.';
    else if (/[\u0000-\u001f\u007f]/.test(fullName)) errors.fullName = 'Họ và tên chứa ký tự không hợp lệ.';
    if (!email) errors.email = 'Vui lòng nhập email.';
    else if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Email không hợp lệ.';
    if (!username) errors.username = 'Vui lòng nhập tên đăng nhập.';
    else if (!/^[a-z0-9._-]{3,30}$/.test(username)) errors.username = 'Tên đăng nhập gồm 3–30 ký tự: chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.';
    if (!password) errors.password = 'Vui lòng nhập mật khẩu ban đầu.';
    else if (password.length < 6 || Buffer.byteLength(password, 'utf8') > 72) errors.password = 'Mật khẩu phải có ít nhất 6 ký tự và tối đa 72 byte UTF-8.';

    if (Object.keys(errors).length) {
      return res.status(400).json({ status: 'error', code: 'VALIDATION_ERROR', message: 'Thông tin học viên chưa hợp lệ.', errors });
    }

    const existing = await User.findOne({ $or: [{ email }, { username }] }).select('email username').lean();
    if (existing) {
      const duplicateField = existing.email === email ? 'email' : 'username';
      const message = duplicateField === 'email' ? 'Email này đã được sử dụng.' : 'Tên đăng nhập này đã được sử dụng.';
      return res.status(409).json({ status: 'error', code: 'STUDENT_ALREADY_EXISTS', field: duplicateField, message });
    }

    const student = await User.create({
      fullName,
      email,
      username,
      password,
      role: 'student',
      status: 'active',
      isActive: true,
      approvedAt: new Date(),
      approvedBy: req.user._id,
    });
    return res.status(201).json({
      status: 'success',
      message: 'Đã tạo tài khoản học viên. Học viên có thể đăng nhập ngay bằng email hoặc tên đăng nhập.',
      data: { student: safeStudent(student) },
    });
  } catch (error) {
    if (error?.code === 11000) {
      const key = Object.keys(error.keyPattern || {})[0] || 'email';
      const field = key === 'username' ? 'username' : 'email';
      return res.status(409).json({
        status: 'error',
        code: 'STUDENT_ALREADY_EXISTS',
        field,
        message: field === 'username' ? 'Tên đăng nhập này đã được sử dụng.' : 'Email này đã được sử dụng.',
      });
    }
    if (error?.name === 'ValidationError') {
      return res.status(400).json({ status: 'error', code: 'VALIDATION_ERROR', message: 'Thông tin học viên chưa hợp lệ.' });
    }
    return next(error);
  }
};

// Helper to check target student account
const getTargetStudent = async (id, res) => {
  const user = await User.findById(id);
  if (!user) {
    res.status(404).json({
      status: 'error',
      message: 'Không tìm thấy thông tin học viên',
    });
    return null;
  }

  if (user.role !== 'student') {
    res.status(400).json({
      status: 'error',
      code: 'CANNOT_MODIFY_NON_STUDENT',
      message: 'Hệ thống quản lý học viên không được phép chỉnh sửa tài khoản Admin/Giảng viên.',
    });
    return null;
  }

  return user;
};

// @desc    Approve student account (pending -> active)
// @route   PATCH /api/v1/admin/students/:id/approve
// @access  Private (Admin only)
export const approveStudent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const student = await getTargetStudent(id, res);
    if (!student) return;

    if (student.status !== 'pending') {
      return res.status(400).json({
        status: 'error',
        code: 'INVALID_STATE_TRANSITION',
        message: 'Trạng thái tài khoản hiện tại không cho phép thao tác này.',
      });
    }

    student.status = 'active';
    student.isActive = true;
    student.approvedAt = new Date();
    student.approvedBy = req.user._id;
    await student.save();

    res.json({
      status: 'success',
      message: 'Đã phê duyệt tài khoản học viên thành công (ACTIVE)',
      data: {
        student,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Reject student account (pending -> rejected)
// @route   PATCH /api/v1/admin/students/:id/reject
// @access  Private (Admin only)
export const rejectStudent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason = '' } = req.body;
    const student = await getTargetStudent(id, res);
    if (!student) return;

    if (student.status !== 'pending') {
      return res.status(400).json({
        status: 'error',
        code: 'INVALID_STATE_TRANSITION',
        message: 'Trạng thái tài khoản hiện tại không cho phép thao tác này.',
      });
    }

    student.status = 'rejected';
    student.rejectedAt = new Date();
    student.rejectedBy = req.user._id;
    student.rejectionReason = reason;
    await student.save();

    res.json({
      status: 'success',
      message: 'Đã từ chối tài khoản học viên (REJECTED)',
      data: {
        student,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Suspend active student account (active -> suspended)
// @route   PATCH /api/v1/admin/students/:id/suspend
// @access  Private (Admin only)
export const suspendStudent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const student = await getTargetStudent(id, res);
    if (!student) return;

    if (student.status !== 'active') {
      return res.status(400).json({
        status: 'error',
        code: 'INVALID_STATE_TRANSITION',
        message: 'Trạng thái tài khoản hiện tại không cho phép thao tác này.',
      });
    }

    student.status = 'suspended';
    student.isActive = false;
    student.suspendedAt = new Date();
    student.suspendedBy = req.user._id;
    await student.save();

    res.json({
      status: 'success',
      message: 'Đã tạm khóa tài khoản học viên (SUSPENDED)',
      data: {
        student,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Activate suspended student account (suspended -> active)
// @route   PATCH /api/v1/admin/students/:id/activate
// @access  Private (Admin only)
export const activateStudent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const student = await getTargetStudent(id, res);
    if (!student) return;

    if (student.status !== 'suspended') {
      return res.status(400).json({
        status: 'error',
        code: 'INVALID_STATE_TRANSITION',
        message: 'Trạng thái tài khoản hiện tại không cho phép thao tác này.',
      });
    }

    student.status = 'active';
    student.isActive = true;
    student.approvedAt = new Date();
    student.approvedBy = req.user._id;
    await student.save();

    res.json({
      status: 'success',
      message: 'Đã kích hoạt lại tài khoản học viên (ACTIVE)',
      data: {
        student,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get aggregated Admin system statistics from real database
// @route   GET /api/v1/admin/stats
// @access  Private (Admin only)
export const getAdminStats = async (req, res, next) => {
  try {
    const Lesson = (await import('../models/Lesson.js')).default;
    const Assessment = (await import('../models/Assessment.js')).default;
    const Attempt = (await import('../models/Attempt.js')).default;

    const [
      totalStudents,
      pendingStudents,
      activeStudents,
      publishedLessons,
      totalAssessments,
      completedAttempts,
      submittedAttempts,
      pendingStudentList,
      recentStudentResults,
    ] = await Promise.all([
      User.countDocuments({ role: 'student' }),
      User.countDocuments({ role: 'student', status: 'pending' }),
      User.countDocuments({ role: 'student', status: 'active' }),
      Lesson.countDocuments({ status: 'published' }),
      Assessment.countDocuments({}),
      Attempt.countDocuments({ status: 'submitted' }),
      Attempt.find({ status: 'submitted' }).select('score maxScore scorePercentage'),
      User.find({ role: 'student', status: 'pending' })
        .select('-password')
        .sort({ createdAt: -1 })
        .limit(5),
      Attempt.find({ status: 'submitted' })
        .populate('student', 'fullName email')
        .populate('assessment', 'title type passScore totalScore')
        .sort({ submittedAt: -1 })
        .limit(5),
    ]);

    let avgPercentage = 0;
    if (submittedAttempts.length > 0) {
      const sumPerc = submittedAttempts.reduce(
        (acc, curr) => acc + (curr.scorePercentage ?? (curr.maxScore > 0 ? Math.round((curr.score / curr.maxScore) * 100) : 0)),
        0
      );
      avgPercentage = Math.round(sumPerc / submittedAttempts.length);
    }

    res.json({
      status: 'success',
      data: {
        totalStudents,
        pendingStudents,
        activeStudents,
        publishedLessons,
        totalAssessments,
        completedAttempts,
        averageScore: avgPercentage,
        pendingStudentList,
        recentStudentResults,
      },
    });
  } catch (error) {
    next(error);
  }
};
