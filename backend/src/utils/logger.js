const formatPayload = (payload) => {
  if (!payload) {
    return "";
  }

  try {
    return JSON.stringify(payload);
  } catch (_error) {
    return String(payload);
  }
};

const writeLog = (level, stage, message, payload) => {
  const timestamp = new Date().toISOString();
  const suffix = payload ? ` ${formatPayload(payload)}` : "";
  console[level](`[${timestamp}] [${stage}] ${message}${suffix}`);
};

export const logInfo = (stage, message, payload) => writeLog("log", stage, message, payload);
export const logWarn = (stage, message, payload) => writeLog("warn", stage, message, payload);
export const logError = (stage, message, payload) => writeLog("error", stage, message, payload);
