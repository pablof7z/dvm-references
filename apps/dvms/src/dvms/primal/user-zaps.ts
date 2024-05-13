import NDK, {
    NDKDVMJobResult,
    NDKDvmJobFeedbackStatus,
    NDKTag,
    NostrEvent,
} from "@nostr-dev-kit/ndk";
import { DVM, NDKDVMRequestExtended } from "../index.js";
import debug from "debug";

export async function register(dvm: DVM): Promise<void> {
    dvm.d("registering suggester on dvm", dvm.name);

    const primalCache = new NDK({
        explicitRelayUrls: [
            'wss://cache0.primal.net/cache17',
        ],
        debug: debug("primal-cache")
    })
    primalCache.pool.on("relay:connect", (r) => {
        dvm.d("connected to primal cache", r.url);
    });
    await primalCache.connect(5000);

    const getSuggestion = async (
        request: NDKDVMRequestExtended
    ): Promise<NDKDVMJobResult> => {
        let user = request.getParam("user");

        if (!user) {
            user = request.pubkey;
        }

        return new Promise((resolve) => {
            const response = new NDKDVMJobResult(undefined, {} as NostrEvent);
            const content: NDKTag[] = [];
            request.processing("Getting trending notes for you.");

            const sub = primalCache.subscribe({
                cache: [ "user_zaps", {
                    sender: user,
                    kinds: [9735]
                }]
            } as unknown as NostrEvent)

            sub.on("event", (e) => {
                const eTag = e.tagValue("e");
                const pTag = e.tagValue("p");

                if (eTag) {
                    content.push(["e", eTag]);
                } else if (pTag) {
                    content.push(["p", pTag]);
                } else {
                    dvm.d(`zap with unknown tag`, e.rawEvent());
                }
            });

            sub.on("eose", () => {
                response.status = NDKDvmJobFeedbackStatus.Success;
                response.content = JSON.stringify(content);
                resolve(response);
            });
        });
    };

    dvm.handlers[5301].push(getSuggestion);
}

