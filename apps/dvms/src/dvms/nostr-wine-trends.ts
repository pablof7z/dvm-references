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
        request.processing();

        const res = await axios.get(
            `https://api.nostr.wine/trending?order=zap_count&hours=12&limit=5`
        );
        const json = res.data;

        const response = new NDKDVMJobResult(undefined, {} as NostrEvent);
        const content: NDKTag[] = [];

        dvm.d(`result`, json);

        json.forEach((item: { event_id: string }) => {
            content.push(["e", item.event_id]);
        });
        response.status = NDKDvmJobFeedbackStatus.Success;
        response.content = JSON.stringify(content);
        dvm.d(`result`, response.rawEvent());

        return response;
    };

    dvm.handlers[65006].push(getSuggestion);
}
