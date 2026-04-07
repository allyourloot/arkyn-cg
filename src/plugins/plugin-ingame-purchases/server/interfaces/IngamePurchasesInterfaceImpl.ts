import { Logger } from "@core/shared/utils";
import type {
    IngamePurchasePromptPayload,
    IngamePurchasesInterface,
    StartPurchaseError,
    StartPurchaseParams,
    StartPurchaseResult,
} from "./IngamePurchasesInterface";

const logger = new Logger("IngamePurchases");

const INGAME_PURCHASES_API_BASE = "http://prod.persuade-creative.hytopia.com/IngamePurchases";
const USER_AGENT = "insomnia/2023.5.8";
const POLL_INTERVAL_MS = 1_000;
const POLL_TIMEOUT_MS = 60_000;

type StartPurchaseResponse = {
    isSuccess?: boolean;
    code?: string;
    data?: {
        code?: string;
    };
    error?: {
        code?: string;
        message?: string;
    };
};

type GetPurchaseByCodeResponse = {
    status?: string;
};

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "Network request failed";
}

async function startPurchaseRequest(
    apiKey: string,
    gameId: string,
    params: StartPurchaseParams,
): Promise<{ code: string } | { error: StartPurchaseError }> {
    const responseOrError = await fetch(`${INGAME_PURCHASES_API_BASE}/Start`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
            "X-Api-Key": apiKey,
        },
        body: JSON.stringify({
            gameId,
            buyerUserId: params.userId,
            name: params.name,
            description: params.description,
            price: String(params.price),
        }),
    }).catch((error: unknown) => error);

    if (!(responseOrError instanceof Response)) {
        return {
            error: {
                code: "networkError",
                message: getErrorMessage(responseOrError),
            },
        };
    }

    const response = responseOrError;
    const payload = await response
        .json()
        .then((parsed: unknown) => parsed as StartPurchaseResponse)
        .catch(() => null);

    if (payload?.error && (payload.isSuccess === false || !response.ok)) {
        return {
            error: {
                code: isNonEmptyString(payload.error.code) ? payload.error.code : "startPurchaseError",
                message: isNonEmptyString(payload.error.message)
                    ? payload.error.message
                    : "Purchase start request failed",
            },
        };
    }

    if (!response.ok) {
        return {
            error: {
                code: "startPurchaseHttpError",
                message: `Failed to start purchase: ${response.status} ${response.statusText}`,
            },
        };
    }

    const code = payload?.code ?? payload?.data?.code;
    if (!isNonEmptyString(code)) {
        return {
            error: {
                code: "startPurchaseResponseInvalid",
                message: "Purchase start response missing code",
            },
        };
    }

    return { code };
}

async function getPurchaseStatusByCode(apiKey: string, code: string): Promise<string> {
    const response = await fetch(`${INGAME_PURCHASES_API_BASE}/GetByCode/${encodeURIComponent(code)}`, {
        method: "GET",
        headers: {
            "User-Agent": USER_AGENT,
            "X-Api-Key": apiKey,
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to poll purchase status: ${response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as GetPurchaseByCodeResponse;
    if (!isNonEmptyString(payload.status)) {
        throw new Error("Purchase status response missing status");
    }

    return payload.status;
}

function validateStartPurchaseParams(params: StartPurchaseParams): StartPurchaseError | null {
    if (!isNonEmptyString(params.userId)) {
        return { code: "invalidUserId", message: "startPurchase requires a non-empty userId" };
    }
    if (!isNonEmptyString(params.name)) {
        return { code: "invalidName", message: "startPurchase requires a non-empty name" };
    }
    if (!isNonEmptyString(params.description)) {
        return { code: "invalidDescription", message: "startPurchase requires a non-empty description" };
    }
    if (typeof params.price !== "string" && typeof params.price !== "number" && typeof params.price !== "bigint") {
        return {
            code: "invalidPrice",
            message: "startPurchase requires price to be a string, number, or bigint",
        };
    }

    return null;
}

function toStartPurchaseError(error: unknown): StartPurchaseError {
    if (error instanceof Error) {
        if (error instanceof TypeError) {
            return {
                code: "networkError",
                message: error.message,
            };
        }

        return {
            code: "startPurchaseFailed",
            message: error.message,
        };
    }

    return {
        code: "startPurchaseFailed",
        message: "Unknown startPurchase failure",
    };
}

export class IngamePurchasesInterfaceImpl implements IngamePurchasesInterface {
    private readonly apiKey: string;
    private readonly gameId: string;
    private readonly showPromptForUser: (payload: IngamePurchasePromptPayload) => void;

    constructor(
        apiKey: string,
        gameId: string,
        showPromptForUser: (payload: IngamePurchasePromptPayload) => void,
    ) {
        this.apiKey = apiKey;
        this.gameId = gameId;
        this.showPromptForUser = showPromptForUser;
    }

    async startPurchase(params: StartPurchaseParams): Promise<StartPurchaseResult> {
        const validationError = validateStartPurchaseParams(params);
        if (validationError) {
            return { error: validationError };
        }

        const purchaseStartResult = await startPurchaseRequest(this.apiKey, this.gameId, params).catch((error: unknown) => ({
            error: toStartPurchaseError(error),
        }));
        if ("error" in purchaseStartResult) {
            return { error: purchaseStartResult.error };
        }

        const code = purchaseStartResult.code;
        this.showPromptForUser({
            code,
            userId: params.userId,
            name: params.name,
            description: params.description,
            price: String(params.price),
        });

        const startedAt = Date.now();
        let status = "INITIAL";

        while (status === "INITIAL") {
            const polledStatusOrError = await getPurchaseStatusByCode(this.apiKey, code)
                .then((polledStatus) => polledStatus)
                .catch((error: unknown) => ({ error: toStartPurchaseError(error) }));

            if (typeof polledStatusOrError !== "string") {
                return {
                    error: polledStatusOrError.error,
                };
            }

            status = polledStatusOrError;
            if (status !== "INITIAL") {
                return {
                    data: { code, status },
                };
            }

            if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
                return {
                    error: {
                        code: "purchaseStatusTimeout",
                        message: `Timed out waiting for purchase status to change from INITIAL for code ${code}`,
                    },
                };
            }

            await sleep(POLL_INTERVAL_MS);
        }

        logger.warn(`Unexpected purchase polling state for code ${code}; returning INITIAL`);
        return {
            data: { code, status },
        };
    }
}
