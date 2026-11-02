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

  // If explicitly declared as production environment without monitoring enabled
  if (env.VITE_APP_ENV === 'production' && env.VITE_ENABLE_STUDENT_MONITORING !== 'true') {
    return false;
  }

  // Explicit true override enables feature
  if (env.VITE_ENABLE_STUDENT_MONITORING === 'true') {
    return true;
  }

  // On development branch, default to enabled for development, preview and staging builds
  return true;
};
