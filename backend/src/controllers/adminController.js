import User from '../models/User.js';

// @desc    Get list of students (with filtering, search, pagination)
// @route   GET /api/v1/admin/students
// @access  Private (Admin only)
export const getStudents = async (req, res, next) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;

    const query = { role: 'student' };

    if (status && status !== 'ALL') {
      query.status = status.toLowerCase();
    }

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { fullName: searchRegex },
        { email: searchRegex },
        { phoneNumber: searchRegex },
      ];
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const [students, total] = await Promise.all([
      User.find(query)
        .select('-password')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      User.countDocuments(query),
    ]);

    res.json({
      status: 'success',
      data: {
        students,
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
    const student = await User.findOne({ _id: req.params.id, role: 'student' }).select('-password');
    if (!student) return res.status(404).json({ status: 'error', message: 'Không tìm thấy thông tin học viên' });
    return res.json({ status: 'success', data: { student } });
  } catch (error) { return next(error); }
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
