import axios from "axios";

export const api = axios.create({
  baseURL: "/api",
  headers: {
    "Content-Type": "application/json",
  },
});

// Custom event for API errors — picked up by ToastProvider
const API_ERROR_EVENT = "api:error";

export function dispatchApiError(message: string) {
  window.dispatchEvent(new CustomEvent(API_ERROR_EVENT, { detail: message }));
}

export { API_ERROR_EVENT };

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message =
      error.response?.data?.detail || error.message || "An error occurred";
    console.error("API Error:", message);
    dispatchApiError(message);
    return Promise.reject(error);
  },
);
