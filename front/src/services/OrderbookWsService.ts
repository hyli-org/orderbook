import type { Order } from '../types/orderbook';

const WEBSOCKET_URL = import.meta.env.VITE_API_WS_URL || 'ws://localhost:3000/ws'; // Use env variable or fallback

// Define the expected shape of the OrderUpdate data
interface OrderUpdateData {
  order_id: string;
  remaining_quantity: number; 
  pair: [string, string];
}

class OrderbookWsService {
  private ws: WebSocket | null = null;
  private static instance: OrderbookWsService;
  private orderCreatedCallbacks: Array<(order: Order) => void> = [];
  private orderCancelledCallbacks: Array<(data: { order_id: string; pair: [string, string] }) => void> = [];
  private orderExecutedCallbacks: Array<(data: { order_id: string; pair: [string, string] }) => void> = [];
  private orderUpdatedCallbacks: Array<(data: OrderUpdateData) => void> = [];

  private constructor() {
    // Private constructor to ensure singleton
  }

  public static getInstance(): OrderbookWsService {
    if (!OrderbookWsService.instance) {
      OrderbookWsService.instance = new OrderbookWsService();
    }
    return OrderbookWsService.instance;
  }

  public connect(pair: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // If already connected to a pair, potentially switch topics or handle accordingly
      // For now, let's assume we might need to close and reopen for a new pair if the topic is dynamic per connection
      console.log('WebSocket already connected. To change pair, disconnect and reconnect.');
      // Or, if the server supports dynamic topic subscriptions on a single connection:
      // this.subscribeToTopic(pair); 
      return;
    }

    // TODO: Get the correct websocket URL, currently it's ws://localhost:3000/ws but the server code does not specify a /ws path.
    // The server code only specifies HTTP routes. We need to clarify how the WebSocket connection is established.
    // For now, proceeding with a generic URL.
    this.ws = new WebSocket(`${WEBSOCKET_URL}`); // The topic/pair might need to be part of the URL or a subscription message

    this.ws.onopen = () => {
      console.log(`Connected to WebSocket for pair: ${pair}`);
      // Assuming the server expects a subscription message for the pair's topic
      this.subscribeToTopic(pair);
    };

    this.ws.onmessage = (event) => {
      try {
        const directPayload = JSON.parse(event.data as string);

        // The server seems to be sending the Rust enum variant directly as JSON:
        // e.g., { "OrderCreated": { "order": { ... } } }
        if (typeof directPayload === 'object' && directPayload !== null) {
          if ("OrderCreated" in directPayload && 
              directPayload.OrderCreated && 
              typeof directPayload.OrderCreated === 'object' && 
              directPayload.OrderCreated.order && 
              typeof directPayload.OrderCreated.order === 'object') {
            
            const order = directPayload.OrderCreated.order as Order;
            this.orderCreatedCallbacks.forEach(callback => callback(order));
            // console.log("Successfully processed OrderCreated event:", order);
          } else if ("OrderCancelled" in directPayload && 
                     directPayload.OrderCancelled && 
                     typeof directPayload.OrderCancelled === 'object' && 
                     directPayload.OrderCancelled.order_id && 
                     directPayload.OrderCancelled.pair) {
            
            const cancelData = {
              order_id: directPayload.OrderCancelled.order_id as string,
              pair: directPayload.OrderCancelled.pair as [string, string]
            };
            this.orderCancelledCallbacks.forEach(callback => callback(cancelData));
            console.log("Successfully processed OrderCancelled event:", cancelData);
          } else if ("OrderExecuted" in directPayload &&
                     directPayload.OrderExecuted &&
                     typeof directPayload.OrderExecuted === 'object' &&
                     directPayload.OrderExecuted.order_id &&
                     directPayload.OrderExecuted.pair) {

            const executedData = {
              order_id: directPayload.OrderExecuted.order_id as string,
              pair: directPayload.OrderExecuted.pair as [string, string]
            };
            this.orderExecutedCallbacks.forEach(callback => callback(executedData));
            console.log("Successfully processed OrderExecuted event:", executedData);
          } else if ("OrderUpdate" in directPayload &&
                     directPayload.OrderUpdate &&
                     typeof directPayload.OrderUpdate === 'object' &&
                     directPayload.OrderUpdate.order_id &&
                     typeof directPayload.OrderUpdate.remaining_quantity === 'number' && // Check type of remaining_quantity
                     directPayload.OrderUpdate.pair) {
            
            const updateData: OrderUpdateData = {
              order_id: directPayload.OrderUpdate.order_id as string,
              remaining_quantity: directPayload.OrderUpdate.remaining_quantity as number,
              pair: directPayload.OrderUpdate.pair as [string, string]
            };
            this.orderUpdatedCallbacks.forEach(callback => callback(updateData));
            console.log("Successfully processed OrderUpdate event:", updateData);

          } else {
            // Log other types of valid object messages if not OrderCreated/OrderCancelled with the expected structure
            // console.log("Received other object message type or malformed event:", directPayload);
          }
        } else {
          console.error("Parsed WebSocket message, but it is not a recognizable object:", directPayload);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error, 'Raw event.data:', event.data);
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    this.ws.onclose = () => {
      console.log('WebSocket connection closed');
      this.ws = null;
    };
  }

  // This method might be needed if the server requires sending a message to subscribe to a topic
  private subscribeToTopic(topic: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const registerMessage = { RegisterTopic: topic };
      this.ws.send(JSON.stringify(registerMessage));
      console.log(`Sent subscription request for topic: ${topic}`);
    } else {
      console.warn(`WebSocket not open. Cannot subscribe to topic: ${topic}`);
    }
  }

  public onOrderCreated(callback: (order: Order) => void): () => void {
    this.orderCreatedCallbacks.push(callback);
    // Return an unsubscribe function
    return () => {
      this.orderCreatedCallbacks = this.orderCreatedCallbacks.filter(cb => cb !== callback);
    };
  }

  public onOrderCancelled(callback: (data: { order_id: string; pair: [string, string] }) => void): () => void {
    this.orderCancelledCallbacks.push(callback);
    // Return an unsubscribe function
    return () => {
      this.orderCancelledCallbacks = this.orderCancelledCallbacks.filter(cb => cb !== callback);
    };
  }

  public onOrderExecuted(callback: (data: { order_id: string; pair: [string, string] }) => void): () => void {
    this.orderExecutedCallbacks.push(callback);
    return () => {
      this.orderExecutedCallbacks = this.orderExecutedCallbacks.filter(cb => cb !== callback);
    };
  }

  public onOrderUpdated(callback: (data: OrderUpdateData) => void): () => void {
    this.orderUpdatedCallbacks.push(callback);
    return () => {
      this.orderUpdatedCallbacks = this.orderUpdatedCallbacks.filter(cb => cb !== callback);
    };
  }

  public disconnect(): void {
    if (this.ws) {
      this.ws.close();
    }
  }
}

export default OrderbookWsService.getInstance(); 