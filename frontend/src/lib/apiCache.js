const CACHE_PREFIX = 'gp-cache-v1';

const resolveStorage = () => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }

  return window.localStorage;
};

export const buildCacheKey = (...parts) => {
  const normalizedParts = parts
    .filter((part) => part !== undefined && part !== null && String(part).length > 0)
    .map((part) => String(part));

  return [CACHE_PREFIX, ...normalizedParts].join(':');
};

export const readApiCache = (key, maxAgeMs) => {
  const storage = resolveStorage();
  if (!storage || !key) return null;

  try {
    const raw = storage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    const { timestamp, data } = parsed;
    if (typeof timestamp !== 'number') return null;

    if (maxAgeMs && Date.now() - timestamp > maxAgeMs) {
      storage.removeItem(key);
      return null;
    }

    return data;
  } catch {
    return null;
  }
};

export const writeApiCache = (key, data) => {
  const storage = resolveStorage();
  if (!storage || !key) return;

  try {
    storage.setItem(
      key,
      JSON.stringify({
        timestamp: Date.now(),
        data,
      })
    );
  } catch {
    return;
  }
};

export const clearApiCache = () => {
  const storage = resolveStorage();
  if (!storage) return;

  try {
    const prefix = `${CACHE_PREFIX}:`;
    const keysToRemove = [];

    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key && key.startsWith(prefix)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => storage.removeItem(key));
  } catch {
    return;
  }
};
