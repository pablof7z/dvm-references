import NDK, {
    NDKDVMJobResult,
    NDKDvmJobFeedbackStatus,
    NDKEvent,
    NDKFilter,
    NDKTag,
    NDKUser,
    NostrEvent,
} from "@nostr-dev-kit/ndk";
import { DVM, NDKDVMRequestExtended } from "./index.js";
import debug from "debug";

type TimeInterval = { start: number, end: number, duration: number, durationInHours?: number };

/**
 *
 * @param activeTimestamps in seconds
 * @param windowSize
 * @returns
 */
function findInactivePeriods(activeTimestamps: number[], windowSize: number): TimeInterval[] {
    // Sort the timestamps to process them in sequence
    activeTimestamps.sort((a, b) => a - b);

    let lastActiveEnd = -Infinity;
    const inactiveIntervals: TimeInterval[] = [];

    // Loop through sorted active timestamps
    for (const ts of activeTimestamps) {
        const activeStart = ts - windowSize;
        const activeEnd = ts + windowSize;

        // If there's a gap between the end of the last active window and the start of this one,
        // that's an inactive interval!
        if (activeStart > lastActiveEnd) {
            inactiveIntervals.push({
                start: lastActiveEnd,
                end: activeStart,
                duration: activeStart - lastActiveEnd,
                durationInHours: (activeStart - lastActiveEnd) / 60 / 60
            });
        }

        // Update the end of the last active window
        lastActiveEnd = Math.max(lastActiveEnd, activeEnd);
    }

    return inactiveIntervals;
}

