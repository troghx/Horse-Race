import seedPrizeModeConfig from "../../data/prize-mode.json" with { type: "json" };
import { assertAdminPin, readAdminPinFromWebRequest } from "../../lib/admin-auth.js";

import {
  createPrizeModePayload,
  jsonResponse,
  savePrizeModeConfig,
} from "../../lib/race-service.js";
import { createBlobPrizeStore } from "../../lib/netlify-team-store.js";

export default async (request) => {
  try {
    const prizeStore = createBlobPrizeStore();

    if (request.method === "POST") {
      assertAdminPin(readAdminPinFromWebRequest(request));
      const body = await request.json();
      const payload = await savePrizeModeConfig({
        prizeStore,
        seedConfig: seedPrizeModeConfig,
        active: body?.active,
        awards: body?.awards,
        baseVersion: body?.baseVersion,
      });

      return jsonResponse(200, payload);
    }

    const payload = await createPrizeModePayload({
      prizeStore,
      seedConfig: seedPrizeModeConfig,
    });

    return jsonResponse(200, payload);
  } catch (error) {
    return jsonResponse(Number(error?.statusCode) || 500, {
      error: error.message,
      ...(error?.details ? { current: error.details } : {}),
    });
  }
};
