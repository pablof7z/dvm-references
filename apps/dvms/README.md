# Data Vending Machine - Service Provider

This is an implementation of a very simple [Data Vending Machine](https://github.com/nostr-protocol/nips/blob/vending-machine/vending-machine.md) Service Provider.

It can be used with the dev version of Highlighter on https://dev.highlighter.com/web

# Supported Job Types

AI subsystems are run on a self-hosted machine using [Prem AI](https://www.premai.io/).

-   Speech-to-text
    Using `whisper` through Prem AI.

-   More job types will be added in the future

# Config

```js
{
    "dvms": {
        // Any internal name you want to use
        "You might have missed": {
            // This is the module that will be executed
            "module": "/Users/pablofernandez/src/kind0/dvm/apps/dvms/dist/dvms/you-might-have-missed.js",

            // Private key of the DVM
            "key": "<private-key-for-the-dvm-here>",

            // Does the DVM require explicitly being tagged or will it respond to any job of the listed kinds?
            "requireTagging": true,
            "kinds": {
                // List here the kinds that you want this DVM to process
                "5300": {
                    // This is a NIP-89 listing that will be displayed to users that want to interact; this is in the same
                    // format as a kind:0 metadata information
                    "nip89": {
                            "name":"You might have missed",
                            "image":"https://cdn.nostr.build/i/fb207be87d748ad927f52a063c221d1d97ef6d75e660003cb6e85baf2cd2d64e.jpg",
                            "about":"My goal is to help you keep up – or catch up – with your world, no matter how much time you spend on t̶w̶i̶t̶t̶e̶r̶ nostr.",
                            "nip90Params":{"user":{"required":false,"values":[]}}
                        }
                    }
                }
            }
        },

        // Another DVM here
        "NWC DVM": {
            "module": "/Users/pablofernandez/src/kind0/dvm/apps/dvms/dist/dvms/nwc.js",
                "key": "<private-key-for-the-dvm-here>",
                "requireTagging": true,
                "kinds": {
                    // supports multiple event kinds
                    "5901": {
                    },
                    "5902": {
                    },
                    "5903": {
                    }
                }
        }
    }
}
```

# Demo video

https://www.youtube.com/watch?v=OJx6ExVTS7c

# License

MIT

