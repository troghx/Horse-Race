import seedTeamConfig from "../../data/teams.json" with { type: "json" };

import { createJackpotPayload, jsonResponse } from "../../lib/race-service.js";
import { createBlobTeamStore } from "../../lib/netlify-team-store.js";

const teamStore = createBlobTeamStore();

export default async (request) => {
  try {
    const url = new URL(request.url);
    const payload = await createJackpotPayload({
      refresh: url.searchParams.get("refresh") === "1",
      teamStore,
      sheetUrl: process.env.SHEET_URL,
      seedConfig: seedTeamConfig,
    });

    return jsonResponse(200, payload);
  } catch (error) {
    return jsonResponse(500, { error: error.message });
  }
};
