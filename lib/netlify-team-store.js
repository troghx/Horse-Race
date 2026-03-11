import { getStore } from "@netlify/blobs";

const STORE_NAME = "horse-race";
const CONFIG_KEY = "teams-config";

export function createBlobTeamStore() {
  const store = getStore(STORE_NAME);

  return {
    async read() {
      return store.get(CONFIG_KEY, { type: "json" });
    },
    async write(config) {
      await store.setJSON(CONFIG_KEY, config);
      return config;
    },
  };
}
