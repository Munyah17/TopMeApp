export type UserRole = "customer" | "admin" | "superadmin";
export type TxStatus = "pending" | "success" | "failed";
export type AmountMode = "chips" | "bundles" | "packages" | "outstanding";
export type FulfillmentStatus = "simulated" | "pending" | "fulfilled" | "failed";
export type TeamStatus = "invited" | "active" | "disabled";
export type VoucherStatus = "active" | "redeemed" | "expired";

export interface Profile {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  role: UserRole;
  notifications_enabled: boolean;
  created_at: string;
}

export interface Wallet {
  user_id: string;
  balance: number;
  updated_at: string;
}

export interface WalletLedgerRow {
  id: string;
  user_id: string;
  type: "topup" | "debit" | "refund" | "gift_send" | "gift_redeem";
  amount: number;
  provider: string | null;
  reference: string | null;
  status: TxStatus;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface Network {
  id: string;
  name: string;
  color: string;
}

export interface ServiceCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  bg: string;
  description: string | null;
  sort_order: number;
}

export interface Service {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  icon: string;
  provider_label: string | null;
  color: string;
  amount_mode: AmountMode;
  chips: number[] | null;
  outstanding: number | null;
  needs_network: boolean;
  shows_token: boolean;
  id_label: string;
  id_placeholder: string | null;
  extra_field_label: string | null;
  extra_field_placeholder: string | null;
  is_gift: boolean;
  validate_msg: string | null;
  mock_name: string | null;
  mock_sub: string | null;
  sort_order: number;
}

export interface DataBundle {
  id: string;
  service_id: string;
  label: string;
  size: string;
  price: number;
  sub: string | null;
  sort_order: number;
}

export interface TvPackage {
  id: string;
  service_id: string;
  name: string;
  price: number;
  sort_order: number;
}

export interface Transaction {
  id: string;
  user_id: string;
  service_id: string;
  network_id: string | null;
  recipient_identifier: string;
  extra_value: string | null;
  amount: number;
  fee: number;
  status: TxStatus;
  reference: string;
  receipt: Record<string, unknown>;
  fulfillment_provider: string;
  fulfillment_status: FulfillmentStatus;
  created_at: string;
}

export interface Favorite {
  user_id: string;
  service_id: string;
  created_at: string;
}

export interface Beneficiary {
  id: string;
  user_id: string;
  label: string | null;
  service_id: string | null;
  identifier: string;
  created_at: string;
}

export interface GiftVoucher {
  id: string;
  code: string;
  sender_id: string;
  receiver_phone: string;
  amount: number;
  status: VoucherStatus;
  created_at: string;
  redeemed_at: string | null;
  redeemed_by: string | null;
}

export interface TopupIntent {
  id: string;
  user_id: string;
  amount: number;
  provider: "paynow" | "stripe" | "ecocash";
  reference: string;
  status: "pending" | "completed" | "failed";
  meta: Record<string, unknown>;
  created_at: string;
}

export interface ApiModuleSafe {
  id: string;
  name: string;
  provider: string;
  category: string | null;
  status: "active" | "inactive";
  key_last4: string | null;
  webhook_url: string | null;
  icon: string;
  color: string;
  created_at: string;
  created_by: string | null;
}

export interface TeamMember {
  id: string;
  owner_id: string;
  user_id: string | null;
  invited_email: string;
  name: string | null;
  role: string;
  permissions: string[];
  status: TeamStatus;
  created_at: string;
}
