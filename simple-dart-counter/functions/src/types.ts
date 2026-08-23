import type { Timestamp } from 'firebase-admin/firestore';

export type TournamentStatus =
  | 'DRAFT'
  | 'REGISTRATION_OPEN'
  | 'REGISTRATION_CLOSED'
  | 'IN_PROGRESS'
  | 'FINISHED';

export type RegistrationStatus =
  | 'PENDING_PAYMENT'
  | 'CONFIRMED'
  | 'WAITLIST'
  | 'CANCELLED'
  | 'NO_SHOW';

export type PaymentMethod = 'QR' | 'CASH';

export interface TournamentMeta {
  name?: string;
  venue?: string;
  startsAt?: Timestamp | null;
  /** null / undefined / 0 = neomezená kapacita */
  capacity?: number | null;
  waitlistEnabled?: boolean;
  maxWaitlist?: number | null;
  registrationDeadline?: Timestamp | null;
}

export interface TournamentFinance {
  entryFee?: number | null;
  currency?: string;
  paymentMethods?: PaymentMethod[];
  payoutPercent?: number | null;
  addedSponsorMoney?: number | null;
  vsPrefix?: string;
  bankInfo?: {
    accountNumber?: string;
    bic?: string;
  };
}

export interface TournamentDocument {
  status: TournamentStatus;
  termsAndConditions?: string | null;
  meta?: TournamentMeta;
  finance?: TournamentFinance;
  admin: {
    ownerUid: string;
  };
  counters?: {
    confirmed?: number;
    waitlist?: number;
    pendingPayment?: number;
  };
}

export interface RegisterPlayerPayload {
  tournamentId: string;
  playerName: string;
  email?: string;
  phone?: string;
  csoRank?: number | null;
  /** Stabilní ČŠO ID (`cso:…`); null = rekreační hráč bez ČŠO ID. */
  csoPlayerId?: string | null;
  paymentMethod?: PaymentMethod | null;
  termsAccepted?: boolean;
}

export interface CreateManualRegistrationPayload {
  tournamentId: string;
  playerName: string;
  email?: string | null;
  phone?: string | null;
  csoRank?: number | string | null;
  csoPlayerId?: string | null;
  nameKey?: string | null;
  paymentMethod?: PaymentMethod | null;
  isPaid?: boolean;
  checkedIn?: boolean;
  duplicateOk?: boolean;
}

export interface CreateManualRegistrationResult {
  registrationId: string;
  status: 'CONFIRMED' | 'WAITLIST';
  variableSymbol: string;
}

export interface RegisterPlayerResult {
  success: true;
  registrationId: string;
  status: 'CONFIRMED' | 'WAITLIST';
  variableSymbol: string | null;
}

export type CancelledBy = 'PLAYER' | 'ADMIN';

export interface UnregisterPlayerPayload {
  tournamentId: string;
  registrationId: string;
}

export interface UnregisterPlayerResult {
  success: true;
  status: 'CANCELLED';
  refundDue: boolean;
  waitlistPromoted: boolean;
}
