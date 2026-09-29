import express from 'express';
import { createServer as createViteServer } from 'vite';
import * as dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import {
  AuthRequest,
  requireAuth,
  requireOfficialRole,
  wafTamperGuard,
} from './src/middleware/auth.ts';
import {
  createNewAnnouncement,
  createNewServiceRequest,
  createOrUpdateBarangayOfficial,
  getAllUsers,
  getAnnouncementsList,
  getAuditLogsList,
  getDocumentsList,
  getExecutiveDashboardSummary,
  getNotificationsForUser,
  getOrCreateUser,
  getServiceRequestsList,
  getServicesList,
  getUserByUid,
  markAllUserNotificationsRead,
  recordAuditLog,
  registerResidentProfile,
  updateDocumentStatus,
  updateRequestStatusAndIssueDoc,
  updateServiceFeeConfig,
  updateUserRoleOrSecurity,
  verifyDocumentByReference,
} from './src/db/repository.ts';

dotenv.config();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

const LOWER_DIMOROK_KNOWLEDGE_BASE = `
OFFICIAL CIVIC KNOWLEDGE BASE — BARANGAY LOWER DIMOROK
Location: Barangay Lower Dimorok, Municipality of Molave, Province of Zamboanga del Sur, Region IX (Zamboanga Peninsula), Philippines.
Office Hours: Monday to Friday, 8:00 AM to 5:00 PM (No Noon Break for Frontline Services pursuant to RA 11032 Anti-Red Tape Act). Emergency & BDRRMC Desk: 24/7.
Punong Barangay (Barangay Captain): Hon. Rodrigo A. Balimbingan Sr.
Barangay Secretary: Ms. Marites L. Cabrera

AUTHORIZED SERVICE DIRECTORY & DOCUMENT MATRIX:
1. Barangay Clearance
   - Responsible Office: Barangay Secretary
   - Standard Processing Fee: PHP 50.00
   - Requirements: Valid Government-Issued ID or Voter Certification, Purok Leader Endorsement Slip, Community Tax Certificate (Cedula) for current year.
   - Turnaround Time: Same Day (1–2 Hours)

2. Certificate of Residency
   - Responsible Office: Barangay Secretary
   - Standard Processing Fee: PHP 50.00
   - Requirements: Valid ID showing Lower Dimorok address or Purok Certification, Proof of billing or Registry of Barangay Inhabitants (RBI) record.
   - Turnaround Time: Same Day (1–2 Hours)

3. Barangay Indigency Certificate
   - Responsible Authority: Social Services / Barangay Captain
   - Standard Processing Fee: FREE / WAIVED (PHP 0.00)
   - Requirements: Valid ID or Voter Certification, Purok Leader Certification of Household Income Status, Supporting medical abstract, hospital bill, or scholarship form.
   - Turnaround Time: Same Day (Under 1 Hour)

4. Business Permit Endorsement
   - Responsible Office: Barangay Licensing Division
   - Standard Processing Fee: PHP 150.00
   - Requirements: DTI Business Name Registration or SEC Certificate, Contract of Lease or Tax Declaration, Community Tax Certificate (Cedula), Previous Barangay Clearance (if renewal).
   - Turnaround Time: 1 Business Day

5. First-Time Job Seeker Certificate (RA 11261 Compliance)
   - Responsible Office: Barangay Secretary
   - Standard Processing Fee: FREE / STATUTORY (PHP 0.00 under Republic Act No. 11261)
   - Requirements: Valid School ID or Government ID, Signed Oath of Undertaking (RA 11261 Form), At least 6 months residency in Barangay Lower Dimorok.
   - Turnaround Time: Same Day (1–2 Hours)

APPLICATION WORKFLOW & STATUS DEFINITIONS:
- SUBMITTED: Application received with a unique BD-2026-XXXXXX reference number.
- UNDER_REVIEW: Barangay Secretary or Licensing Division is verifying RBI / Lupon records.
- NEEDS_CORRECTION: Missing attachment or discrepancy requiring resident update.
- APPROVED: Signed by Punong Barangay and QR-verified digital document generated.
- READY_FOR_RELEASE: Physical stamped copy available for pickup at Barangay Hall if needed.
- COMPLETED: Released and archived.
- REJECTED: Application declined with explicit reason.
`;

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '2mb' }));
  app.use('/api', wafTamperGuard);

  // 1. Auth & Current Resident/Official Profile
  app.get('/api/auth/me', requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = await getUserByUid(req.user!.uid);
      res.json({ user });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to load profile' });
    }
  });

  app.post('/api/residents/profile', requireAuth, async (req: AuthRequest, res) => {
    try {
      const targetUid = req.body.targetUid || req.user!.uid;
      const updated = await registerResidentProfile(targetUid, {
        ...req.body,
        email: req.body.email || req.user!.email,
      });
      await recordAuditLog({
        eventCode: 'PROFILE_UPDATED',
        actorUid: req.user!.uid,
        actorEmail: req.user!.email,
        actorRole: updated.role,
        severity: 'INFO',
        description: `Profile updated for ${updated.firstName} ${updated.lastName} (${updated.role} · ${updated.purok}).`,
      });
      res.json({ user: updated });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to update user profile' });
    }
  });

  app.patch('/api/auth/security', requireAuth, async (req: AuthRequest, res) => {
    try {
      const {
        role,
        mfaEnabled,
        biometricEnabled,
        onboardingCompleted,
        credentialId,
        authenticatorMode,
        webAuthnAction,
        failureReason,
      } = req.body;
      const securityUpdates: {
        role?: string;
        mfaEnabled?: boolean;
        biometricEnabled?: boolean;
        onboardingCompleted?: boolean;
      } = {};
      if (role !== undefined) securityUpdates.role = role;
      if (mfaEnabled !== undefined) securityUpdates.mfaEnabled = mfaEnabled;
      if (biometricEnabled !== undefined) securityUpdates.biometricEnabled = biometricEnabled;
      if (onboardingCompleted !== undefined) securityUpdates.onboardingCompleted = onboardingCompleted;

      const updated =
        Object.keys(securityUpdates).length > 0
          ? await updateUserRoleOrSecurity(req.user!.uid, securityUpdates)
          : (await getUserByUid(req.user!.uid))!;

      const isWebAuthnEvent = Boolean(credentialId || webAuthnAction || biometricEnabled !== undefined);
      const isFailure = webAuthnAction === 'FAILURE';

      await recordAuditLog({
        eventCode: role
          ? 'RBAC_ROLE_SWITCHED'
          : isFailure
          ? 'WEBAUTHN_AUTH_FAILED'
          : webAuthnAction === 'ASSERTION'
          ? 'WEBAUTHN_BIOMETRIC_AUTH'
          : isWebAuthnEvent
          ? 'WEBAUTHN_PASSKEY_ENROLLED'
          : 'AUTH_MFA_SUCCESS',
        actorUid: req.user!.uid,
        actorEmail: req.user!.email,
        actorRole: updated?.role || req.user!.role,
        severity: isFailure ? 'WARNING' : 'INFO',
        description: isFailure
          ? `Rejected WebAuthn biometric sign-in attempt (Credential ID: ${credentialId || 'unknown'}) for ${updated?.firstName || 'Resident'} ${updated?.lastName || ''}. Reason: ${failureReason || 'NotAllowedError: Passkey assertion rejected'}.`
          : credentialId
          ? `WebAuthn biometric ${webAuthnAction === 'ASSERTION' ? 'sign-in assertion' : 'passkey enrollment'} verified (Credential ID: ${credentialId}) for ${updated?.firstName || 'Resident'} ${updated?.lastName || ''}.`
          : `Updated security/role preferences for ${updated?.email || req.user!.email} (Active Role: ${updated?.role || req.user!.role}).`,
        metadata: credentialId
          ? {
              credentialId,
              authenticatorMode: authenticatorMode || 'WebAuthn Platform Biometric (FIDO2)',
              webAuthnAction: webAuthnAction || 'ENROLLMENT',
              residentName: `${updated?.firstName || ''} ${updated?.lastName || ''}`.trim() || req.user!.email,
              ...(failureReason ? { failureReason } : {}),
            }
          : {},
      });
      res.json({ user: updated });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to update security settings' });
    }
  });

  // 2. Services Directory & Admin Fee Config
  app.get('/api/services', async (_req, res) => {
    try {
      const list = await getServicesList();
      res.json({ services: list });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to load services' });
    }
  });

  app.patch(
    '/api/services/:code',
    requireAuth,
    requireOfficialRole(['SECRETARY', 'TREASURER', 'CAPTAIN']),
    async (req: AuthRequest, res) => {
      try {
        const { fee, feeLabel } = req.body;
        const updated = await updateServiceFeeConfig(req.params.code, Number(fee), feeLabel);
        await recordAuditLog({
          eventCode: 'SERVICE_FEE_UPDATED',
          actorUid: req.user!.uid,
          actorEmail: req.user!.email,
          actorRole: req.user!.role,
          severity: 'INFO',
          description: `Updated standard fee for ${req.params.code} to ${feeLabel}`,
        });
        res.json({ service: updated });
      } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to update service fee' });
      }
    }
  );

  // 3. Service Requests
  app.get('/api/service-requests', requireAuth, async (req: AuthRequest, res) => {
    try {
      const scope = req.query.scope as string | undefined;
      const isOfficial = ['SECRETARY', 'TREASURER', 'CAPTAIN', 'TANOD', 'KAGAWAD'].includes(
        req.user!.role
      );
      const list = await getServiceRequestsList(scope === 'all' && isOfficial ? undefined : req.user!.uid);
      res.json({ requests: list });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to load service requests' });
    }
  });

  app.post('/api/service-requests', requireAuth, async (req: AuthRequest, res) => {
    try {
      const {
        residentName,
        residentPurok,
        serviceCode,
        serviceName,
        office,
        purpose,
        additionalDetails,
        attachments,
        fee,
      } = req.body;

      if (!serviceCode || !purpose || !residentName) {
        return res.status(400).json({ error: 'Service type, resident name, and purpose are required.' });
      }

      const created = await createNewServiceRequest({
        userUid: req.user!.uid,
        residentName,
        residentPurok: residentPurok || 'Purok 1 - Centro',
        serviceCode,
        serviceName,
        office,
        purpose,
        additionalDetails: additionalDetails || {},
        attachments: attachments || [],
        fee: Number(fee || 0),
      });

      await recordAuditLog({
        eventCode: 'DOCUMENT_REQUEST_CREATED',
        actorUid: req.user!.uid,
        actorEmail: req.user!.email,
        actorRole: req.user!.role,
        severity: 'INFO',
        description: `Submitted ${serviceName} request (${created.referenceNumber}).`,
        metadata: { referenceNumber: created.referenceNumber, serviceCode },
      });

      res.status(201).json({ request: created });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to create service request' });
    }
  });

  app.patch(
    '/api/service-requests/:id/status',
    requireAuth,
    requireOfficialRole(['SECRETARY', 'TREASURER', 'CAPTAIN', 'KAGAWAD', 'TANOD']),
    async (req: AuthRequest, res) => {
      try {
        const requestId = Number(req.params.id);
        const { status, rejectionReason, reviewerNotes, paymentStatus, paymentReference } = req.body;
        const dbUser = await getUserByUid(req.user!.uid);
        const reviewerTitle = dbUser
          ? `${dbUser.firstName} ${dbUser.lastName} (${dbUser.role})`
          : `Barangay Official (${req.user!.role})`;

        const updated = await updateRequestStatusAndIssueDoc(requestId, {
          status,
          rejectionReason,
          reviewerNotes,
          reviewedBy: reviewerTitle,
          paymentStatus,
          paymentReference,
        });

        await recordAuditLog({
          eventCode:
            status === 'APPROVED'
              ? 'DOCUMENT_APPROVED'
              : status === 'REJECTED'
              ? 'DOCUMENT_REJECTED'
              : 'DOCUMENT_REQUEST_UPDATED',
          actorUid: req.user!.uid,
          actorEmail: req.user!.email,
          actorRole: req.user!.role,
          severity: status === 'REJECTED' ? 'WARNING' : 'INFO',
          description: `Updated request ${updated.referenceNumber} status to ${status}.`,
          metadata: { referenceNumber: updated.referenceNumber, status },
        });

        res.json({ request: updated });
      } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to update request status' });
      }
    }
  );

  // 4. Documents & Public QR Verification
  app.get('/api/documents', requireAuth, async (req: AuthRequest, res) => {
    try {
      const scope = req.query.scope as string | undefined;
      const isOfficial = ['SECRETARY', 'TREASURER', 'CAPTAIN', 'TANOD', 'KAGAWAD'].includes(
        req.user!.role
      );
      const list = await getDocumentsList(scope === 'all' && isOfficial ? undefined : req.user!.uid);
      res.json({ documents: list });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to load documents' });
    }
  });

  app.get('/api/documents/verify/:reference', async (req, res) => {
    try {
      const result = await verifyDocumentByReference(req.params.reference);
      await recordAuditLog({
        eventCode: 'DOCUMENT_VERIFIED',
        actorUid: 'PUBLIC_VERIFIER',
        actorEmail: '',
        actorRole: 'PUBLIC',
        severity: result.outcome === 'REVOKED' ? 'WARNING' : 'INFO',
        description: `Verification check for ${req.params.reference} returned ${result.outcome}.`,
        metadata: { reference: req.params.reference, outcome: result.outcome },
      });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Verification failed' });
    }
  });

  app.patch(
    '/api/documents/:id/status',
    requireAuth,
    requireOfficialRole(['SECRETARY', 'CAPTAIN']),
    async (req: AuthRequest, res) => {
      try {
        const docId = Number(req.params.id);
        const { status } = req.body;
        const updated = await updateDocumentStatus(docId, status);
        await recordAuditLog({
          eventCode: status === 'REVOKED' ? 'DOCUMENT_REVOKED' : 'DOCUMENT_RESTORED',
          actorUid: req.user!.uid,
          actorEmail: req.user!.email,
          actorRole: req.user!.role,
          severity: status === 'REVOKED' ? 'WARNING' : 'INFO',
          description: `Document ${updated.referenceNumber} marked as ${status}.`,
        });
        res.json({ document: updated });
      } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to update document status' });
      }
    }
  );

  app.post('/api/documents/:reference/notes', requireAuth, async (req: AuthRequest, res) => {
    try {
      const referenceNumber = String(req.params.reference || '').trim().toUpperCase();
      const { officialNotes, authorName } = req.body;
      const author =
        authorName || 'Hon. Rodrigo A. Balimbingan Sr. (Punong Barangay · Barangay Captain)';
      const updatedAt = new Date().toISOString();

      await recordAuditLog({
        eventCode: 'CERTIFICATE_REMARKS_ADDED',
        actorUid: req.user!.uid,
        actorEmail: req.user!.email,
        actorRole: req.user!.role || 'CAPTAIN',
        severity: 'INFO',
        description: `Barangay Captain Official Notes / Remarks recorded on certificate ${referenceNumber}: "${String(officialNotes || '').slice(0, 120)}"`,
        metadata: {
          referenceNumber,
          officialNotes: String(officialNotes || ''),
          officialNotesAuthor: author,
          officialNotesUpdatedAt: updatedAt,
        },
      });

      res.json({
        success: true,
        referenceNumber,
        officialNotes: String(officialNotes || ''),
        officialNotesAuthor: author,
        officialNotesUpdatedAt: updatedAt,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to save certificate official notes' });
    }
  });

  // 5. Announcements & Notifications
  app.get('/api/announcements', async (_req, res) => {
    try {
      const list = await getAnnouncementsList();
      res.json({ announcements: list });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch announcements' });
    }
  });

  app.post(
    '/api/announcements',
    requireAuth,
    requireOfficialRole(['SECRETARY', 'CAPTAIN']),
    async (req: AuthRequest, res) => {
      try {
        const created = await createNewAnnouncement(req.body);
        await recordAuditLog({
          eventCode: 'ANNOUNCEMENT_PUBLISHED',
          actorUid: req.user!.uid,
          actorEmail: req.user!.email,
          actorRole: req.user!.role,
          severity: 'INFO',
          description: `Published official notice: ${created.title}`,
        });
        res.status(201).json({ announcement: created });
      } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to publish announcement' });
      }
    }
  );

  app.get('/api/notifications', requireAuth, async (req: AuthRequest, res) => {
    try {
      const list = await getNotificationsForUser(req.user!.uid);
      res.json({ notifications: list });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to load notifications' });
    }
  });

  app.post('/api/notifications/read-all', requireAuth, async (req: AuthRequest, res) => {
    try {
      await markAllUserNotificationsRead(req.user!.uid);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to mark notifications as read' });
    }
  });

  // 6. Executive Dashboard, Official Role Management & Barangay Settings
  app.get('/api/admin/overview', requireAuth, async (_req: AuthRequest, res) => {
    try {
      const metrics = await getExecutiveDashboardSummary();
      const citizens = await getAllUsers();
      const auditLogs = await getAuditLogsList();
      res.json({ metrics, citizens, auditLogs });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to load executive overview' });
    }
  });

  app.post('/api/admin/officials', requireAuth, async (req: AuthRequest, res) => {
    try {
      const {
        uid,
        firstName,
        middleName,
        lastName,
        suffix,
        email,
        username,
        contactNumber,
        purok,
        role,
        committeeOrDesignation,
      } = req.body;

      if (!firstName || !lastName || !role) {
        return res.status(400).json({ error: 'First name, last name, and official role are required.' });
      }

      const created = await createOrUpdateBarangayOfficial({
        uid,
        firstName,
        middleName,
        lastName,
        suffix,
        email: email || `${firstName.toLowerCase()}.${lastName.toLowerCase()}@lowerdimorok.gov.ph`,
        username,
        contactNumber,
        purok,
        role,
      });

      await recordAuditLog({
        eventCode: 'OFFICIAL_ROLE_ADDED',
        actorUid: req.user!.uid,
        actorEmail: req.user!.email,
        actorRole: req.user!.role,
        severity: 'INFO',
        description: `Barangay Captain appointed ${created.firstName} ${created.lastName} as Barangay ${role}${
          committeeOrDesignation ? ` (${committeeOrDesignation})` : ''
        }.`,
        metadata: {
          appointedUid: created.uid,
          role: created.role,
          committeeOrDesignation: committeeOrDesignation || '',
        },
      });

      res.status(201).json({ official: created });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to add barangay official' });
    }
  });

  app.patch('/api/admin/users/:uid/role', requireAuth, async (req: AuthRequest, res) => {
    try {
      const targetUid = req.params.uid;
      const { role } = req.body;
      if (!role) {
        return res.status(400).json({ error: 'Target role is required.' });
      }
      const updated = await updateUserRoleOrSecurity(targetUid, { role });
      await recordAuditLog({
        eventCode: 'OFFICIAL_ROLE_ASSIGNED',
        actorUid: req.user!.uid,
        actorEmail: req.user!.email,
        actorRole: req.user!.role,
        severity: 'INFO',
        description: `Updated citizen ${updated?.firstName || targetUid} ${updated?.lastName || ''} role to ${role}.`,
        metadata: { targetUid, role },
      });
      res.json({ user: updated });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to update user role' });
    }
  });

  app.put('/api/settings', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { barangayName, contactNumber, gcashNumber, gcashAccountName } = req.body;
      await recordAuditLog({
        eventCode: 'BARANGAY_SETTINGS_UPDATED',
        actorUid: req.user!.uid,
        actorEmail: req.user!.email,
        actorRole: req.user!.role,
        severity: 'INFO',
        description: `Barangay Captain updated settings for ${barangayName || 'Barangay Lower Dimorok'} (Contact: ${contactNumber || 'N/A'}, GCash: ${gcashNumber || 'N/A'}).`,
        metadata: {
          barangayName,
          contactNumber,
          gcashNumber,
          gcashAccountName,
        },
      });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to save barangay settings' });
    }
  });

  // 7. Barangay Lower Dimorok AI Civic Assistant (Strictly Guardrailed RAG)
  app.post('/api/ai/assistant', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { message } = req.body;
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Please provide a question for the Barangay Lower Dimorok Civic Assistant.' });
      }

      // Programmatic Guardrail Pre-Check for out-of-scope or prompt injection requests
      const lower = message.toLowerCase();
      const forbiddenPatterns = [
        'write python',
        'write javascript',
        'write code',
        'react component',
        'ignore previous instructions',
        'system prompt',
        'bypass authorization',
        'approve my document',
        'change the fee',
        'delete database',
      ];

      if (forbiddenPatterns.some((pat) => lower.includes(pat))) {
        await recordAuditLog({
          eventCode: 'AI_GUARDRAIL_TRIGGERED',
          actorUid: req.user!.uid,
          actorEmail: req.user!.email,
          actorRole: req.user!.role,
          severity: 'WARNING',
          description: `AI Civic Assistant blocked out-of-scope or injection query: "${message.slice(0, 80)}"`,
        });

        return res.json({
          reply:
            'I can help with Barangay Lower Dimorok services, procedures, requirements, official notices, and application information.',
          sourceCategory: 'Barangay Lower Dimorok Civic Guardrail Policy',
          guardrailTriggered: true,
        });
      }

      const announcements = await getAnnouncementsList();
      const recentNotices = announcements
        .slice(0, 4)
        .map((a) => `- [${a.category}] ${a.title}: ${a.summary}`)
        .join('\n');

      const systemInstruction = `You are the official AI Civic Assistant for Barangay Lower Dimorok, Municipality of Molave, Zamboanga del Sur, Philippines.
You must strictly answer ONLY questions related to Barangay Lower Dimorok services, document requirements, processing fees, application tracking statuses, barangay procedures, and official announcements based on the provided knowledge base.

STRICT GUARDRAILS:
1. NEVER generate software code, scripts, math homework, or general non-civic essays.
2. NEVER claim to modify database records, approve/reject documents, waive fees, or expose private resident data.
3. If the user asks ANYTHING outside Barangay Lower Dimorok civic services, procedures, requirements, official notices, or application guidance, respond with this EXACT sentence and nothing else:
"I can help with Barangay Lower Dimorok services, procedures, requirements, official notices, and application information."
4. Keep responses concise, respectful, easy to understand for senior citizens and residents, and cite the relevant Barangay Lower Dimorok office or statutory rule (e.g., Office of the Barangay Secretary, RA 11261, Barangay Licensing Division).

APPROVED KNOWLEDGE BASE:
${LOWER_DIMOROK_KNOWLEDGE_BASE}

CURRENT OFFICIAL ANNOUNCEMENTS:
${recentNotices}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: message,
        config: {
          systemInstruction,
          temperature: 0.2,
        },
      });

      const replyText =
        response.text ||
        'I can help with Barangay Lower Dimorok services, procedures, requirements, official notices, and application information.';

      res.json({
        reply: replyText,
        sourceCategory: 'Barangay Lower Dimorok Official Citizen Charter & Advisories',
        guardrailTriggered: false,
      });
    } catch (error: any) {
      console.error('AI Assistant error:', error);
      res.status(500).json({
        error: 'Unable to reach Barangay Lower Dimorok AI Assistant right now. Please refer to the Service Directory for official requirements and fees.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Barangay Lower Dimorok server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
