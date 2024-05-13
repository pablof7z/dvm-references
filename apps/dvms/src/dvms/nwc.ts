import NDK, {
    Hexpubkey,
    NDKDVMJobResult,
    NDKDvmJobFeedbackStatus,
    NDKEvent,
    NDKFilter,
    NDKRelay,
    NDKRelaySet,
    NDKTag,
    NDKUser,
    NostrEvent,
} from "@nostr-dev-kit/ndk";
import { DVM, NDKDVMRequestExtended } from "./index.js";
import debug from "debug";
import { webln } from "@getalby/sdk";

const nwcStrings: Record<Hexpubkey, string> = {};

export async function register(dvm: DVM): Promise<void> {
    dvm.d("registering dvm", dvm.name);

    const onRegister = async (
        request: NDKDVMRequestExtended
    ): Promise<NDKDVMJobResult> => {
        const user = request.author;
        const nwcString = request.tagValue("i");

        if (!nwcString) {
            throw "no nwc string";
        }

        nwcStrings[user.pubkey!] = nwcString!;

        const result = new NDKDVMJobResult(dvm.ndk);
        result.jobRequest = request;
        result.status = NDKDvmJobFeedbackStatus.Success;

        return result;
    };

    const onSchedule = async (
        request: NDKDVMRequestExtended
    ): Promise<NDKDVMJobResult> => {
        const user = request.author;
        const nwcString = nwcStrings[user.pubkey!];
        let invoice;
        let eventToZap: NDKEvent;

        if (!nwcString) {
            throw "no nwc string";
        }

        const nwc = new webln.NWC({ nostrWalletConnectUrl: nwcString });
        await nwc.enable();

        for (const tag of request.getMatchingTags("param")) {
            switch (tag[1]) {
                case "invoice": {
                    invoice = tag[2];
                    dvm.d(`received invoice to zap`, invoice);
                    break;
                }
                case "zap": {
                    const eventId = tag[2];
                    const relayUrl = tag[3];
                    let relaySet: NDKRelaySet | undefined;

                    if (relayUrl) {
                        relaySet = NDKRelaySet.fromRelayUrls([relayUrl], dvm.ndk);
                    }

                    const e = await dvm.ndk.fetchEvent(eventId, undefined, relaySet);
                    if (!e) throw `event not found: ${eventId}`;
                    eventToZap = e;

                    dvm.d(`received event to zap`, eventToZap.rawEvent());
                    break;
                }
                default: {
                    throw `unknown param: ${tag[1]}`;
                }
            }
        }

        if (invoice) {
            try {
                const response = await nwc.sendPayment(invoice);
                console.log(response);
            } catch (e: any) {
                throw e;
            }
        }

        const result = new NDKDVMJobResult(dvm.ndk);
        result.jobRequest = request;
        result.status = NDKDvmJobFeedbackStatus.Success;

        return result;
    }

    dvm.handlers[5901].push(onRegister);

    // dvm.handlers[5902].push(onPay);

    dvm.handlers[5903].push(onSchedule);
}
