import "websocket-polyfill";

import NDK from "@nostr-dev-kit/ndk";
import debug from "debug";
import { getConfig } from "./config/index.js";
import { DVM } from "./dvms/index.js";

export const log = debug("dvm");

export const configFile = process.argv[2];

if (!configFile) {
    console.error("config file not specified");
    process.exit(1);
}

log("configFile", { configFile });

const config = getConfig();
const dvms = [];

export const ndk = new NDK({
    explicitRelayUrls: [
        "wss://relay.damus.io",
        "wss://offchain.pub/",
        'wss://relay.f7z.io',
        // "wss://blastr.f7z.xyz",
        // "wss://nostr.mutinywallet.com",
        "wss://nos.lol",
        "wss://relay.f7z.io"
    ],
    enableOutboxModel: true,
    // outboxRelayUrls: [
    //     "wss://purplepag.es",
    //     "wss://relay.damus.io"
    // ]
});
await ndk.connect(2000);

for (const [name, dvmConfig] of Object.entries(config.dvms)) {
    const dvm = new DVM(ndk, name, dvmConfig);
    dvms.push(dvm);
}

for (const dvm of dvms) {
    dvm.start();
}
