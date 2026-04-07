export type StartPurchaseParams = {
    userId: string;
    name: string;
    description: string;
    price: string | number | bigint;
};

export type StartPurchaseData = {
    code: string;
    status: string;
};

export type StartPurchaseError = {
    code: string;
    message: string;
};

export type StartPurchaseResult =
    | {
          data: StartPurchaseData;
          error?: never;
      }
    | {
          data?: never;
          error: StartPurchaseError;
      };

export type IngamePurchasePromptPayload = {
    code: string;
    userId: string;
    name: string;
    description: string;
    price: string;
};

export type IngamePurchasesInterface = {
    startPurchase(params: StartPurchaseParams): Promise<StartPurchaseResult>;
};
