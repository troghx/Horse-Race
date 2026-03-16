import seedTickerConfig from "../../data/ticker.json" with { type: "json" };

import {
  createTickerPayload,
  jsonResponse,
  saveTickerMessages,
} from "../../lib/race-service.js";
import { createBlobTickerStore } from "../../lib/netlify-team-store.js";

export default async (request) => {
  try {
    const tickerStore = createBlobTickerStore();

    if (request.method === "POST") {
      const body = await request.json();
      const payload = await saveTickerMessages({
        items: body?.items,
        baseVersion: body?.baseVersion,
        tickerStore,
        seedConfig: seedTickerConfig,
      });

      return jsonResponse(200, payload);
    }

    const payload = await createTickerPayload({
      tickerStore,
      seedConfig: seedTickerConfig,
    });

    return jsonResponse(200, payload);
  } catch (error) {
    return jsonResponse(Number(error?.statusCode) || 500, {
      error: error.message,
      ...(error?.details ? { current: error.details } : {}),
    });
  }
};
