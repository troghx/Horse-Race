import seedTeamConfig from "../../data/teams.json" with { type: "json" };
import { assertAdminPin, readAdminPinFromWebRequest } from "../../lib/admin-auth.js";

import {
  createTeamsPayload,
  jsonResponse,
  saveTeamAssignments,
} from "../../lib/race-service.js";
import { createBlobTeamStore } from "../../lib/netlify-team-store.js";

export default async (request) => {
  try {
    const teamStore = createBlobTeamStore();
    assertAdminPin(readAdminPinFromWebRequest(request));

    if (request.method === "POST") {
      const body = await request.json();
      const payload = await saveTeamAssignments({
        assignments: body?.assignments,
        teamStore,
        sheetUrl: process.env.SHEET_URL,
        seedConfig: seedTeamConfig,
      });

      return jsonResponse(200, payload);
    }

    const payload = await createTeamsPayload({
      teamStore,
      sheetUrl: process.env.SHEET_URL,
      seedConfig: seedTeamConfig,
    });

    return jsonResponse(200, payload);
  } catch (error) {
    return jsonResponse(Number(error?.statusCode) || 500, { error: error.message });
  }
};
