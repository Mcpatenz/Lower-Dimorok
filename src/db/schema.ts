import { boolean, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  username: text('username').notNull().default(''),
  role: text('role').notNull().default('RESIDENT'), // RESIDENT | SECRETARY | TREASURER | CAPTAIN
  firstName: text('first_name').notNull().default(''),
  middleName: text('middle_name').notNull().default(''),
  lastName: text('last_name').notNull().default(''),
  suffix: text('suffix').notNull().default(''),
  dateOfBirth: text('date_of_birth').notNull().default(''),
  sex: text('sex').notNull().default(''),
  civilStatus: text('civil_status').notNull().default(''),
  purok: text('purok').notNull().default('Purok 1 - Centro'),
  address: text('address').notNull().default('Barangay Lower Dimorok, Molave, Zamboanga del Sur'),
  contactNumber: text('contact_number').notNull().default(''),
  mfaEnabled: boolean('mfa_enabled').notNull().default(true),
  biometricEnabled: boolean('biometric_enabled').notNull().default(false),
  verified: boolean('verified').notNull().default(true),
  onboardingCompleted: boolean('onboarding_completed').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const services = pgTable('services', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  office: text('office').notNull(),
  fee: integer('fee').notNull().default(0),
  feeLabel: text('fee_label').notNull(),
  description: text('description').notNull(),
  requirements: text('requirements').notNull(), // JSON array of strings
  processSteps: text('process_steps').notNull(), // JSON array of strings
  statutoryCompliance: text('statutory_compliance').notNull().default(''),
  processingTime: text('processing_time').notNull().default('Same Day (2–4 Hours)'),
  active: boolean('active').notNull().default(true),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const serviceRequests = pgTable('service_requests', {
  id: serial('id').primaryKey(),
  referenceNumber: text('reference_number').notNull().unique(),
  userUid: text('user_uid').notNull(),
  residentName: text('resident_name').notNull(),
  residentPurok: text('resident_purok').notNull().default('Purok 1 - Centro'),
  serviceCode: text('service_code').notNull(),
  serviceName: text('service_name').notNull(),
  office: text('office').notNull(),
  purpose: text('purpose').notNull(),
  additionalDetails: text('additional_details').notNull().default('{}'), // JSON string
  attachments: text('attachments').notNull().default('[]'), // JSON string of uploaded doc names/types
  fee: integer('fee').notNull().default(0),
  paymentStatus: text('payment_status').notNull().default('UNPAID'), // UNPAID | PENDING | PAID | WAIVED | REFUNDED
  paymentReference: text('payment_reference').notNull().default(''),
  status: text('status').notNull().default('SUBMITTED'), // SUBMITTED | UNDER_REVIEW | NEEDS_CORRECTION | APPROVED | READY_FOR_RELEASE | COMPLETED | REJECTED
  rejectionReason: text('rejection_reason').notNull().default(''),
  reviewerNotes: text('reviewer_notes').notNull().default(''),
  reviewedBy: text('reviewed_by').notNull().default(''),
  submittedAt: timestamp('submitted_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  reviewedAt: timestamp('reviewed_at'),
  completedAt: timestamp('completed_at'),
});

export const documents = pgTable('documents', {
  id: serial('id').primaryKey(),
  referenceNumber: text('reference_number').notNull().unique(),
  verificationCode: text('verification_code').notNull().unique(),
  requestId: integer('request_id').notNull(),
  userUid: text('user_uid').notNull(),
  residentName: text('resident_name').notNull(),
  residentAddress: text('resident_address').notNull(),
  documentType: text('document_type').notNull(),
  issuingOffice: text('issuing_office').notNull(),
  signatory: text('signatory').notNull(),
  purpose: text('purpose').notNull(),
  status: text('status').notNull().default('VALID'), // VALID | REVOKED | EXPIRED
  issuedAt: timestamp('issued_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at'),
});

export const announcements = pgTable('announcements', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  category: text('category').notNull(), // Official Notice | Community Event | Emergency Notice | Public Service | Advisory | Barangay Updates
  summary: text('summary').notNull(),
  content: text('content').notNull(),
  authorOffice: text('author_office').notNull(),
  priority: text('priority').notNull().default('NORMAL'), // NORMAL | HIGH | URGENT
  publishedAt: timestamp('published_at').defaultNow().notNull(),
});

export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid').notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  type: text('type').notNull().default('STATUS_UPDATE'),
  referenceNumber: text('reference_number').notNull().default(''),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  eventCode: text('event_code').notNull(),
  actorUid: text('actor_uid').notNull().default('SYSTEM'),
  actorEmail: text('actor_email').notNull().default(''),
  actorRole: text('actor_role').notNull().default('RESIDENT'),
  severity: text('severity').notNull().default('INFO'), // INFO | WARNING | CRITICAL
  description: text('description').notNull(),
  ipAddress: text('ip_address').notNull().default('127.0.0.1'),
  metadata: text('metadata').notNull().default('{}'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
