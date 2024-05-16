import NDK, {
    NDKEvent,
    NDKDVMRequest,
    NDKUser,
    NDKPrivateKeySigner,
    NDKDvmJobFeedbackStatus,
    NDKFilter,
    NDKKind,
} from "@nostr-dev-kit/ndk";
import { NDKDVMJobResult } from "@nostr-dev-kit/ndk";
import debug from "debug";
import { DVMConfig, Nip89Config } from "../config/index.js";

type EventHandler = (request: NDKDVMRequestExtended) => Promise<NDKDVMJobResult | undefined>;

export type NDKDVMRequestExtended = NDKDVMRequest & {
    processing: (message?: string) => Promise<void>;
    finished: (result: NDKDVMJobResult) => Promise<void>;
};

export class DVM {
    readonly name;
    readonly config: DVMConfig;
    readonly d: debug.Debugger;
    readonly signer: NDKPrivateKeySigner;
    public user: NDKUser | undefined;
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
                    const filter: NDKFilter = {
                        kinds: [iKind],
                        since: Math.floor(Date.now() / 1000),
                    };

                    if (this.config.requireTagging) {
                        filter["#p"] = [this.user!.pubkey];
                    }

                    debug(`subscribing with filter: ` + JSON.stringify(filter));
                    
                    const sub = this.ndk.subscribe(filter, { closeOnEose: false });

                    if (kindConfig?.nip89) {
                        this.publishNip89Announcement(iKind, kindConfig.nip89);
                    }

                    sub.on("event", (e) => this.handleEvent(e));
                }, 2000);
            }
        });
    }

    public async publishNip89Announcement(kind: number, config: Nip89Config): Promise<void> {
        const existingAnnouncenment = await this.ndk.fetchEvent({
            authors: [this.user!.pubkey], "#k": [kind.toString()], kinds: [NDKKind.AppHandler]
        })
        let dTag = existingAnnouncenment?.tagValue("d");

        const event = new NDKEvent(this.ndk);
        event.kind = NDKKind.AppHandler;
        event.content = JSON.stringify(config);
        event.tags.push(["k", kind.toString()])

        if (dTag && existingAnnouncenment) {
            this.d(`updating existing announcement (${existingAnnouncenment.encode()})`);
            event.tags.push(["d", dTag]);
        }

        this.d(`publishing announcement: ${JSON.stringify(event.rawEvent())}`);

        await event.sign(this.signer);
        await this.tryToPublish(event);
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

    async handleEvent(event: NDKEvent): Promise<void> {
        const isEncrypted = event.getMatchingTags("encrypted").length > 0;
        const customer = event.author;
        this.d(`received event`, event.kind);

        const extReq: NDKDVMRequestExtended = NDKDVMRequest.from(event) as NDKDVMRequestExtended;
        extReq.processing = async (message?: string): Promise<void> => {
            this.d(`processing message:`, message);
            const feedback = await extReq.createFeedback(
                NDKDvmJobFeedbackStatus.Processing
            );

            if (message) feedback.content = message;

            feedback.pubkey = this.user!.pubkey;
            feedback.ndk = this.ndk;
            await feedback.sign(this.signer);
            this.tryToPublish(feedback);
        };

        extReq.finished = async (result: NDKDVMJobResult) => {
            result.jobRequest = event;
            result.pubkey = this.user!.pubkey;
            result.ndk = this.ndk;
            result.sign(this.signer).then(() => {
                this.tryToPublish(result);
            });
        }

        // if the event is encrypted, decrypt it and place the decrypted tags in the event's tags
        if (isEncrypted) {
            try {
                const decryptedTags = JSON.parse(await this.signer.decrypt(customer, event.content));
                extReq.tags = [ ...extReq.tags, ...decryptedTags ];
                extReq.content = "";
            } catch (e: any) {
                this.d(`error decrypting event`, e);
                const feedback = extReq.createFeedback(`error decrypting event: ${e.message}`);
                feedback.pubkey = this.user!.pubkey;
                feedback.ndk = this.ndk;
                await feedback.sign(this.signer);
                this.tryToPublish(feedback);
                return;
            }
        }

        // go through the handlers of this kind
        for (const handler of this.handlers[event.kind!]) {
            // check if this DVM has been tagged
            if (!event.tags.find((tag) => tag[0] === "p" && tag[1] === this.user!.pubkey)) {
                // if requireTagging is set to true, skip this event
                if (this.config.requireTagging)
                    continue;
            }

            handler(extReq).then((result: NDKDVMJobResult | undefined) => {
                if (!result) return;

                extReq.finished(result);
            }).catch(async (error: string) => {
                this.d(`error message:`, error);
                const feedback = await extReq.createFeedback(
                    NDKDvmJobFeedbackStatus.Processing
                );

                if (error) feedback.content = error;

                feedback.pubkey = this.user!.pubkey;
                feedback.ndk = this.ndk;
                await feedback.sign(this.signer);
                this.tryToPublish(feedback);
            })
        }
    }
}
