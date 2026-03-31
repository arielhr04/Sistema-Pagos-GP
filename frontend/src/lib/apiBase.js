const normalizeUrl = (value) => {
  if (!value) return '';
  return String(value).trim().replace(/\/+$/, '');
};

const isLocalHostUrl = (value) => {
  if (!value) return false;
  return /localhost|127\.0\.0\.1/i.test(value);
};

export const resolveApiBaseUrl = () => {
  const configured = normalizeUrl(process.env.REACT_APP_BACKEND_URL);

  // En producción, si accidentalmente llega localhost, usar mismo origen.
  if (configured && typeof window !== 'undefined') {
    const currentHost = window.location.hostname;
    const runningLocally = currentHost === 'localhost' || currentHost === '127.0.0.1';
    if (!runningLocally && isLocalHostUrl(configured)) {
      return '';
    }
  }

  return configured;
};

export default resolveApiBaseUrl;