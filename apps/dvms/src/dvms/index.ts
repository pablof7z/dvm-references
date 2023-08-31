import NDK, {
    NDKEvent,
    NDKDVMRequest,
    NDKUser,
    NDKPrivateKeySigner,
    NDKDvmJobFeedbackStatus,
} from "@nostr-dev-kit/ndk";
import { NDKDVMJobResult } from "@nostr-dev-kit/ndk";
import debug from "debug";
import { DVMConfig } from "../config/index.js";

type EventHandler = (request: NDKDVMRequestExtended) => Promise<NDKDVMJobResult>;

export type NDKDVMRequestExtended = NDKDVMRequest & {
    processing: (message?: string) => Promise<void>;
};

export class DVM {
    readonly name;
    readonly config: DVMConfig;
    readonly d: debug.Debugger;
    readonly signer: NDKPrivateKeySigner;
    private user: NDKUser | undefined;
    public ndk: NDK; // DVMs shouldn't really use this same NDK because if they don't properly clean up after themselves they will leak subscriptions on the main code
    public handlers: Record<number, EventHandler[]>;

    public constructor(ndk: NDK, name: string, config: DVMConfig) {
        this.ndk = ndk;
        this.name = name;
        this.config = config;
        this.d = debug(`DVM ${name}`);
        this.handlers = {};
        this.signer = new NDKPrivateKeySigner(config.key);
        this.signer.user().then((user) => {
            this.user = user;
        });

        if (config.module) {
            import(config.module).then((module) => {
                module.register(this);
            });
        }
    }

    public start(): void {
        this.signer.blockUntilReady().then(() => {
            // go through all supported kinds and create a subscription for each
            for (const [kind, kindConfig] of Object.entries(
                this.config.kinds
            )) {
                const iKind = parseInt(kind);
                this.handlers[iKind] ??= [];

                setTimeout(() => {
                const sub = this.ndk.subscribe(
                    {
                        kinds: [iKind],
                        since: Math.floor(Date.now() / 1000) - 300
                    },
                    { closeOnEose: false }
                );

                sub.on("event", (e) => this.handleEvent(e));
                }, 2000);
            }
        });
    }

    private async tryToPublish(event: NDKEvent, attempt: number = 0, maxAttempts = 5, delayBetweenAttempts = 5000): Promise<void> {
        try {
            await event.publish();
        } catch (e) {
            this.d(`error publishing event`, e, attempt);
            if (attempt < maxAttempts) {
                setTimeout(() => {
                    this.tryToPublish(event, attempt + 1);
                }, delayBetweenAttempts);
            }
        }
    }

    public handleEvent(event: NDKEvent): void {
        this.d(`received event`, event.kind);

        const extReq: NDKDVMRequestExtended = NDKDVMRequest.from(event) as NDKDVMRequestExtended;
        extReq.processing = async (message?: string): Promise<void> => {
            this.d(`processing message:`, message);
            const feedback = await extReq.createFeedback(
                NDKDvmJobFeedbackStatus.Processing
            );

            if (message) feedback.content = message;

            feedback.pubkey = this.user!.hexpubkey();
            feedback.ndk = this.ndk;
            await feedback.sign(this.signer);
            this.tryToPublish(feedback);
        };

        // go through the handlers of this kind
        for (const handler of this.handlers[event.kind!]) {
            // check if this DVM has been tagged
            if (!event.tags.find((tag) => tag[0] === "p" && tag[1] === this.user!.hexpubkey())) {
                // if requireTagging is set to true, skip this event
                if (this.config.requireTagging)
                    continue;
            }

            handler(extReq).then((result: NDKDVMJobResult) => {
                result.jobRequest = event;
                result.tag(event, "job");
                result.pubkey = this.user!.hexpubkey();
                result.ndk = this.ndk;
                result.sign(this.signer).then(() => {
                    this.tryToPublish(result);
                });
            });
        }
    }
}
