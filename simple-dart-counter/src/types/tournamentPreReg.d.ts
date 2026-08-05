/**
 * Typy pro modul předregistrací (Fáze 1) — zrcadlí functions/src/types.ts
 * Kapacita / startovné / deadline: null = nedefinováno (neomezeno / bez poplatku / bez uzávěrky).
 */

/** @typedef {'DRAFT'|'REGISTRATION_OPEN'|'REGISTRATION_CLOSED'|'IN_PROGRESS'|'FINISHED'} TournamentStatus */
/** @typedef {'PENDING_PAYMENT'|'CONFIRMED'|'WAITLIST'|'CANCELLED'|'NO_SHOW'} RegistrationStatus */
/** @typedef {'QR'|'CASH'} PaymentMethod */

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
 * @property {{ confirmed?: number, waitlist?: number, pendingPayment?: number }} [counters]
 */

/**
 * @typedef {Object} RegistrationDocument
 * @property {string} id
 * @property {{ name: string, email: string|null, phone: string|null, csoRank: number|null }} player
 * @property {RegistrationStatus} status
 * @property {{ method: PaymentMethod|null, variableSymbol: string|null, amount: number|null, isPaid: boolean, verifiedByAdmin: boolean }} payment
 * @property {{ checkedIn: boolean }} attendance
 * @property {import('firebase/firestore').Timestamp} [termsAcceptedAt]
 * @property {'PUBLIC'|'ADMIN_MANUAL'} source
 */

export {};
