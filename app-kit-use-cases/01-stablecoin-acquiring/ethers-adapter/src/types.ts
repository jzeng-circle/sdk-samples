export interface PaymentSession {
  sessionId: string;
  orderId: string;
  orderAmount: string;
  paymentAddress: string;
  paymentPrivateKey: string;  // stored for aggregation step
  expectedAmount: string;     // orderAmount + platform fee
  expectedToken: string;
  customerChain: string;
  expiresAt: Date;
  status: 'pending' | 'received' | 'aggregated' | 'expired';
}

export interface MerchantConfig {
  merchantId: string;
  settlementAddress: string;
  settlementChain: string;
}
