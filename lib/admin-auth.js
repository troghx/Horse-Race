const DEFAULT_ADMIN_PIN = "75572144";
export const ADMIN_PIN_HEADER = "x-admin-pin";

function createHttpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function getAdminPin() {
  return String(process.env.ADMIN_PIN || DEFAULT_ADMIN_PIN).trim();
}

export function isValidAdminPin(pin) {
  return String(pin || "").trim() === getAdminPin();
}

export function assertAdminPin(pin) {
  if (!isValidAdminPin(pin)) {
    throw createHttpError("PIN incorrecto", 403);
  }
}

export function readAdminPinFromNodeRequest(req) {
  return req?.headers?.[ADMIN_PIN_HEADER] || "";
}

export function readAdminPinFromWebRequest(request) {
  return request?.headers?.get?.(ADMIN_PIN_HEADER) || "";
}
