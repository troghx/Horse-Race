import { getStore } from "@netlify/blobs";

const STORE_NAME = "horse-race";

function createBlobJsonStore(configKey) {
  return {
    async read() {
      return getStore(STORE_NAME).get(configKey, { type: "json" });
    },
    async write(config) {
      await getStore(STORE_NAME).setJSON(configKey, config);
      return config;
    },
  };
}

export function createBlobTeamStore() {
  return createBlobJsonStore("teams-config");
}

export function createBlobTickerStore() {
  return createBlobJsonStore("ticker-config");
}

export function createBlobPrizeStore() {
  return createBlobJsonStore("prize-mode-config");
}
