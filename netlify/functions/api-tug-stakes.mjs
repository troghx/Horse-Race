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

export default async (request) => {
  const store = getStore(STORE_NAME);

  if (request.method === "GET") {
    const data = await store.get(STAKES_KEY, { type: "json" }).catch(() => null);
    return json(200, { text: data?.text ?? "" });
  }

  if (request.method === "PUT") {
    const body = await request.json();
    const pin = (body.pin || "").trim();

    if (pin !== PIN) {
      return json(403, { error: "PIN incorrecto" });
    }

    const text = (body.text || "").slice(0, 500);
    await store.setJSON(STAKES_KEY, { text });
    return json(200, { text });
  }

  return json(405, { error: "Method not allowed" });
};
