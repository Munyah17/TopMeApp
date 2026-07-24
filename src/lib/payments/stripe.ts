import Stripe from "stripe";

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("Stripe is not configured — set STRIPE_SECRET_KEY.");
  }
  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripeClient;
}

export async function createTopupCheckoutSession(opts: {
  amount: number;
  reference: string;
  userId: string;
  customerEmail?: string;
}) {
  const stripe = getStripe();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  return stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    customer_email: opts.customerEmail,
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: { name: "TopMe wallet top up" },
          unit_amount: Math.round(opts.amount * 100),
        },
        quantity: 1,
      },
    ],
    metadata: { reference: opts.reference, userId: opts.userId, purpose: "wallet_topup" },
    success_url: `${appUrl}/wallet?topup=success`,
    cancel_url: `${appUrl}/wallet?topup=cancelled`,
  });
}
