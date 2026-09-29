export type CertificateWorkflowStage =
  | 'SECRETARY_REVIEW'
  | 'TREASURER_RECEIVE_FOR_PAYMENT'
  | 'RESIDENT_PAYMENT_SELECTION'
  | 'TREASURER_VERIFY_AND_SIGN'
  | 'CAPTAIN_FINAL_SIGN'
  | 'RELEASED_TO_RESIDENT';

export type WalletPaymentMethod = 'GCASH' | 'PAYMAYA';

export interface CertificateWorkflowRecord {
  referenceNumber: string;
  requestId?: number;
  stage: CertificateWorkflowStage;
  // Step 2: Secretary Approval & Signature
  secretaryApproved: boolean;
  secretarySignatureDataUrl?: string;
  secretarySignedBy?: string;
  secretarySignedAt?: string;
  // Step 3: Treasurer Received & Returned to Resident for Payment
  treasurerReceivedForPayment: boolean;
  treasurerBilledAt?: string;
  // Step 4: Resident GCash / PayMaya Payment, Screenshot & Reference
  paymentMethod?: WalletPaymentMethod;
  paymentAccountNumber?: string;
  paymentReferenceNumber?: string;
  paymentReceiptDataUrl?: string;
  paymentSubmittedAt?: string;
  // Step 5: Treasurer Verify PAID & Attach Signature
  treasurerVerifiedPaid: boolean;
  treasurerSignatureDataUrl?: string;
  treasurerSignedBy?: string;
  treasurerSignedAt?: string;
  officialReceiptNumber?: string;
  // Step 6: Barangay Captain Final Signature & Redirect to Resident for Download
  captainApprovedAndSigned: boolean;
  captainSignatureDataUrl?: string;
  captainSignedBy?: string;
  captainSignedAt?: string;
  updatedAt: string;
}

export const WORKFLOW_STORAGE_KEY = 'dabawgov_certificate_workflow_records_v1';

