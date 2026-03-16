import { createInboundPayload, jsonResponse } from "../../lib/race-service.js";

export default async (request) => {
  try {
    const url = new URL(request.url);
    const payload = await createInboundPayload({
      refresh: url.searchParams.get("refresh") === "1",
      sheetUrl: process.env.SHEET_URL,
    });

    return jsonResponse(200, payload);
  } catch (error) {
    return jsonResponse(500, { error: error.message });
  }
};
