/**
 * Typy pro modul předregistrací (Fáze 1) — zrcadlí functions/src/types.ts
 * Kapacita / startovné / deadline: null = nedefinováno (neomezeno / bez poplatku / bez uzávěrky).
 */

/** @typedef {'DRAFT'|'REGISTRATION_OPEN'|'REGISTRATION_CLOSED'|'IN_PROGRESS'|'FINISHED'} TournamentStatus */
/** @typedef {'PENDING_PAYMENT'|'CONFIRMED'|'WAITLIST'|'CANCELLED'|'NO_SHOW'} RegistrationStatus */
/** @typedef {'QR'|'CASH'} PaymentMethod */
/** @typedef {'singles'|'doubles'|'mixed'|'random_doubles'} CompetitionType */
/** @typedef {'pair'|'split'} FeeMode */
/** @typedef {'NONE'|'WAITING_PARTNER'|'PENDING_INVITE'|'CONFIRMED'|'DECLINED'|'BROKEN'} PairStatus */
/** @typedef {'M'|'F'} PlayerGender */

/**
 * @typedef {Object} TournamentLocation
 * @property {string|null} [city]
 * @property {string|null} [venueName]
 * @property {string|null} [region]
 */

/**
 * @typedef {Object} TournamentMeta
 * @property {string} [name]
 * @property {string} [venue]
 * @property {TournamentLocation} [location]
 * @property {import('firebase/firestore').Timestamp|null} [startsAt]
 * @property {number|null} [capacity] null/0 = neomezeno
 * @property {boolean} [waitlistEnabled]
 * @property {number|null} [maxWaitlist]
 * @property {import('firebase/firestore').Timestamp|null} [registrationDeadline]
 * @property {CompetitionType} [competitionType]
 * @property {'players'|'teams'} [capacityUnit]
 */

/**
 * @typedef {Object} TournamentVisibility
 * @property {boolean} [isPublic]
 */

/**
 * @typedef {Object} TournamentFinance
 * @property {number|null} [entryFee]
 * @property {string} [currency]
 * @property {PaymentMethod[]} [paymentMethods]
 * @property {number|null} [payoutPercent]
 * @property {number|null} [addedSponsorMoney]
 * @property {string} [vsPrefix]
 * @property {FeeMode} [feeMode]
 * @property {{ accountNumber?: string, bic?: string }} [bankInfo]
 */

/**
 * @typedef {Object} TournamentPreRegDocument
 * @property {TournamentStatus} status
 * @property {string|null} [termsAndConditions]
 * @property {TournamentMeta} [meta]
 * @property {TournamentFinance} [finance]
 * @property {TournamentVisibility} [visibility]
 * @property {{ ownerUid: string }} admin
 * @property {{ confirmed?: number, waitlist?: number, pendingPayment?: number, confirmedTeams?: number }} [counters]
 */

/**
 * @typedef {Object} RegistrationDocument
 * @property {string} id
 * @property {{ name: string, email: string|null, phone: string|null, csoRank: number|null, csoPlayerId?: string|null, nameKey?: string|null, gender?: PlayerGender|null }} player
 * @property {RegistrationStatus} status
 * @property {{ status?: PairStatus, partnerRegistrationId?: string|null, partnerName?: string|null, pendingName?: string|null, initiatedBy?: string|null }} [pair]
 * @property {{ method: PaymentMethod|null, variableSymbol: string|null, amount: number|null, isPaid: boolean, verifiedByAdmin: boolean, refundDue?: boolean, refundedAt?: import('firebase/firestore').Timestamp|null }} payment
 * @property {{ checkedIn: boolean }} attendance
 * @property {import('firebase/firestore').Timestamp} [termsAcceptedAt]
 * @property {'PUBLIC'|'ADMIN_MANUAL'} source
 * @property {'PLAYER'|'ADMIN'|null} [cancelledBy]
 * @property {import('firebase/firestore').Timestamp} [cancelledAt]
 */

export {};
