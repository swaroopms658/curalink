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

export const queryResearch = async ({ disease, query, sessionId }) => {
  const response = await fetch("/api/query", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      disease,
      query,
      sessionId
    })
  });

  if (!response.ok) {
    await handleApiError(response);
  }

  return response.json();
};
