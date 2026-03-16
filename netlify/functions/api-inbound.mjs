import seedTeamConfig from "../../data/teams.json" with { type: "json" };

import { createInboundPayload, jsonResponse } from "../../lib/race-service.js";
import { createBlobTeamStore } from "../../lib/netlify-team-store.js";

export default async (request) => {
  try {
    const url = new URL(request.url);
    const teamStore = createBlobTeamStore();
    const payload = await createInboundPayload({
      refresh: url.searchParams.get("refresh") === "1",
      sheetUrl: process.env.SHEET_URL,
      teamStore,
      seedConfig: seedTeamConfig,
    });

    return jsonResponse(200, payload);
  } catch (error) {
    return jsonResponse(500, { error: error.message });
  }
};
