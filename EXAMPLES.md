# Ví dụ code đã triển khai

Tài liệu này mô tả chi tiết 3 ví dụ code quan trọng đã được triển khai trong dự án.

## 1. Đăng ký khóa học (FE gọi BE)

### Frontend: `frontend/src/pages/EnrollCoursePage.jsx`

**Luồng hoạt động:**
1. User xem thông tin khóa học
2. Click "Enroll Now"
3. Frontend gọi API `enrollmentApi.enrollCourse(courseId)`
4. Backend xử lý và trả JSON response
5. Frontend hiển thị thông báo và redirect

**Code Frontend:**
```javascript
const handleEnroll = async () => {
  const response = await enrollmentApi.enrollCourse(courseId);
  // response.data = { status: 'success', message: '...', data: { enrollment } }
};
```

**API Call:**
```
POST /api/v1/enrollments
Headers: {
  Authorization: "Bearer <access_token>",
  Content-Type: "application/json"
}
Body: {
  "courseId": "course_id_here"
}
```

**Backend: `backend/src/controllers/enrollmentController.js`**
- Kiểm tra course tồn tại
- Kiểm tra đã đăng ký chưa
- Tạo enrollment record
- Thêm student vào course.students
- Trả JSON response

---

## 2. Upload bài giảng (Teacher)

### Frontend: `frontend/src/pages/CreateLessonPage.jsx`

**Luồng hoạt động:**
1. Teacher điền form thông tin bài giảng
2. Chọn file attachments (video, audio, documents)
3. Frontend tạo FormData với files
4. Gọi API `lessonApi.createLesson(lessonData)`
5. Backend nhận file qua multer, lưu vào `uploads/`
6. Backend lưu metadata vào MongoDB
7. Trả JSON response với thông tin lesson

**Code Frontend:**
```javascript
const lessonData = {
  title: "...",
  content: "...",
  courseId: "...",
  attachments: [file1, file2, ...] // Files
};

const response = await lessonApi.createLesson(lessonData);
// lessonApi tự động tạo FormData và gửi với Content-Type: multipart/form-data
```

**API Call:**
```
POST /api/v1/lessons
Headers: {
  Authorization: "Bearer <access_token>",
  Content-Type: "multipart/form-data"
}
Body (FormData): {
  title: "Lesson Title",
  content: "Lesson content...",
  courseId: "course_id",
  attachments: [File, File, ...]
}
```

**Backend: `backend/src/routes/lessonRoutes.js` + `backend/src/controllers/lessonController.js`**
- Multer middleware xử lý file upload
- Files được lưu vào `backend/uploads/`
- Metadata (filename, url, type) được lưu vào MongoDB
- Trả JSON response với lesson object

---

## 3. Bài test Reading (TTS ở FE, auto-check ở BE)

### Frontend: `frontend/src/pages/TestPage.jsx`

**Luồng hoạt động:**
1. Frontend hiển thị câu hỏi reading với text cần đọc
2. **TTS (Text-to-Speech)**: Frontend sử dụng Web Speech API để đọc text cho học sinh nghe
3. **Speech-to-Text**: Học sinh đọc lại text (ghi âm hoặc nhập tay)
4. Frontend gửi `readingText` lên Backend
5. **Backend auto-check**: Sử dụng `textSimilarity` để so sánh `readingText` với `expectedText`
6. Backend trả về kết quả (isCorrect, similarity, score)
7. Frontend hiển thị kết quả

**Code Frontend - TTS:**
```javascript
import { speakText } from '../utils/tts.js';

// Đọc text cho học sinh nghe
const handlePlayText = (text) => {
  speakText(text, { lang: 'en-US', rate: 0.9 });
};
```

**Code Frontend - Speech Recognition:**
```javascript
import { startSpeechRecognition } from '../utils/speechRecognition.js';

const recognition = startSpeechRecognition({ lang: 'en-US' });
recognition.onresult = (event) => {
  const transcript = event.results[0][0].transcript;
  setReadingText(transcript); // Text học sinh đọc
};
```

**API Call:**
```
POST /api/v1/tests/:testId/submit
Headers: {
  Authorization: "Bearer <access_token>",
  Content-Type: "application/json"
}
Body: {
  "answers": ["answer1", "answer2", ...],
  "readingText": "text that student read" // Cho reading test
}
```

**Backend: `backend/src/controllers/testController.js`**
```javascript
import { checkReadingText } from '../utils/textSimilarity.js';

// So sánh text học sinh đọc với text mong đợi
const readingCheck = checkReadingText(
  readingText,           // Text học sinh đọc
  question.expectedText,  // Text mong đợi
  0.8                     // Threshold 80%
);

// readingCheck = {
//   isCorrect: true/false,
//   similarity: 0.95,
//   message: "Reading text is correct!"
// }
```

**Backend: `backend/src/utils/textSimilarity.js`**
- Sử dụng Levenshtein distance để tính similarity
- So sánh với threshold (mặc định 80%)
- Trả về isCorrect, similarity, message

**Response từ Backend:**
```json
{
  "status": "success",
  "message": "Test submitted successfully",
  "data": {
    "score": 8,
    "totalPoints": 10,
    "percentage": 80,
    "results": [
      {
        "questionIndex": 0,
        "question": "Read the following text...",
        "studentAnswer": "The quick brown fox...",
        "isCorrect": true,
        "similarity": 0.95,
        "message": "Reading text is correct!",
        "points": 5
      }
    ]
  }
}
```

---

## Tóm tắt

| Tính năng | Frontend xử lý | Backend xử lý |
|-----------|----------------|---------------|
| **Đăng ký khóa học** | Gọi API với courseId | Logic đăng ký, tạo enrollment |
| **Upload bài giảng** | FormData với files | Multer nhận file, lưu vào uploads/, lưu DB |
| **Reading Test** | TTS (đọc text), Speech Recognition (ghi âm) | Text similarity check, auto-grading |

Tất cả đều tuân thủ nguyên tắc:
- **Frontend**: Chỉ xử lý UI, gọi API, không có logic nghiệp vụ
- **Backend**: Xử lý logic, database, trả JSON response
- **Giao tiếp**: RESTful API với JWT authentication

