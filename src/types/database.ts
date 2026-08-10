export type UserRole = "customer" | "admin" | "superadmin";
export type TxStatus = "pending" | "success" | "failed";
export type AmountMode = "chips" | "bundles" | "packages" | "outstanding";
export type FulfillmentStatus = "simulated" | "pending" | "fulfilled" | "failed";
export type TeamStatus = "invited" | "active" | "disabled";
export type VoucherStatus = "active" | "redeemed" | "expired";

export interface PromoBanner {
  id: string;
  kind: "image" | "announcement";
  image_url: string | null;
  link_url: string | null;
  title: string | null;
  body: string | null;
  audience: "customers" | "staff" | "all";
  placement: "home_top" | "grid_widget";
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface Profile {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  role: UserRole;
  notifications_enabled: boolean;
  is_suspended: boolean;
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
  type: "topup" | "debit" | "refund" | "gift_send" | "gift_redeem" | "p2p_send" | "p2p_receive" | "adjustment";
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
  logo_url: string | null;
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
  sort_order: number;
  is_active: boolean;
  /** % of the customer amount the fulfilling provider charges us. 0 until an owner sets a real figure. */
  cost_percentage: number;
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
  user_id: string | null;
  guest_email?: string | null;
  guest_phone?: string | null;
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
  /** What we owe the fulfilling provider for this sale, snapshotted at transaction time. */
  provider_cost: number;
  /** amount - provider_cost, generated column. */
  revenue: number;
  /** Real-world org this was sold on behalf of (snapshot of services.provider_label). */
  owner_label: string | null;
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

export interface P2pTransfer {
  id: string;
  sender_id: string;
  receiver_id: string;
  amount: number;
  kind: "transfer" | "red_packet";
  note: string | null;
  created_at: string;
}

export interface ProfileLookup {
  id: string;
  full_name: string | null;
  phone: string | null;
}

export interface Conversation {
  id: string;
  user_a: string;
  user_b: string;
  last_message: string | null;
  last_message_at: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  kind: "text" | "image" | "p2p_transfer";
  body: string | null;
  image_url: string | null;
  p2p_transfer_id: string | null;
  created_at: string;
  // Joined in when kind === "p2p_transfer".
  p2p_transfer?: P2pTransfer | null;
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

export interface GuestCheckoutIntent {
  id: string;
  reference: string;
  service_id: string;
  network_id: string | null;
  recipient_identifier: string;
  extra_value: string | null;
  amount: number;
  fee: number;
  guest_email: string | null;
  guest_phone: string | null;
  provider: "paynow" | "stripe" | "ecocash";
  status: "pending" | "completed" | "failed";
  transaction_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export type DisputeStatus = "open" | "investigating" | "resolved" | "rejected";
export interface Dispute {
  id: string;
  raised_by: string | null;
  transaction_id: string | null;
  assigned_to: string | null;
  status: DisputeStatus;
  subject: string;
  description: string | null;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}
export interface DisputeMessage {
  id: string;
  dispute_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";
export type TicketPriority = "low" | "normal" | "high" | "urgent";
export interface SupportTicket {
  id: string;
  user_id: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}
export interface SupportTicketMessage {
  id: string;
  ticket_id: string;
  sender_id: string | null;
  body: string;
  created_at: string;
}

export type TaskStatus = "todo" | "in_progress" | "done" | "cancelled";
export interface AdminTask {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TicketPriority;
  assigned_to: string | null;
  created_by: string | null;
  related_table: string | null;
  related_id: string | null;
  due_at: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface TransactionEventRow {
  id: string;
  transaction_id: string | null;
  reference: string | null;
  event_type: string;
  message: string;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface AdminAuditLogRow {
  id: string;
  actor_id: string | null;
  action: string;
  target_table: string | null;
  target_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface IntegrationHealth {
  id: string;
  label: string;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_error: string | null;
  consecutive_failures: number;
  updated_at: string;
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
