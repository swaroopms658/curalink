const getApiBaseUrl = () => {
  const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

  if (!configuredBaseUrl) {
    return "";
  }

  return configuredBaseUrl.endsWith("/")
    ? configuredBaseUrl.slice(0, -1)
    : configuredBaseUrl;
};

const buildApiUrl = (path) => {
  const apiBaseUrl = getApiBaseUrl();

  return apiBaseUrl ? `${apiBaseUrl}${path}` : path;
};

const handleApiError = async (response) => {
  let message = "Request failed";

  try {
    const payload = await response.json();
    if (payload?.error) {
      message = payload.error;
    }
  } catch (_error) {
    message = response.statusText || message;
  }

  throw new Error(message);
};

export const queryResearch = async ({ disease, query, sessionId, location }) => {
  const response = await fetch(buildApiUrl("/api/query"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      disease,
      query,
      sessionId,
      location: location || ""
    })
  });

  if (!response.ok) {
    await handleApiError(response);
  }

  return response.json();
};
