import axios from "axios";
import {
    NDKDVMJobResult,
    NDKDvmJobFeedbackStatus,
    NDKTag,
    NDKUser,
    NostrEvent,
} from "@nostr-dev-kit/ndk";
import { DVM, NDKDVMRequestExtended } from "./index.js";

export async function register(dvm: DVM): Promise<void> {
    dvm.d("registering suggester on dvm", dvm.name);

    const getSuggestion = async (
        request: NDKDVMRequestExtended
    ): Promise<NDKDVMJobResult> => {
        let pubkey = request.getParam("user");

        if (pubkey?.startsWith('npub')) {
            pubkey = (new NDKUser({ npub: pubkey })).hexpubkey;
        }

        if (!pubkey) {
            pubkey = request.pubkey;
        }

        const user = dvm.ndk.getUser({hexpubkey: pubkey});

        // Get topics from params
        const topics = request.getMatchingTags("params")
            .filter(t => t[1] === 't')
            .map(t => t[2]);

        console.log(`user ${user.hexpubkey} is interested in topics ${topics}`);

        const response = new NDKDVMJobResult(undefined, {} as NostrEvent);
        // const content: NDKTag[] = [];

        // json.profiles.forEach((profile: { pubkey: string }) => {
        //     content.push(["p", profile.pubkey]);
        // });
        // response.status = NDKDvmJobFeedbackStatus.Success;
        // response.content = JSON.stringify(content);
        // dvm.d(`result`, response.rawEvent());

        return response;
    };

    dvm.handlers[5301].push(getSuggestion);
}
