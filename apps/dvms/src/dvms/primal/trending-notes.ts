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
            'wss://cache2.primal.net/v1',
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
        return new Promise((resolve) => {
            const response = new NDKDVMJobResult(undefined, {} as NostrEvent);
            const content: NDKTag[] = [];
            request.processing("Getting trending notes for you.");

            const sub = primalCache.subscribe({
                cache: [ "explore_global_trending_24h"]
            } as unknown as NostrEvent)

            sub.on("event", (e) => {
                content.push(["e", e.id]);
            });

            sub.on("eose", () => {
                response.status = NDKDvmJobFeedbackStatus.Success;
                response.content = JSON.stringify(content);
                dvm.d(`result`, response.rawEvent());
                resolve(response);
            });
        });
    };

    dvm.handlers[5300].push(getSuggestion);
}
