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

export type CompetitionType = 'singles' | 'doubles' | 'mixed' | 'random_doubles';
export type FeeMode = 'pair' | 'split';
export type PairStatus =
  | 'NONE'
  | 'WAITING_PARTNER'
  | 'PENDING_INVITE'
  | 'CONFIRMED'
  | 'DECLINED'
  | 'BROKEN';
export type PlayerGender = 'M' | 'F';

export interface TournamentMeta {
  name?: string;
  venue?: string;
  startsAt?: Timestamp | null;
  /** null / undefined / 0 = neomezená kapacita */
  capacity?: number | null;
  waitlistEnabled?: boolean;
  maxWaitlist?: number | null;
  registrationDeadline?: Timestamp | null;
  competitionType?: CompetitionType;
  /** players = singles / random_doubles; teams = doubles / mixed */
  capacityUnit?: 'players' | 'teams';
}

export interface TournamentFinance {
  entryFee?: number | null;
  currency?: string;
  paymentMethods?: PaymentMethod[];
  payoutPercent?: number | null;
  addedSponsorMoney?: number | null;
  vsPrefix?: string;
  /** pair = jedno startovné / jeden VS; split = každý platí svůj podíl */
  feeMode?: FeeMode;
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
    confirmedTeams?: number;
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
  gender?: PlayerGender | null;
  partnerRegistrationId?: string;
  partnerName?: string;
}

export interface PairActionPayload {
  tournamentId: string;
  registrationId: string;
  partnerRegistrationId?: string;
}

export interface PairPublicView {
  status: PairStatus;
  partnerRegistrationId: string | null;
  partnerName: string | null;
  pendingName: string | null;
  initiatedBy: string | null;
  canConfirm: boolean;
  canDecline: boolean;
  canRequestPartner: boolean;
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
  source?: 'ADMIN_MANUAL' | 'ON_SITE';
  forceConfirmed?: boolean;
}

export interface CreateManualRegistrationResult {
  registrationId: string;
  status: 'CONFIRMED' | 'WAITLIST';
  variableSymbol: string;
}

export interface RegisterPlayerResult {
  success: true;
  registrationId: string;
  status: 'CONFIRMED' | 'WAITLIST' | 'PENDING_PAYMENT';
  variableSymbol: string | null;
  /** True = existující přihláška (admin / dřívější) přiřazená k Google účtu. */
  alreadyRegistered?: boolean;
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
