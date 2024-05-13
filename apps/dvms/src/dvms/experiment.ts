import axios from "axios";
import {
    NDKDVMJobResult,
    NDKDvmJobFeedbackStatus,
    NDKTag,
    NostrEvent,
} from "@nostr-dev-kit/ndk";
import { DVM, NDKDVMRequestExtended } from "./index.js";

export async function register(dvm: DVM): Promise<void> {
    dvm.d("registering DVM", dvm.name);

    const getSuggestion = async (
        request: NDKDVMRequestExtended
    ): Promise<NDKDVMJobResult> => {
        // request.processing();

        const allReactions = await dvm.ndk.fetchEvents({
            kinds: [6, 7],
            authors: [request.pubkey],
            limit: 100
        })

        const taggedIds = Array.from(allReactions).map((r) => r.tagValue("e"))
            .filter((e) => e !== undefined);

        const allReactedToEvents = await dvm.ndk.fetchEvents([
            { ids: taggedIds as string[] },
            { kinds: [1], authors: [request.pubkey] }
        ]);
        const contents = Array.from(allReactedToEvents).map((e) => e.content)
            .filter((content) => content.length > 50 && content.length < 500)
            .slice(0, 30);

        console.log(contents);

        // console.log(`fetched ${allReactedToEvents.size} events`);

        // const res = await axios.get(
        //     `https://api.nostr.wine/trending?order=zap_count&hours=12&limit=5`
        // );
        // const json = res.data;

        const response = new NDKDVMJobResult(undefined, {} as NostrEvent);
        return response;
        // const content: NDKTag[] = [];

        // dvm.d(`result`, json);

        // json.forEach((item: { event_id: string }) => {
        //     content.push(["e", item.event_id]);
        // });
        // response.status = NDKDvmJobFeedbackStatus.Success;
        // response.content = JSON.stringify(content);
        // dvm.d(`result`, response.rawEvent());

        // return response;
    };

    dvm.handlers[5301].push(getSuggestion);
}
