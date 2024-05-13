import axios from "axios";
import {
    NDKDVMJobResult,
    NDKDvmJobFeedbackStatus,
    NDKEvent,
    NDKTag,
    NostrEvent,
} from "@nostr-dev-kit/ndk";
import { DVM, NDKDVMRequestExtended } from "./index.js";
import * as _OTS from "opentimestamps";

const OTS = _OTS.default;

async function createStamp(id: string) {
    const hash = Buffer.from(id,'hex');
    const detached = OTS.DetachedTimestampFile.fromHash(new OTS.Ops.OpSHA256(), hash);
    await OTS.stamp(detached);
    const fileOts = detached.serializeToBytes();
    const stamp = Buffer.from(fileOts).toString('base64');

    console.log(`stamp`, stamp);

    return stamp;

    // TODO: Save stamp in file to keep track

    return detached;
}

async function upgradeStamp(
    dvm: DVM,
    base64Stamp: string,
    inputEvent: NDKEvent,
    requestEvent: NDKDVMRequestExtended,
): Promise<boolean | undefined> {
    const fileOts = Buffer.from(base64Stamp, 'base64');
    const detached = OTS.DetachedTimestampFile.deserialize(fileOts);
    const upgraded = await OTS.upgrade(detached);

    if (!upgraded) {
        return;
    }

    const upgradedFileOts = detached.serializeToBytes();
    const upgradedStamp = Buffer.from(upgradedFileOts).toString('base64');

    dvm.d(`stamp upgraded`);
    const stampEvent = new NDKEvent(dvm.ndk, {
        kind: 1040,
        content: upgradedStamp,
        tags: [
            [ "e", inputEvent.id ],
            [ "p", inputEvent.pubkey ],
            [ "alt", "NIP-03 time stamp" ],
        ]
    } as NostrEvent);

    await stampEvent.sign(dvm.signer);
    await stampEvent.publish();

    dvm.d(`NIP-03 time stamp event`, stampEvent.rawEvent());

    const result = new NDKDVMJobResult(dvm.ndk);
    result.result = stampEvent.id;
    result.jobRequest = requestEvent;
    result.pubkey = dvm.user!.pubkey;
    result.ndk = dvm.ndk;
    await result.sign(dvm.signer);
    await result.publish();

    dvm.d("job result event", result.rawEvent());

    return true;
}

export async function register(dvm: DVM): Promise<void> {
    dvm.d("registering DVM", dvm.name);

    const stamp = async (
        request: NDKDVMRequestExtended
    ): Promise<NDKDVMJobResult | undefined> => {
        const inputEventId = request.tagValue("i");

        if (!inputEventId) {
            throw "No input found";
        }

        const inputEvent = await dvm.ndk.fetchEvent(inputEventId);

        if (!inputEvent) {
            throw "Unable to find input event";
        }

        request.processing("Stamping event");

        const detached = await createStamp(inputEventId);
        // const detached = "AE9wZW5UaW1lc3RhbXBzAABQcm9vZgC/ieLohOiSlAEI+L6hEW0qEIUdC2ia94Mv9fErzcF24dX64PWiitArxxbwENQZE/BBIiW0SI+TYJrWW1gI//AQLdlS+D1HMIdI4oOE2bbPWAjwIBJYGTpqND9Tk4ORM6q8vJcd/xZ6ysRxNwd9I/LIThpKCPAgTDHfeRQ9TzaPqnhUvX473tGaQOZxd73m2ynOULlCWb8I8QRlPN+m8AgYRLMjhQmC1wCD3+MNLvkMji4taHR0cHM6Ly9hbGljZS5idGMuY2FsZW5kYXIub3BlbnRpbWVzdGFtcHMub3Jn//AQj/brY6m/2gYy4E8xjHHdIAjxIKoNAkD4PGMx/IIsXzO4lv4FFpevrA0D65K+pAb81gXaCPEEZTzfpfAIcROabcFeviwAg9/jDS75DI4sK2h0dHBzOi8vYm9iLmJ0Yy5jYWxlbmRhci5vcGVudGltZXN0YW1wcy5vcmfwEDVrzRzQRmRy85Ml1cVRtAAI8SCRJPrCNMv2L0HurH3N61cBuESTtxNYR5gqoWsQxmUkfAjwILQaT9SFVm5pk1NYrGq2+aVZiQ+iDcm4TUSYmJZDFus3CPEEZTzfpfAIOfzeA9UBuDwAg9/jDS75DI4pKGh0dHBzOi8vZmlubmV5LmNhbGVuZGFyLmV0ZXJuaXR5d2FsbC5jb20=";

        request.processing("Stamping sent to blockchain");

        const checkInterval = setInterval(async () => {
            if (await upgradeStamp(
                dvm,
                detached,
                inputEvent,
                request
            )) {
                clearInterval(checkInterval);
            }
        }, 60000);

        if (await upgradeStamp(
            dvm,
            detached,
            inputEvent,
            request
        )) {
            clearInterval(checkInterval);
        }

        return;

        const response = new NDKDVMJobResult(undefined, {} as NostrEvent);
        response.jobRequest = request;
        const content: NDKTag[] = [];

        // dvm.d(`result`, json);

        // json.forEach((item: { event_id: string }) => {
        //     content.push(["e", item.event_id]);
        // });
        // response.status = NDKDvmJobFeedbackStatus.Success;
        // response.content = JSON.stringify(content);
        // dvm.d(`result`, response.rawEvent());

        return response;
    };

    dvm.handlers[5900].push(stamp);
}
