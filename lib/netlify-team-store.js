import { getStore } from "@netlify/blobs";

const STORE_NAME = "horse-race";
const CONFIG_KEY = "teams-config";

export function createBlobTeamStore() {
  return {
    async read() {
      return getStore(STORE_NAME).get(CONFIG_KEY, { type: "json" });
    },
    async write(config) {
      await getStore(STORE_NAME).setJSON(CONFIG_KEY, config);
      return config;
    },
  };
}
