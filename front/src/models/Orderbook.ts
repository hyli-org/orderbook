import { BorshSchema, borshDeserialize, borshSerialize } from "borsher";
import type { Blob, StructuredBlobData } from "hyli";
import { structuredBlobDataSchema } from "hyli";

export type Unit = Record<string, never>;

export type TokenPair = [string, string];

export enum OrderType {
    Buy = "Buy",
    Sell = "Sell"
}

export type BorshOrderType =
    | { Buy: Unit }
    | { Sell: Unit };

export interface Order {
    owner: string;
    order_id: string;
    order_type: OrderType; 
    price: number | null;
    pair: TokenPair;
    quantity: number;
}

export type OrderbookAction =
    | {
          CreateOrder: {
              order_id: string;
              order_type: BorshOrderType; 
              price: number | null;
              pair: TokenPair;
              quantity: number;
          };
      }
    | {
          Cancel: {
              order_id: string;
          };
      }
    | {
          Deposit: {
              token: string;
              amount: number;
          };
      }
    | {
          Withdraw: {
              token: string;
              amount: number;
          };
      };

export type OrderbookEvent =
    | {
          OrderCreated: {
              order: Order;
          };
      }
    | {
          OrderCancelled: {
              order_id: string;
              pair: TokenPair;
          };
      }
    | {
          OrderExecuted: {
              order_id: string;
              pair: TokenPair;
          };
      }
    | {
          OrderUpdate: {
              order_id: string;
              remaining_quantity: number;
              pair: TokenPair;
          };
      }
    | {
          BalanceUpdated: {
              user: string;
              token: string;
              amount: number;
          };
      };

// Borsh schemas
export const orderTypeSchema = BorshSchema.Enum({
    Buy: BorshSchema.Unit,
    Sell: BorshSchema.Unit,
});

export const tokenPairSchema = BorshSchema.Struct({
    0: BorshSchema.String,
    1: BorshSchema.String,
});

export const orderbookActionSchema = BorshSchema.Enum({
    CreateOrder: BorshSchema.Struct({
        order_id: BorshSchema.String,
        order_type: orderTypeSchema, 
        price: BorshSchema.Option(BorshSchema.u32),
        pair: tokenPairSchema,
        quantity: BorshSchema.u32,
    }),
    Cancel: BorshSchema.Struct({
        order_id: BorshSchema.String,
    }),
    Deposit: BorshSchema.Struct({
        token: BorshSchema.String,
        amount: BorshSchema.u32,
    }),
    Withdraw: BorshSchema.Struct({
        token: BorshSchema.String,
        amount: BorshSchema.u32,
    }),
});

// Serialization/Deserialization functions
export const deserializeOrderbookAction = (data: number[]): OrderbookAction => {
    return borshDeserialize(orderbookActionSchema, new Uint8Array(data)) as OrderbookAction;
};

export const serializeOrderbookAction = (action: OrderbookAction): Uint8Array => {
    return borshSerialize(orderbookActionSchema, action);
};

// Helper functions to create actions
export const createOrder = (
    order_id: string,
    order_type_enum_val: OrderType, 
    price: number | null,
    pair: TokenPair,
    quantity: number,
): Blob => {
    const borshOrderType: BorshOrderType = order_type_enum_val === OrderType.Buy
        ? { Buy: {} }
        : { Sell: {} };

    const actionParams: OrderbookAction = {
        CreateOrder: {
            order_id,
            order_type: borshOrderType,
            price,
            pair,
            quantity,
        },
    };

    const serializedBytes = borshSerialize(orderbookActionSchema, actionParams);

    const blob: Blob = {
        contract_name: "orderbook",
        data: Array.from(serializedBytes),
    };
    return blob;
};

export const cancelOrder = (
    order_id: string,
    caller: number | null
): Blob => {
    const action: OrderbookAction = {
        Cancel: {
            order_id,
        },
    };

    const structured: StructuredBlobData<OrderbookAction> = {
        caller: caller ? { 0: caller } : null,
        callees: null,
        parameters: action,
    };

    const blob: Blob = {
        contract_name: "orderbook",
        data: Array.from(serializeOrderbookAction(action)),
    };
    return blob;
};

export const deposit = (
    token: string,
    amount: number,
): Blob => {
    const action: OrderbookAction = {
        Deposit: {
            token,
            amount,
        },
    };

    const blob: Blob = {
        contract_name: "orderbook",
        data: Array.from(serializeOrderbookAction(action)),
    };
    return blob;
};

export const withdraw = (
    token: string,
    amount: number,
): Blob => {
    const action: OrderbookAction = {
        Withdraw: {
            token,
            amount,
        },
    };

    const blob: Blob = {
        contract_name: "orderbook",
        data: Array.from(serializeOrderbookAction(action)),
    };
    return blob;
}; 