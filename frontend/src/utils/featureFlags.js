/**
 * Feature flag for Round 2 Student Learning Monitoring.
 *
 * Production default: false (ensures Production website never renders or exposes Round 2 UI)
 * Development default: true (when VITE_APP_ENV=development or VITE_ENABLE_STUDENT_MONITORING=true or Vite dev mode)
 */
export const isStudentMonitoringEnabled = () => {
  const env = import.meta.env || {};

  // Explicit false override takes absolute precedence
  if (env.VITE_ENABLE_STUDENT_MONITORING === 'false') {
    return false;
  }

  // Explicit true override enables feature
  if (env.VITE_ENABLE_STUDENT_MONITORING === 'true') {
    return true;
  }

  // Development environments enable feature for developer testing
  if (env.DEV || env.MODE === 'development' || env.VITE_APP_ENV === 'development') {
    return true;
  }

  // In production builds without explicit enable flag, default to false
  return false;
};
