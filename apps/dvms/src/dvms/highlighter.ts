import {
    NDKDVMJobResult,
    NDKDvmJobFeedbackStatus,
    NDKHighlight,
    NDKFilter,
    NDKTag,
    NDKUser,
    NostrEvent,
} from "@nostr-dev-kit/ndk";
import { DVM, NDKDVMRequestExtended } from "./index.js";

export async function register(dvm: DVM): Promise<void> {
    dvm.d("registering DVM", dvm.name);

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

        const user = dvm.ndk.getUser({hexpubkey: request.pubkey});

        // Get topics from params
        const topics = request.getMatchingTags("param")
            .filter(t => t[1] === 't')
            .map(t => t[2]);

        console.log(`user ${user.hexpubkey} is interested in topics ${topics}`);

        // Get user follows and their extended network
        const follows = await user.follows();

        console.log(`user has ${follows.size} follows`);

        const followPubkeys = Array.from(follows).map(u => u.hexpubkey);
        let extendedNetwork: string[];

        const getExtendedNetwork = async () => {
            const followEvents = await dvm.ndk.fetchEvents({
                kinds: [3], authors: followPubkeys
            }, { closeOnEose: true, groupable: false });
            const allPubkeys = new Set<string>();
            for (const e of followEvents) {
                for (const tag of e.tags) {
                    if (tag[0] === 'p') {
                        allPubkeys.add(tag[1]);
                    }
                }
            }

            console.log(`extended network has ${allPubkeys.size} pubkeys`);
            extendedNetwork = Array.from(allPubkeys);
        }

        await Promise.race([
            getExtendedNetwork(),
            new Promise<void>((resolve) => {
                setTimeout(() => {
                    console.log(`extended network timeout`);
                    resolve();
                }, 1500);
            })
        ]);

        console.log(`user has ${follows.size} follows`);

        const filter: NDKFilter[] = [];

        filter.push({ kinds:[9802], limit: 50, "#t": topics });

        const content = new Set<NDKTag>;

        const [
            articlesWithTopic,
            articlesByFollows,
            articlesByExtendedNetwork
        ] = await Promise.all([
            new Promise<Set<NDKTag>>((resolve) => {
                const articles = new Set<NDKTag>();
                dvm.ndk.fetchEvents(
                    { kinds:[9802], limit: 50, "#t": topics },
                    { closeOnEose: true, groupable: false }
                ).then(highlightsWithTopic => {
                    for (const highlightEvent of highlightsWithTopic) {
                        const highlight = NDKHighlight.from(highlightEvent);
                        const article = highlight.getArticleTag();

                        if (article) {
                            articles.add(article);
                            console.log(`adding article ${article[1]}`);
                        }
                    }

                    resolve(articles);
                });
            }),

            new Promise<Set<NDKTag>>((resolve) => {
                const articles = new Set<NDKTag>();

                dvm.ndk.fetchEvents(
                    { kinds:[9802], limit: 50, authors: followPubkeys },
                    { closeOnEose: true, groupable: false }
                ).then(highlightsByFollows => {
                    for (const highlightEvent of highlightsByFollows) {
                        const highlight = NDKHighlight.from(highlightEvent);
                        const article = highlight.getArticleTag();

                        if (article) {
                            articles.add(article);
                            console.log(`adding article ${article[1]}`);
                        }
                    }

                    resolve(articles);
                });
            }),

            new Promise<Set<NDKTag>>((resolve) => {
                const articles = new Set<NDKTag>();

                if (!extendedNetwork) {
                    console.log(`extended network not ready`);
                    resolve(articles);
                    return;
                }

                dvm.ndk.fetchEvents(
                    { kinds:[9802], limit: 50, authors: extendedNetwork },
                    { closeOnEose: true, groupable: false }
                ).then(highlightsByFollows => {
                    for (const highlightEvent of highlightsByFollows) {
                        const highlight = NDKHighlight.from(highlightEvent);
                        const article = highlight.getArticleTag();

                        if (article) {
                            articles.add(article);
                            console.log(`adding article ${article[1]}`);
                        }
                    }

                    resolve(articles);
                });
            })
        ]);

        console.log(`found ${articlesWithTopic.size} articles with topic`);
        console.log(`found ${articlesByFollows.size} articles by follows`);

        for (const article of articlesWithTopic) {
            content.add(article);
        }

        for (const article of articlesByFollows) {
            content.add(article);
        }

        for (const article of articlesByExtendedNetwork) {
            content.add(article);
        }

        const response = new NDKDVMJobResult(undefined, {} as NostrEvent);

        response.status = NDKDvmJobFeedbackStatus.Success;
        response.content = JSON.stringify(Array.from(content).slice(0, 100));
        dvm.d(`result`, response.rawEvent());

        return response;
    };

    dvm.handlers[5300].push(getSuggestion);
}
