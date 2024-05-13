import fs from "fs";
import {
    NDKDVMJobResult,
    NDKDvmJobFeedbackStatus,
    NDKTag,
    NostrEvent,
    Hexpubkey,
} from "@nostr-dev-kit/ndk";
import { DVM, NDKDVMRequestExtended } from "./index.js";

export async function register(dvm: DVM): Promise<void> {
    dvm.d("registering DVM", dvm.name);

    const getSuggestion = async (
        request: NDKDVMRequestExtended
    ): Promise<NDKDVMJobResult> => {
        const inputs: Hexpubkey[] = [];
        const inputsFollows: Set<Hexpubkey> = new Set();
        const extendedFollows: Map<Hexpubkey, number> = new Map();

        console.log(`request`, request.rawEvent().tags, { matchingTags: request.getMatchingTags("i") });

        for (const input of request.getMatchingTags("i")) {
            inputs.push(input[1]);
        }

        if (inputs.length === 0) {
            inputs.push(request.pubkey);
        }

        for (const pubkey of inputs) {
            const user = dvm.ndk.getUser({pubkey: pubkey});

            // Get user follows and their extended network
            const follows = await user.follows();

            console.log(`user ${pubkey} has ${follows.size} follows`);

            Array.from(follows).map(u => u.pubkey).forEach(pubkey => {
                inputsFollows.add(pubkey);
            });
        }

        console.log(`input users have ${inputsFollows.size} follows`);

        const getExtendedNetwork = async () => {
            const followEvents = await dvm.ndk.fetchEvents({
                kinds: [3], authors: Array.from(inputsFollows)
            }, { closeOnEose: true, groupable: false });
            for (const e of followEvents) {
                for (const tag of e.tags) {
                    if (tag[0] === 'p') {
                        extendedFollows.set(tag[1], (extendedFollows.get(tag[1]) || 0) + 1);
                    }
                }
            }

            console.log(`extended network has ${extendedFollows.size} pubkeys`);
        }

        await Promise.race([
            getExtendedNetwork(),
            new Promise<void>((resolve) => {
                setTimeout(() => {
                    console.log(`extended network timeout`);
                    resolve();
                }, 60000);
            })
        ]);

        let content: NDKTag[];

        const result: Set<Hexpubkey> = new Set();

        // add all inputs follows
        for (const pubkey of inputsFollows) {
            result.add(pubkey);
        }

        console.log(`here with ${extendedFollows.size} pubkeys`);

        // add to content the extended network that has at least 2 follows
        for (const [pubkey, count] of extendedFollows) {
            if (count >= 0) {
                result.add(pubkey);
            } else {
                console.log(`skipping ${pubkey} with ${count} follows`);
            }
        }

        content = Array.from(result)
            .map((pubkey) => [ "p", pubkey ] as NDKTag);

        console.log(`content has ${content.length} pubkeys`);

        // write to a file the list of pubkeys
        const file = fs.createWriteStream("suggestion.txt");
        file.on("error", (err) => {
            console.error(err);
        });
        content.forEach((v) => file.write(`${v[1]}\n`));
        file.end();

        const response = new NDKDVMJobResult(undefined, {} as NostrEvent);

        response.status = NDKDvmJobFeedbackStatus.Success;
        response.content = JSON.stringify(content);
        // dvm.d(`result`, response.rawEvent());

        return response;
    };

    dvm.handlers[5401].push(getSuggestion);
}
