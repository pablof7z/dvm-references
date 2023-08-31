# DVM Reference Implementation

This is a reference implementation of a DVM (Data Vending Machine) backend.

## Properties

 - [x] Segregated identities per DVM
 - [x] Modular DVMs -- each DVM is instantiated in it's own module

## Modules

DVMs are just modules that export a `register` function. This function is called
upon instantiation of the DVM.

Within the module, the DVM should register handlers for the different kinds it wants to
support.

Here is a demo DVM that would say Hello World when it's tagged in a request

```json
// config.json
{
    "dvms": {
        "You might have missed": {
            "module": "dvms/hello-world.js",
            "key": "<private-key-in-hex>",
            "requireTagging": true,
            "kinds": {
                "65100": {
                }
            }
        }
    }
}
```

```typescript
// hello-world.ts
export async function register(dvm: DVM): Promise<void> {
    dvm.d("registering DVM", dvm.name);

    const sayHello = async (request: NDKDVMRequestExtended) => {
        request.processing(`I am processing your request job`);

        const response = new NDKDVMJobResult();

        response.content = "Hello World!";

        return response;
    };

    dvm.handlers[65100].push(sayHello);
}
```

## Author

* [@pablof7z](https://nostr.com/npub1l2vyh47mk2p0qlsku7hg0vn29faehy9hy34ygaclpn66ukqp3afqutajft)

## License

MIT
