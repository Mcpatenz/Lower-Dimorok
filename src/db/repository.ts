import { desc, eq, or, sql } from 'drizzle-orm';
import { db } from './index.ts';
import {
  announcements,
  auditLogs,
  documents,
  notifications,
  serviceRequests,
  services,
  users,
} from './schema.ts';

export async function getOrCreateUser(
  uid: string,
  email: string,
  defaults?: {
    firstName?: string;
    lastName?: string;
    username?: string;
    role?: string;
  }
) {
  try {
    const existing = await db.select().from(users).where(eq(users.uid, uid));
    if (existing.length > 0) {
      return existing[0];
    }

    const nameParts = (defaults?.firstName || email.split('@')[0] || 'Resident').split(' ');
    const firstName = defaults?.firstName || nameParts[0] || 'Resident';
    const lastName = defaults?.lastName || nameParts.slice(1).join(' ') || 'Citizen';
    const username = defaults?.username || email.split('@')[0] || `user_${Date.now()}`;

    const result = await db
      .insert(users)
      .values({
        uid,
        email,
        username,
        firstName,
        lastName,
        role: defaults?.role || 'RESIDENT',
        purok: 'Purok 1 - Centro',
        address: 'Purok 1 - Centro, Barangay Lower Dimorok, Molave, Zamboanga del Sur',
        verified: true,
        onboardingCompleted: false,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: { email, updatedAt: new Date() },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database query failed in getOrCreateUser:', error);
    throw new Error('Failed to synchronize user profile.', { cause: error });
  }
}

export async function getUserByUid(uid: string) {
  try {
    const rows = await db.select().from(users).where(eq(users.uid, uid));
    return rows[0] || null;
  } catch (error) {
    console.error('Database query failed in getUserByUid:', error);
    throw new Error('Failed to retrieve user record.', { cause: error });
  }
}

export async function registerResidentProfile(
  uid: string,
  payload: {
    firstName: string;
    middleName?: string;
    lastName: string;
    suffix?: string;
    dateOfBirth?: string;
    sex?: string;
    civilStatus?: string;
    purok?: string;
    address?: string;
    contactNumber?: string;
    email?: string;
    username?: string;
    role?: string;
    mfaEnabled?: boolean;
    biometricEnabled?: boolean;
    onboardingCompleted?: boolean;
  }
) {
  try {
    const existingRows = await db.select().from(users).where(eq(users.uid, uid));
    const existing = existingRows[0] || null;

    const preservedRole = payload.role || existing?.role || 'RESIDENT';
    const cleanEmail = (payload.email || existing?.email || `${uid}@dimorok.gov.ph`).trim();
    const cleanUsername = (
      payload.username ||
      existing?.username ||
      cleanEmail.split('@')[0] ||
      `user_${Date.now()}`
    ).trim();
    const cleanPurok = payload.purok || existing?.purok || 'Purok 1 - Centro';
    const cleanAddress =
      payload.address ||
      existing?.address ||
      `${cleanPurok}, Barangay Lower Dimorok, Molave, Zamboanga del Sur`;

    const result = await db
      .insert(users)
      .values({
        uid,
        email: cleanEmail,
        username: cleanUsername,
        role: preservedRole,
        firstName: payload.firstName?.trim() || existing?.firstName || 'Resident',
        middleName: (payload.middleName ?? existing?.middleName ?? '').trim(),
        lastName: payload.lastName?.trim() || existing?.lastName || 'Citizen',
        suffix: (payload.suffix ?? existing?.suffix ?? '').trim(),
        dateOfBirth: payload.dateOfBirth || existing?.dateOfBirth || '1995-01-01',
        sex: payload.sex || existing?.sex || 'Male',
        civilStatus: payload.civilStatus || existing?.civilStatus || 'Single',
        purok: cleanPurok,
        address: cleanAddress,
        contactNumber: payload.contactNumber || existing?.contactNumber || '+63 917 000 0000',
        mfaEnabled: payload.mfaEnabled ?? existing?.mfaEnabled ?? true,
        biometricEnabled: payload.biometricEnabled ?? existing?.biometricEnabled ?? false,
        verified: true,
        onboardingCompleted: payload.onboardingCompleted ?? true,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: cleanEmail,
          username: cleanUsername,
          role: preservedRole,
          firstName: payload.firstName?.trim() || existing?.firstName || 'Resident',
          middleName: (payload.middleName ?? existing?.middleName ?? '').trim(),
          lastName: payload.lastName?.trim() || existing?.lastName || 'Citizen',
          suffix: (payload.suffix ?? existing?.suffix ?? '').trim(),
          dateOfBirth: payload.dateOfBirth || existing?.dateOfBirth || '1995-01-01',
          sex: payload.sex || existing?.sex || 'Male',
          civilStatus: payload.civilStatus || existing?.civilStatus || 'Single',
          purok: cleanPurok,
          address: cleanAddress,
          contactNumber: payload.contactNumber || existing?.contactNumber || '+63 917 000 0000',
          mfaEnabled: payload.mfaEnabled ?? existing?.mfaEnabled ?? true,
          biometricEnabled: payload.biometricEnabled ?? existing?.biometricEnabled ?? false,
          onboardingCompleted: true,
          updatedAt: new Date(),
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database query failed in registerResidentProfile:', error);
    throw new Error('Failed to save user profile.', { cause: error });
  }
}

export async function updateUserRoleOrSecurity(
  uid: string,
  updates: {
    role?: string;
    mfaEnabled?: boolean;
    biometricEnabled?: boolean;
    onboardingCompleted?: boolean;
  }
) {
  try {
    const result = await db
      .update(users)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(users.uid, uid))
      .returning();
    return result[0];
  } catch (error) {
    console.error('Database query failed in updateUserRoleOrSecurity:', error);
    throw new Error('Failed to update account settings.', { cause: error });
  }
}

export async function getAllUsers() {
  try {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  } catch (error) {
    console.error('Database query failed in getAllUsers:', error);
    throw new Error('Failed to fetch barangay citizens list.', { cause: error });
  }
}

export async function createOrUpdateBarangayOfficial(payload: {
  uid?: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  suffix?: string;
  email: string;
  username?: string;
  contactNumber?: string;
  purok?: string;
  role: 'SECRETARY' | 'TREASURER' | 'TANOD' | 'KAGAWAD' | 'CAPTAIN' | 'RESIDENT';
}) {
  try {
    const cleanEmail = payload.email.trim().toLowerCase();
    const generatedUid =
      payload.uid ||
      `official-${payload.role.toLowerCase()}-${Date.now().toString(36)}`;
    const username =
      payload.username?.trim() ||
      cleanEmail.split('@')[0] ||
      `${payload.firstName.toLowerCase()}.${payload.lastName.toLowerCase()}`;
    const purok = payload.purok || 'Purok 1 - Centro';

    const result = await db
      .insert(users)
      .values({
        uid: generatedUid,
        email: cleanEmail,
        username,
        role: payload.role,
        firstName: payload.firstName.trim(),
        middleName: (payload.middleName || '').trim(),
        lastName: payload.lastName.trim(),
        suffix: (payload.suffix || '').trim(),
        purok,
        address: `${purok}, Barangay Lower Dimorok, Molave, Zamboanga del Sur`,
        contactNumber: payload.contactNumber || '+63 917 550 0911',
        mfaEnabled: true,
        biometricEnabled: true,
        verified: true,
        onboardingCompleted: true,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          role: payload.role,
          firstName: payload.firstName.trim(),
          middleName: (payload.middleName || '').trim(),
          lastName: payload.lastName.trim(),
          email: cleanEmail,
          username,
          contactNumber: payload.contactNumber || '+63 917 550 0911',
          purok,
          updatedAt: new Date(),
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database query failed in createOrUpdateBarangayOfficial:', error);
    throw new Error('Failed to create or update barangay official.', { cause: error });
  }
}

export async function getServicesList() {
  try {
    return await db.select().from(services).orderBy(services.id);
  } catch (error) {
    console.error('Database query failed in getServicesList:', error);
    throw new Error('Failed to fetch barangay services.', { cause: error });
  }
}

export async function updateServiceFeeConfig(code: string, fee: number, feeLabel: string) {
  try {
    const result = await db
      .update(services)
      .set({ fee, feeLabel, updatedAt: new Date() })
      .where(eq(services.code, code))
      .returning();
    return result[0];
  } catch (error) {
    console.error('Database query failed in updateServiceFeeConfig:', error);
    throw new Error('Failed to update service fee.', { cause: error });
  }
}

export async function getServiceRequestsList(filterUid?: string) {
  try {
    if (filterUid) {
      return await db
        .select()
        .from(serviceRequests)
        .where(eq(serviceRequests.userUid, filterUid))
        .orderBy(desc(serviceRequests.submittedAt));
    }
    return await db.select().from(serviceRequests).orderBy(desc(serviceRequests.submittedAt));
  } catch (error) {
    console.error('Database query failed in getServiceRequestsList:', error);
    throw new Error('Failed to load service requests.', { cause: error });
  }
}

export async function createNewServiceRequest(payload: {
  userUid: string;
  residentName: string;
  residentPurok: string;
  serviceCode: string;
  serviceName: string;
  office: string;
  purpose: string;
  additionalDetails: Record<string, string>;
  attachments: string[];
  fee: number;
}) {
  try {
    const countRows = await db.select({ count: sql<number>`count(*)` }).from(serviceRequests);
    const seq = Number(countRows[0]?.count || 0) + 125;
    const referenceNumber = `BD-2026-${String(seq).padStart(6, '0')}`;
    const paymentStatus = payload.fee === 0 ? 'WAIVED' : 'PENDING';
    const paymentReference = payload.fee === 0 ? 'STATUTORY-FREE-2026' : `BILL-${referenceNumber}`;

    const inserted = await db
      .insert(serviceRequests)
      .values({
        referenceNumber,
        userUid: payload.userUid,
        residentName: payload.residentName,
        residentPurok: payload.residentPurok,
        serviceCode: payload.serviceCode,
        serviceName: payload.serviceName,
        office: payload.office,
        purpose: payload.purpose,
        additionalDetails: JSON.stringify(payload.additionalDetails || {}),
        attachments: JSON.stringify(payload.attachments || []),
        fee: payload.fee,
        paymentStatus,
        paymentReference,
        status: 'SUBMITTED',
      })
      .returning();

    const reqRecord = inserted[0];

    await db.insert(notifications).values({
      userUid: payload.userUid,
      title: `Request Received (${referenceNumber})`,
      message: `Your ${payload.serviceName} application has been submitted to the ${payload.office}.`,
      type: 'REQUEST_SUBMITTED',
      referenceNumber,
      isRead: false,
    });

    return reqRecord;
  } catch (error) {
    console.error('Database query failed in createNewServiceRequest:', error);
    throw new Error('Failed to submit service request.', { cause: error });
  }
}

export async function updateRequestStatusAndIssueDoc(
  requestId: number,
  updates: {
    status: string;
    rejectionReason?: string;
    reviewerNotes?: string;
    reviewedBy: string;
    paymentStatus?: string;
    paymentReference?: string;
  }
) {
  try {
    const existingRows = await db
      .select()
      .from(serviceRequests)
      .where(eq(serviceRequests.id, requestId));
    const current = existingRows[0];
    if (!current) {
      throw new Error('Service request not found.');
    }

    const now = new Date();
    const isTerminal = updates.status === 'APPROVED' || updates.status === 'READY_FOR_RELEASE' || updates.status === 'COMPLETED';

    const updatedRows = await db
      .update(serviceRequests)
      .set({
        status: updates.status,
        rejectionReason: updates.rejectionReason ?? current.rejectionReason,
        reviewerNotes: updates.reviewerNotes ?? current.reviewerNotes,
        reviewedBy: updates.reviewedBy,
        paymentStatus: updates.paymentStatus ?? (isTerminal && current.fee > 0 ? 'PAID' : current.paymentStatus),
        paymentReference:
          updates.paymentReference ??
          (isTerminal && current.fee > 0 && !current.paymentReference.startsWith('OR-')
            ? `OR-2026-${Math.floor(10000 + Math.random() * 89999)}`
            : current.paymentReference),
        updatedAt: now,
        reviewedAt: now,
        completedAt: updates.status === 'COMPLETED' || updates.status === 'APPROVED' ? now : current.completedAt,
      })
      .where(eq(serviceRequests.id, requestId))
      .returning();

    const updated = updatedRows[0];

    if (updates.status === 'APPROVED' || updates.status === 'READY_FOR_RELEASE' || updates.status === 'COMPLETED') {
      const existingDoc = await db
        .select()
        .from(documents)
        .where(eq(documents.referenceNumber, updated.referenceNumber));

      if (existingDoc.length === 0) {
        const suffixHash = Math.random().toString(16).substring(2, 6).toUpperCase();
        const verificationCode = `DGV-LD-${updated.referenceNumber.replace('BD-', '')}-${suffixHash}`;
        const expiresAt = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);

        await db.insert(documents).values({
          referenceNumber: updated.referenceNumber,
          verificationCode,
          requestId: updated.id,
          userUid: updated.userUid,
          residentName: updated.residentName,
          residentAddress: `${updated.residentPurok}, Barangay Lower Dimorok, Molave, Zamboanga del Sur`,
          documentType: updated.serviceName,
          issuingOffice: updated.office,
          signatory: 'Hon. Rodrigo A. Balimbingan Sr. — Punong Barangay',
          purpose: updated.purpose,
          status: 'VALID',
          issuedAt: now,
          expiresAt,
        });
      }
    }

    const statusLabelMap: Record<string, string> = {
      SUBMITTED: 'Submitted',
      UNDER_REVIEW: 'Under Review',
      NEEDS_CORRECTION: 'Needs Correction',
      APPROVED: 'Approved & Digitally Signed',
      READY_FOR_RELEASE: 'Ready for Release',
      COMPLETED: 'Completed',
      REJECTED: 'Rejected',
    };

    await db.insert(notifications).values({
      userUid: updated.userUid,
      title: `${updated.serviceName}: ${statusLabelMap[updates.status] || updates.status}`,
      message:
        updates.status === 'REJECTED'
          ? `Application ${updated.referenceNumber} was rejected. Reason: ${updates.rejectionReason || 'Incomplete requirements'}.`
          : `Application ${updated.referenceNumber} status updated to ${statusLabelMap[updates.status] || updates.status}. ${updates.reviewerNotes || ''}`,
      type: 'STATUS_UPDATE',
      referenceNumber: updated.referenceNumber,
      isRead: false,
    });

    return updated;
  } catch (error) {
    console.error('Database query failed in updateRequestStatusAndIssueDoc:', error);
    throw new Error('Failed to update application status.', { cause: error });
  }
}

export async function getDocumentsList(filterUid?: string) {
  try {
    const rows = filterUid
      ? await db
          .select()
          .from(documents)
          .where(eq(documents.userUid, filterUid))
          .orderBy(desc(documents.issuedAt))
      : await db.select().from(documents).orderBy(desc(documents.issuedAt));

    return rows.map((doc) => ({
      ...doc,
      expiryDate: doc.expiresAt
        ? new Date(doc.expiresAt).toISOString()
        : new Date(new Date(doc.issuedAt).getTime() + 180 * 24 * 60 * 60 * 1000).toISOString(),
    }));
  } catch (error) {
    console.error('Database query failed in getDocumentsList:', error);
    throw new Error('Failed to fetch issued documents.', { cause: error });
  }
}

export async function verifyDocumentByReference(queryCode: string) {
  try {
    const clean = queryCode.trim().toUpperCase();
    const rows = await db
      .select()
      .from(documents)
      .where(or(eq(documents.referenceNumber, clean), eq(documents.verificationCode, clean)));

    if (rows.length === 0) {
      return { outcome: 'NOT_FOUND' as const, document: null };
    }

    const doc = rows[0];
    const maskedName = doc.residentName
      .split(' ')
      .map((part, idx, arr) => (idx === 0 || idx === arr.length - 1 ? part : `${part[0]}.`))
      .join(' ');

    const computedExpiry = doc.expiresAt
      ? new Date(doc.expiresAt).toISOString()
      : new Date(new Date(doc.issuedAt).getTime() + 180 * 24 * 60 * 60 * 1000).toISOString();

    return {
      outcome: doc.status === 'REVOKED' ? ('REVOKED' as const) : ('VERIFIED' as const),
      document: {
        referenceNumber: doc.referenceNumber,
        verificationCode: doc.verificationCode,
        documentType: doc.documentType,
        holderInitialsName: maskedName,
        issuingOffice: doc.issuingOffice,
        signatory: doc.signatory,
        purpose: doc.purpose,
        status: doc.status,
        issuedAt: doc.issuedAt,
        expiryDate: computedExpiry,
        expiresAt: computedExpiry,
        barangay: 'Barangay Lower Dimorok, Municipality of Molave, Zamboanga del Sur',
      },
    };
  } catch (error) {
    console.error('Database query failed in verifyDocumentByReference:', error);
    throw new Error('Document verification lookup failed.', { cause: error });
  }
}

export async function updateDocumentStatus(docId: number, status: 'VALID' | 'REVOKED') {
  try {
    const rows = await db
      .update(documents)
      .set({ status })
      .where(eq(documents.id, docId))
      .returning();
    return rows[0];
  } catch (error) {
    console.error('Database query failed in updateDocumentStatus:', error);
    throw new Error('Failed to update document status.', { cause: error });
  }
}

export async function getAnnouncementsList() {
  try {
    return await db.select().from(announcements).orderBy(desc(announcements.publishedAt));
  } catch (error) {
    console.error('Database query failed in getAnnouncementsList:', error);
    throw new Error('Failed to load barangay announcements.', { cause: error });
  }
}

export async function createNewAnnouncement(payload: {
  title: string;
  category: string;
  summary: string;
  content: string;
  authorOffice: string;
  priority: string;
}) {
  try {
    const rows = await db
      .insert(announcements)
      .values({
        title: payload.title,
        category: payload.category,
        summary: payload.summary,
        content: payload.content,
        authorOffice: payload.authorOffice,
        priority: payload.priority,
      })
      .returning();
    return rows[0];
  } catch (error) {
    console.error('Database query failed in createNewAnnouncement:', error);
    throw new Error('Failed to publish announcement.', { cause: error });
  }
}

export async function getNotificationsForUser(userUid: string) {
  try {
    return await db
      .select()
      .from(notifications)
      .where(eq(notifications.userUid, userUid))
      .orderBy(desc(notifications.createdAt));
  } catch (error) {
    console.error('Database query failed in getNotificationsForUser:', error);
    throw new Error('Failed to load notifications.', { cause: error });
  }
}

export async function markAllUserNotificationsRead(userUid: string) {
  try {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.userUid, userUid));
    return { success: true };
  } catch (error) {
    console.error('Database query failed in markAllUserNotificationsRead:', error);
    throw new Error('Failed to update notifications.', { cause: error });
  }
}

export async function recordAuditLog(entry: {
  eventCode: string;
  actorUid: string;
  actorEmail?: string;
  actorRole?: string;
  severity?: 'INFO' | 'WARNING' | 'CRITICAL';
  description: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    const rows = await db
      .insert(auditLogs)
      .values({
        eventCode: entry.eventCode,
        actorUid: entry.actorUid || 'SYSTEM',
        actorEmail: entry.actorEmail || '',
        actorRole: entry.actorRole || 'RESIDENT',
        severity: entry.severity || 'INFO',
        description: entry.description,
        ipAddress: entry.ipAddress || '127.0.0.1',
        metadata: JSON.stringify(entry.metadata || {}),
      })
      .returning();
    return rows[0];
  } catch (error) {
    console.error('Database query failed in recordAuditLog:', error);
    return null;
  }
}

export async function getAuditLogsList() {
  try {
    return await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(60);
  } catch (error) {
    console.error('Database query failed in getAuditLogsList:', error);
    throw new Error('Failed to fetch security audit logs.', { cause: error });
  }
}

export async function getExecutiveDashboardSummary() {
  try {
    const allUsers = await db.select().from(users);
    const allDocs = await db.select().from(documents);
    const allReqs = await db.select().from(serviceRequests);
    const allAudits = await db.select().from(auditLogs);

    const totalRegisteredCitizens = allUsers.length;
    const activeDocumentVerifications = allDocs.filter((d) => d.status === 'VALID').length;
    const flaggedSecurityIncidents = allAudits.filter(
      (a) => a.severity === 'CRITICAL' || a.severity === 'WARNING' || a.eventCode === 'ER_DETECT_TAMPER'
    ).length;

    const pendingRequestsCount = allReqs.filter(
      (r) => r.status === 'SUBMITTED' || r.status === 'UNDER_REVIEW'
    ).length;

    const totalFeesCollected = allReqs
      .filter((r) => r.paymentStatus === 'PAID')
      .reduce((acc, item) => acc + (item.fee || 0), 0);

    return {
      totalRegisteredCitizens,
      activeDocumentVerifications,
      flaggedSecurityIncidents,
      pendingRequestsCount,
      totalFeesCollected,
    };
  } catch (error) {
    console.error('Database query failed in getExecutiveDashboardSummary:', error);
    throw new Error('Failed to compute executive dashboard metrics.', { cause: error });
  }
}