export function createSignatureSvgDataUrl(
  signerName: string,
  roleLabel: string,
  strokeColor = '#065f46'
): string {
  const cleanName = signerName.replace(/[<>&"']/g, '');
  const cleanRole = roleLabel.replace(/[<>&"']/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 110" width="340" height="110">
    <rect width="340" height="110" rx="8" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5"/>
    <path d="M 28 68 C 52 24, 72 82, 98 44 C 118 16, 134 74, 164 48 C 188 28, 210 68, 246 38 C 268 22, 292 58, 314 42" fill="none" stroke="${strokeColor}" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M 42 74 Q 170 60 302 72" fill="none" stroke="${strokeColor}" stroke-width="1.4" stroke-dasharray="4 2" opacity="0.75"/>
    <text x="170" y="90" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="800" fill="#0f172a">${cleanName}</text>
    <text x="170" y="103" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="8.5" font-weight="600" fill="#047857">${cleanRole} · DIGITALLY SIGNED</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const DEFAULT_PAYMAYA_QR_SVG_DATA_URL = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240">
    <rect width="240" height="240" rx="16" fill="#ffffff" stroke="#059669" stroke-width="6"/>
    <rect x="16" y="16" width="208" height="34" rx="8" fill="#059669"/>
    <text x="120" y="38" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="800" fill="#ffffff">PAYMAYA / MAYA OFFICIAL QR</text>
    <rect x="34" y="64" width="48" height="48" fill="none" stroke="#0f172a" stroke-width="6"/>
    <rect x="46" y="76" width="24" height="24" fill="#059669"/>
    <rect x="158" y="64" width="48" height="48" fill="none" stroke="#0f172a" stroke-width="6"/>
    <rect x="170" y="76" width="24" height="24" fill="#059669"/>
    <rect x="34" y="148" width="48" height="48" fill="none" stroke="#0f172a" stroke-width="6"/>
    <rect x="46" y="160" width="24" height="24" fill="#059669"/>
    <rect x="96" y="68" width="12" height="12" fill="#0f172a"/>
    <rect x="120" y="68" width="12" height="12" fill="#0f172a"/>
    <rect x="108" y="82" width="12" height="12" fill="#059669"/>
    <rect x="96" y="96" width="24" height="12" fill="#0f172a"/>
    <rect x="132" y="96" width="12" height="24" fill="#0f172a"/>
    <rect x="96" y="120" width="16" height="16" fill="#059669"/>
    <rect x="122" y="124" width="20" height="12" fill="#0f172a"/>
    <rect x="156" y="124" width="14" height="14" fill="#0f172a"/>
    <rect x="182" y="124" width="22" height="12" fill="#059669"/>
    <rect x="96" y="148" width="14" height="24" fill="#0f172a"/>
    <rect x="120" y="156" width="24" height="14" fill="#059669"/>
    <rect x="156" y="148" width="20" height="20" fill="#0f172a"/>
    <rect x="186" y="154" width="18" height="18" fill="#0f172a"/>
    <rect x="96" y="182" width="32" height="14" fill="#0f172a"/>
    <rect x="140" y="182" width="22" height="14" fill="#059669"/>
    <rect x="172" y="182" width="32" height="14" fill="#0f172a"/>
    <text x="120" y="218" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="10" font-weight="700" fill="#065f46">BRGY LOWER DIMOROK MAYA</text>
  </svg>`
)}`;

export function createSamplePaymentReceiptDataUrl(
  method: WalletPaymentMethod,
  refNumber: string,
  amountPhp: number,
  accountNum: string
): string {
  const walletTitle = method === 'GCASH' ? 'GCash Express Send Receipt' : 'PayMaya / Maya Official Receipt';
  const headerColor = method === 'GCASH' ? '#0284c7' : '#059669';
  const timestamp = new Date().toLocaleString('en-PH', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 220" width="360" height="220">
    <rect width="360" height="220" rx="14" fill="#f8fafc" stroke="${headerColor}" stroke-width="3"/>
    <rect x="12" y="12" width="336" height="42" rx="8" fill="${headerColor}"/>
    <text x="180" y="38" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="14" font-weight="800" fill="#ffffff">${walletTitle}</text>
    <text x="26" y="80" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="700" fill="#475569">Merchant / Account:</text>
    <text x="334" y="80" text-anchor="end" font-family="IBM Plex Mono, monospace" font-size="11" font-weight="700" fill="#0f172a">Brgy. Lower Dimorok (${accountNum})</text>
    <text x="26" y="106" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="700" fill="#475569">Amount Paid:</text>
    <text x="334" y="106" text-anchor="end" font-family="IBM Plex Mono, monospace" font-size="14" font-weight="800" fill="${headerColor}">PHP ${amountPhp.toFixed(2)}</text>
    <text x="26" y="132" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="700" fill="#475569">Reference No.:</text>
    <text x="334" y="132" text-anchor="end" font-family="IBM Plex Mono, monospace" font-size="12" font-weight="800" fill="#0f172a">${refNumber}</text>
    <text x="26" y="158" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="700" fill="#475569">Date & Time:</text>
    <text x="334" y="158" text-anchor="end" font-family="IBM Plex Mono, monospace" font-size="10.5" fill="#334155">${timestamp}</text>
    <rect x="26" y="174" width="308" height="28" rx="6" fill="#ecfdf5" stroke="#10b981" stroke-width="1"/>
    <text x="180" y="192" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="10.5" font-weight="700" fill="#065f46">STATUS: PAYMENT SENT · SCREENSHOT ATTACHED</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function getStoredWorkflowMap(): Record<string, CertificateWorkflowRecord> {
  const nowIso = new Date().toISOString();
  const defaultSecSig = createSignatureSvgDataUrl(
    'Ms. Marites L. Cabrera',
    'Barangay Secretary',
    '#0369a1'
  );
  const defaultTreasSig = createSignatureSvgDataUrl(
    'Mr. Eduardo R. Mendoza',
    'Barangay Treasurer',
    '#b45309'
  );
  const defaultCaptSig = createSignatureSvgDataUrl(
    'Hon. Rodrigo A. Balimbingan Sr.',
    'Punong Barangay / Captain',
    '#065f46'
  );

  const seed: Record<string, CertificateWorkflowRecord> = {
    'BD-2026-000118': {
      referenceNumber: 'BD-2026-000118',
      stage: 'RELEASED_TO_RESIDENT',
      secretaryApproved: true,
      secretarySignatureDataUrl: defaultSecSig,
      secretarySignedBy: 'Ms. Marites L. Cabrera (Barangay Secretary)',
      secretarySignedAt: nowIso,
      treasurerReceivedForPayment: true,
      treasurerBilledAt: nowIso,
      paymentMethod: 'GCASH',
      paymentAccountNumber: '0917-550-0911',
      paymentReferenceNumber: 'GCASH-2026-8841209',
      paymentReceiptDataUrl: createSamplePaymentReceiptDataUrl(
        'GCASH',
        'GCASH-2026-8841209',
        50,
        '0917-550-0911'
      ),
      paymentSubmittedAt: nowIso,
      treasurerVerifiedPaid: true,
      treasurerSignatureDataUrl: defaultTreasSig,
      treasurerSignedBy: 'Mr. Eduardo R. Mendoza (Barangay Treasurer)',
      treasurerSignedAt: nowIso,
      officialReceiptNumber: 'OR-2026-44819',
      captainApprovedAndSigned: true,
      captainSignatureDataUrl: defaultCaptSig,
      captainSignedBy: 'Hon. Rodrigo A. Balimbingan Sr. (Barangay Captain)',
      captainSignedAt: nowIso,
      updatedAt: nowIso,
    },
  };

  if (typeof window === 'undefined') return seed;
  try {
    const raw = localStorage.getItem(WORKFLOW_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(seed));
      return seed;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return seed;
    return { ...seed, ...parsed };
  } catch {
    return seed;
  }
}

export const getWorkflowMap = getStoredWorkflowMap;

export function getWorkflowForRequest(
  request: {
    id?: number;
    referenceNumber: string;
    status?: string;
    paymentStatus?: string;
    paymentReference?: string;
  },
  existingMap?: Record<string, CertificateWorkflowRecord>
): CertificateWorkflowRecord {
  const map = existingMap || getStoredWorkflowMap();
  const found = map[request.referenceNumber];
  if (found) return found;

  const nowIso = new Date().toISOString();
  const isApprovedOrCompleted =
    request.status === 'APPROVED' ||
    request.status === 'COMPLETED' ||
    request.status === 'READY_FOR_RELEASE';
  const isPaid = request.paymentStatus === 'PAID' || request.paymentStatus === 'WAIVED';

  const defaultSecSig = createSignatureSvgDataUrl(
    'Ms. Marites L. Cabrera',
    'Barangay Secretary',
    '#0369a1'
  );
  const defaultTreasSig = createSignatureSvgDataUrl(
    'Mr. Eduardo R. Mendoza',
    'Barangay Treasurer',
    '#b45309'
  );
  const defaultCaptSig = createSignatureSvgDataUrl(
    'Hon. Rodrigo A. Balimbingan Sr.',
    'Punong Barangay / Captain',
    '#065f46'
  );

  if (isApprovedOrCompleted) {
    return {
      referenceNumber: request.referenceNumber,
      requestId: request.id,
      stage: 'RELEASED_TO_RESIDENT',
      secretaryApproved: true,
      secretarySignatureDataUrl: defaultSecSig,
      secretarySignedBy: 'Ms. Marites L. Cabrera (Barangay Secretary)',
      secretarySignedAt: nowIso,
      treasurerReceivedForPayment: true,
      treasurerBilledAt: nowIso,
      paymentMethod: 'GCASH',
      paymentAccountNumber: '0917-550-0911',
      paymentReferenceNumber: request.paymentReference || 'GCASH-VERIFIED',
      treasurerVerifiedPaid: true,
      treasurerSignatureDataUrl: defaultTreasSig,
      treasurerSignedBy: 'Mr. Eduardo R. Mendoza (Barangay Treasurer)',
      treasurerSignedAt: nowIso,
      officialReceiptNumber: 'OR-2026-VERIFIED',
      captainApprovedAndSigned: true,
      captainSignatureDataUrl: defaultCaptSig,
      captainSignedBy: 'Hon. Rodrigo A. Balimbingan Sr. (Barangay Captain)',
      captainSignedAt: nowIso,
      updatedAt: nowIso,
    };
  }

  return {
    referenceNumber: request.referenceNumber,
    requestId: request.id,
    stage: 'SECRETARY_REVIEW',
    secretaryApproved: false,
    treasurerReceivedForPayment: false,
    paymentMethod: 'GCASH',
    paymentReferenceNumber: request.paymentReference || '',
    treasurerVerifiedPaid: isPaid,
    captainApprovedAndSigned: false,
    updatedAt: nowIso,
  };
}

export function saveWorkflowRecord(record: CertificateWorkflowRecord): Record<string, CertificateWorkflowRecord> {
  const current = getStoredWorkflowMap();
  const updated: Record<string, CertificateWorkflowRecord> = {
    ...current,
    [record.referenceNumber]: {
      ...record,
      updatedAt: new Date().toISOString(),
    },
  };
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Ignore storage write errors
    }
  }
  return updated;
}

export function getStageBadgeMeta(stage: CertificateWorkflowStage): {
  stepNumber: number;
  label: string;
  targetRole: 'RESIDENT' | 'SECRETARY' | 'TREASURER' | 'CAPTAIN';
  description: string;
} {
  switch (stage) {
    case 'SECRETARY_REVIEW':
      return {
        stepNumber: 1,
        label: 'Step 1/6 · Routed to Barangay Secretary for Approval & Signature',
        targetRole: 'SECRETARY',
        description:
          'Resident submitted certificate request. Awaiting Barangay Secretary approval and digital signature before routing to Treasurer.',
      };
    case 'TREASURER_RECEIVE_FOR_PAYMENT':
      return {
        stepNumber: 2,
        label: 'Step 2/6 · Secretary Signed → Routed to Treasurer for Payment Billing',
        targetRole: 'TREASURER',
        description:
          'Barangay Secretary approved and attached signature. Awaiting Barangay Treasurer to receive certificate and return to Resident for payment.',
      };
    case 'RESIDENT_PAYMENT_SELECTION':
      return {
        stepNumber: 3,
        label: 'Step 3/6 · Returned to Resident for GCash / PayMaya Payment & Receipt Upload',
        targetRole: 'RESIDENT',
        description:
          'Barangay Treasurer received certificate and returned it to Resident. Resident selects GCash or PayMaya, views QR Code & number, uploads screenshot/receipt, and enters Reference Number.',
      };
    case 'TREASURER_VERIFY_AND_SIGN':
      return {
        stepNumber: 4,
        label: 'Step 4/6 · Payment Receipt Uploaded → Routed to Treasurer for PAID Verification & Signature',
        targetRole: 'TREASURER',
        description:
          'Resident uploaded payment receipt screenshot and reference number. Awaiting Barangay Treasurer to verify status as PAID, attach Treasurer signature, and forward to Barangay Captain.',
      };
    case 'CAPTAIN_FINAL_SIGN':
      return {
        stepNumber: 5,
        label: 'Step 5/6 · Treasurer Verified PAID & Signed → Routed to Barangay Captain for Final Signature',
        targetRole: 'CAPTAIN',
        description:
          'Payment verified as PAID and signed by Barangay Treasurer. Awaiting Barangay Captain to attach signature and return to Resident for download.',
      };
    case 'RELEASED_TO_RESIDENT':
      return {
        stepNumber: 6,
        label: 'Step 6/6 · Signed by Secretary, Treasurer & Captain → Ready for Resident Download',
        targetRole: 'RESIDENT',
        description:
          'All official signatures attached (Secretary, Treasurer, and Barangay Captain). Resident can now download the official signed certificate.',
      };
  }
}
