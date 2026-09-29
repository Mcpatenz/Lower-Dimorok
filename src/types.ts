export type UserRole =
  | 'RESIDENT'
  | 'SECRETARY'
  | 'TREASURER'
  | 'CAPTAIN'
  | 'TANOD'
  | 'KAGAWAD';

export interface UserProfile {
  id: number;
  uid: string;
  email: string;
  username: string;
  role: UserRole;
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
  dateOfBirth: string;
  sex: string;
  civilStatus: string;
  purok: string;
  address: string;
  contactNumber: string;
  mfaEnabled: boolean;
  biometricEnabled: boolean;
  verified: boolean;
  onboardingCompleted: boolean;
  photoDataUrl?: string;
  createdAt: string;
}

export interface BarangaySettings {
  barangayName: string;
  municipality: string;
  province: string;
  contactNumber: string;
  emergencyHotline: string;
  gcashNumber: string;
  gcashAccountName: string;
  gcashQrCodeDataUrl: string;
  paymayaNumber?: string;
  paymayaAccountName?: string;
  paymayaQrCodeDataUrl?: string;
  updatedAt: string;
  updatedBy: string;
}

export interface BarangayOfficialMember {
  id: string;
  uid: string;
  fullName: string;
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  username: string;
  contactNumber: string;
  purok: string;
  role: 'CAPTAIN' | 'SECRETARY' | 'TREASURER' | 'TANOD' | 'KAGAWAD';
  committeeOrDesignation: string;
  status: 'ACTIVE' | 'ON_DUTY';
  appointedBy: string;
  appointedAt: string;
}

export interface BarangayService {
  id: number;
  code: string;
  name: string;
  office: string;
  fee: number;
  feeLabel: string;
  description: string;
  requirements: string; // JSON string array
  processSteps: string; // JSON string array
  statutoryCompliance: string;
  processingTime: string;
  active: boolean;
}

export interface ServiceRequestItem {
  id: number;
  referenceNumber: string;
  userUid: string;
  residentName: string;
  residentPurok: string;
  serviceCode: string;
  serviceName: string;
  office: string;
  purpose: string;
  additionalDetails: string;
  attachments: string;
  fee: number;
  paymentStatus: 'UNPAID' | 'PENDING' | 'PAID' | 'WAIVED' | 'REFUNDED';
  paymentReference: string;
  status:
    | 'SUBMITTED'
    | 'UNDER_REVIEW'
    | 'NEEDS_CORRECTION'
    | 'APPROVED'
    | 'READY_FOR_RELEASE'
    | 'COMPLETED'
    | 'REJECTED';
  rejectionReason: string;
  reviewerNotes: string;
  reviewedBy: string;
  submittedAt: string;
  updatedAt: string;
  reviewedAt?: string | null;
  completedAt?: string | null;
}

export interface IssuedDocument {
  id: number;
  referenceNumber: string;
  verificationCode: string;
  requestId: number;
  userUid: string;
  residentName: string;
  residentAddress: string;
  documentType: string;
  issuingOffice: string;
  signatory: string;
  purpose: string;
  status: 'VALID' | 'REVOKED' | 'EXPIRED';
  issuedAt: string;
  expiryDate?: string | null;
  expiresAt?: string | null;
  officialNotes?: string | null;
  officialNotesAuthor?: string | null;
  officialNotesUpdatedAt?: string | null;
}

export interface AnnouncementItem {
  id: number;
  title: string;
  category: string;
  summary: string;
  content: string;
  authorOffice: string;
  priority: 'NORMAL' | 'HIGH' | 'URGENT';
  publishedAt: string;
}

export interface NotificationItem {
  id: number;
  userUid: string;
  title: string;
  message: string;
  type: string;
  referenceNumber: string;
  isRead: boolean;
  createdAt: string;
}

export interface AuditLogItem {
  id: number;
  eventCode: string;
  actorUid: string;
  actorEmail: string;
  actorRole: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  description: string;
  ipAddress: string;
  metadata: string;
  createdAt: string;
}

export interface ExecutiveMetrics {
  totalRegisteredCitizens: number;
  activeDocumentVerifications: number;
  flaggedSecurityIncidents: number;
  pendingRequestsCount: number;
  totalFeesCollected: number;
}