async function getMissedEventIds(
    user: NDKUser,
    request: NDKDVMRequestExtended,
    d: debug.Debugger,
    ndk: NDK
): Promise<string[]> {
    let userFollows: Set<NDKUser>;
    let userInactiveIntervals: TimeInterval[];
    let userFollowReactionEvents: NDKEvent[];

    // get the user's follows
    const getUserFollows = async () => {
        userFollows = await user.follows();
    };

    // get the user's activity chunks
    const getUserInactivePeriods = async (since?: number) => {
        const filter: NDKFilter = { authors: [ user.hexpubkey() ] , limit: 1000 };
        if (since) { filter.since = since; }

        const userEvents = await ndk.fetchEvents(filter)
        const userActiveTimes = Array.from(userEvents).map(e => e.created_at!);

        // const oldestEventTime = Math.min(...userActiveTimes);
        // Should rerun this to get multiple periods up to one week ago

        userInactiveIntervals = findInactivePeriods(userActiveTimes, 600);
    };

    // get all events the user follows have reposted or liked
    const getFollowsReactedToEvents = async () => {
        await getUserFollows();

        // partition user follows into chunks of 100
        const follows = Array.from(userFollows).map((f: NDKUser) => f.hexpubkey());
        const followChunks = [];
        for (let i = 0; i < follows.length; i += 50) {
            followChunks.push(follows.slice(i, i + 200));
        }

        request.processing(`Looking at what your network have been up to while you were gone.`);
        console.log(userFollows.size, "follows");

        const oneMonthAgo = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 30;

        // get all events the user's follows have reposted or liked
        const followReactedEvents = await Promise.all(followChunks.map(async (chunk) => {
            return ndk.fetchEvents({
                authors: chunk,
                limit: 100,
                kinds: [6],
                since: oneMonthAgo
            }, {
                closeOnEose: true, groupable: false
            });
        }));

        const flatFollowReactedEvents: NDKEvent[] = followReactedEvents.map(events => Array.from(events)).flat();

        request.processing(`${flatFollowReactedEvents.length} event reactions`);
        console.log(`${flatFollowReactedEvents.length} event reactions`);

        userFollowReactionEvents = flatFollowReactedEvents;
    }

    const eventDuringInactivePeriod = (event: NDKEvent) => {
        const eventTimeSeconds = event.created_at!;
        return userInactiveIntervals!.some(i => {
            return eventTimeSeconds > i.start && eventTimeSeconds < i.end;
        });
    };

    await Promise.all([
        getFollowsReactedToEvents(),
        getUserInactivePeriods(),
    ]);

    // All events the user's follows have reacted to
    // map is event ID to number of times it was reacted to
    const allReactedToEvents = new Map<string, number>();

    // put all events there is a reaction to in the set with a score of 0
    for (const event of userFollowReactionEvents!) {
        event.getMatchingTags("e").forEach(e => {
            allReactedToEvents.set(e[1], 0);
        });
    }

    // go through all the reaction events and remove the events that were reposted during
    // the active periods
    for (const event of userFollowReactionEvents!) {
        // check if this event has been reacted to during an active period
        if (!eventDuringInactivePeriod(event)) {
            for (const e of event.getMatchingTags("e")) {
                allReactedToEvents.delete(e[1]);
            }
        }
    }

    request.processing(`Found ${allReactedToEvents.size} events that were reposted while you were gone, finding the best ones.`);
    console.log(`Found ${allReactedToEvents.size} events that were reposted while you were gone, finding the best ones.`);

    // score the events with one point per time they were reposted
    for (const event of userFollowReactionEvents!) {
        for (const repostedEvent of event.getMatchingTags("e")) {
            const eventID = repostedEvent[1];
            if (allReactedToEvents.has(eventID)) {
                allReactedToEvents.set(eventID, allReactedToEvents.get(eventID)! + 1);
            }
        }
    }

    /**
     * Gets the top X events based on the number of times they were reposted
     * @param n Number of events to get
     */
    const topEvents = (n: number) => {
        return Array.from(allReactedToEvents).sort((a, b) => b[1] - a[1])
            .slice(0, n)
            .map(e => e[0]);
    }

    console.time(`fetching reposted events`);

    // fetch those events and see if they were posted during an inactive period
    const events = await ndk.fetchEvents({
        ids: topEvents(100)
    });

    console.timeEnd(`fetching reposted events`);

    for (const event of events) {
        // remove events that were posted by the user
        if (event.pubkey === user.hexpubkey()) {
            console.log(`event ${event.id} was posted by the user`);
            allReactedToEvents.delete(event.id);
            continue;
        }

        // remove from the set the events that were posted during an active period
        if (!eventDuringInactivePeriod(event)) {
            console.log(`event ${event.id} was posted during an active period`);
            allReactedToEvents.delete(event.id);
        }
    }

    console.log(`we are left with ${allReactedToEvents.size} events`);

    return topEvents(25);
}

export async function register(dvm: DVM): Promise<void> {
    dvm.d("registering dvm", dvm.name);

    const getSuggestion = async (
        request: NDKDVMRequestExtended
    ): Promise<NDKDVMJobResult> => {
        let pubkey = request.getParam("user");

        if (pubkey?.startsWith('npub')) {
            pubkey = (new NDKUser({ npub: pubkey })).hexpubkey();
        }

        console.log({pubkey})

        if (!pubkey) {
            pubkey = request.pubkey;
        }

        const user = dvm.ndk.getUser({hexpubkey: pubkey});

        return new Promise((resolve) => {
            getMissedEventIds(user, request, dvm.d, dvm.ndk).then((eventIds) => {
                const response = new NDKDVMJobResult(undefined, {} as NostrEvent);
                const content: NDKTag[] = eventIds.map((id: string) => ["e", id]);

                if (content.length > 0) {
                    response.content = JSON.stringify(content);
                    response.status = NDKDvmJobFeedbackStatus.Success;
                } else {
                    response.content = "Hmmm, I couldn't find any events you might have missed. I'm sorry to have failed you in this way."
                    response.status = NDKDvmJobFeedbackStatus.Failed;
                }

                resolve(response);
            })
        });
    };

    dvm.handlers[65008].push(getSuggestion);
}
