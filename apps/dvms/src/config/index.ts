import fs from "fs";
import { configFile } from "../main.js";

export type Nip89Config = Record<string, any>;

export type KindConfiguration = {
    processWithoutPaymentLimit?: number;
    serveResultsWithoutPaymentLimit?: number;
    nip89?: Nip89Config;
};

export type DVMConfig = {
    key: string;
    module?: string;
    kinds: Record<number, KindConfiguration>;
    requireTagging?: boolean;
};

type IConfig = {
    dvms: Record<string, DVMConfig>;
};

export function getConfig(): IConfig {
    let config: IConfig;

    if (fs.existsSync(configFile)) {
        config = JSON.parse(fs.readFileSync(configFile, "utf8"));
    } else {
        config = { dvms: {} };
    }

    return config;
}

export function saveConfig(config: IConfig) {
    fs.writeFileSync(configFile, JSON.stringify(config));
}
