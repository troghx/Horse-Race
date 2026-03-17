import seedTeamConfig from "../../data/teams.json" with { type: "json" };

import { createJackpotPayload, jsonResponse, SHEET_API_CACHE_CONTROL } from "../../lib/race-service.js";
import { createBlobTeamStore } from "../../lib/netlify-team-store.js";

export default async (request) => {
  try {
    const url = new URL(request.url);
    const teamStore = createBlobTeamStore();
    const payload = await createJackpotPayload({
      refresh: url.searchParams.get("refresh") === "1",
      teamStore,
      sheetUrl: process.env.SHEET_URL,
      seedConfig: seedTeamConfig,
    });

    return jsonResponse(200, payload, { cacheControl: SHEET_API_CACHE_CONTROL });
  } catch (error) {
    return jsonResponse(500, { error: error.message });
  }
};
