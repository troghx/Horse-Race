import { assertAdminPin } from "../../lib/admin-auth.js";
import { jsonResponse } from "../../lib/race-service.js";

export default async (request) => {
  try {
    const body = await request.json();
    assertAdminPin(body?.pin);
    return jsonResponse(200, { ok: true });
  } catch (error) {
    return jsonResponse(Number(error?.statusCode) || 500, { error: error.message });
  }
};
