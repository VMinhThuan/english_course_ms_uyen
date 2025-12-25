import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { lessonApi } from '../api/lessonApi.js';
import { testApi } from '../api/testApi.js';

export default function LessonPage() {
  const { courseId, lessonId } = useParams();
  const [lesson, setLesson] = useState(null);
  const [test, setTest] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch lesson details
        const lessonsResponse = await lessonApi.getLessonsByCourse(courseId);
        const foundLesson = lessonsResponse.data.lessons.find(
          (l) => l._id === lessonId
        );
        setLesson(foundLesson);

        // Fetch test if exists
        try {
          const testResponse = await testApi.getTestByLesson(lessonId);
          setTest(testResponse.data.test);
        } catch (error) {
          // No test for this lesson
        }
      } catch (error) {
        console.error('Error fetching lesson:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [courseId, lessonId]);

  if (loading) return <div>Loading...</div>;
  if (!lesson) return <div>Lesson not found</div>;

  return (
    <div>
      <h1>{lesson.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: lesson.content }} />
      {lesson.videoUrl && (
        <div style={{ marginTop: '2rem' }}>
          <video src={lesson.videoUrl} controls style={{ width: '100%', maxWidth: '800px' }} />
        </div>
      )}
      {lesson.audioUrl && (
        <div style={{ marginTop: '2rem' }}>
          <audio src={lesson.audioUrl} controls style={{ width: '100%' }} />
        </div>
      )}
      {test && (
        <div style={{ marginTop: '2rem' }}>
          <Link to={`/student/tests/${test._id}`}>
            <button>Take Test</button>
          </Link>
        </div>
      )}
    </div>
  );
}

