import type { OrderbookEvent } from "../types/orderbook";

interface RegisterTopicMessage {
  RegisterTopic: string;
}

type EventCallback = (event: OrderbookEvent) => void;

export class WebSocketService {
  private ws: WebSocket | null = null;
  private eventCallbacks: EventCallback[] = [];
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectTimeout: number = 1000;
  private currentAccount: string | null = null;

  constructor() {}

  connect(account: string) {
    if (this.ws) {
      console.log("WebSocket already connected");
      if (this.currentAccount != account) {
        this.disconnect();
      } else {
        return;
      }
    }

    this.currentAccount = account;
    this.ws = new WebSocket(import.meta.env.VITE_API_WS_URL);

    this.ws.onopen = () => {
      console.log("WebSocket connected");
      this.reconnectAttempts = 0;
      
      // Subscribe to personal account topic
      const accountMessage: RegisterTopicMessage = {
        RegisterTopic: account,
      };
      this.ws?.send(JSON.stringify(accountMessage));

      // Subscribe to orderbook topic
      const orderbookMessage: RegisterTopicMessage = {
        RegisterTopic: "orderbook",
      };
      this.ws?.send(JSON.stringify(orderbookMessage));
    };

    this.ws.onmessage = (event) => {
      try {
        const data: OrderbookEvent = JSON.parse(event.data);
        this.eventCallbacks.forEach(callback => callback(data));
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    };

    this.ws.onclose = () => {
      console.log("WebSocket disconnected");
      this.handleReconnect();
    };

    this.ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };
  }

  private handleReconnect() {
    if (
      this.reconnectAttempts < this.maxReconnectAttempts &&
      this.currentAccount 
    ) {
      this.reconnectAttempts++;
      setTimeout(() => {
        console.log(
          `Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`,
        );
        this.connect(this.currentAccount!);
      }, this.reconnectTimeout * this.reconnectAttempts);
    }
  }

  subscribeToEvents(callback: EventCallback): () => void {
    this.eventCallbacks.push(callback);
    return () => {
      this.eventCallbacks = this.eventCallbacks.filter(cb => cb !== callback);
    };
  }

  unsubscribeFromEvents() {
    this.eventCallbacks = [];
  }


  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.currentAccount = null;
      this.eventCallbacks = [];
    }
  }
}

export const webSocketService = new WebSocketService();

