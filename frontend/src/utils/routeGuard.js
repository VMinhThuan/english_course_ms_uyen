/**
 * Route guard utilities
 */

export const isPublicRoute = (path) => {
  const publicRoutes = ['/login', '/register', '/'];
  return publicRoutes.includes(path);
};

export const isStudentRoute = (path) => {
  return path.startsWith('/student') || path.startsWith('/courses');
};

export const isTeacherRoute = (path) => {
  return path.startsWith('/teacher');
};

export const isAdminRoute = (path) => {
  return path.startsWith('/admin');
};

export const canAccessRoute = (path, userRole) => {
  // Public routes
  if (isPublicRoute(path)) {
    return true;
  }

  // No user, can't access protected routes
  if (!userRole) {
    return false;
  }

  // Student routes
  if (isStudentRoute(path)) {
    return ['student', 'teacher', 'admin'].includes(userRole);
  }

  // Teacher routes
  if (isTeacherRoute(path)) {
    return ['teacher', 'admin'].includes(userRole);
  }

  // Admin routes
  if (isAdminRoute(path)) {
    return userRole === 'admin';
  }

  return false;
};

