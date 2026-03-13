import seedStakes from "../../data/tug-stakes.json" with { type: "json" };
import { getStore } from "@netlify/blobs";

const STORE_NAME = "horse-race";
const STAKES_KEY = "tug-stakes";
const PIN = "75572144";

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function normalizeText(value) {
  return String(value || "").trim().slice(0, 500);
}

export default async (request) => {
  if (request.method === "GET") {
    try {
      const data = await getStore(STORE_NAME).get(STAKES_KEY, { type: "json" });
      return json(200, { text: normalizeText(data?.text) || normalizeText(seedStakes?.text) });
    } catch {
      return json(200, { text: normalizeText(seedStakes?.text) });
    }
  }

  if (request.method === "PUT") {
    const body = await request.json();
    const pin = (body.pin || "").trim();

    if (pin !== PIN) {
      return json(403, { error: "PIN incorrecto" });
    }

    const text = normalizeText(body.text);

    try {
      await getStore(STORE_NAME).setJSON(STAKES_KEY, { text });
      return json(200, { text });
    } catch {
      return json(503, { error: "No se pudo guardar el texto en este momento" });
    }
  }

  return json(405, { error: "Method not allowed" });
};
