// Only explicitly customer-safe messages may cross the Server Action boundary.
// Unexpected database/provider exceptions must stay in server-side diagnostics.
export class PaymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentError";
  }
}
