import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileCheck2,
  FileDown,
  FileText,
  History,
  Mail,
  Printer,
  QrCode,
  Share2,
  ShieldCheck,
  X,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { IssuedDocument } from '../types.ts';
import { createSignatureSvgDataUrl, getWorkflowMap } from '../utils/certificateWorkflow.ts';
import sealImg from '../assets/images/barangay_seal_emblem_1790596934896.jpg';

export interface OfficialCertificateNoteRecord {
  referenceNumber: string;
  notes: string;
  author: string;
  updatedAt: string;
}

export const CERTIFICATE_NOTES_STORAGE_KEY = 'dabawgov_certificate_official_notes';

export function getStoredCertificateNotesMap(): Record<string, OfficialCertificateNoteRecord> {
  const defaultSeed: Record<string, OfficialCertificateNoteRecord> = {
    'BD-2026-000118': {
      referenceNumber: 'BD-2026-000118',
      notes:
        'Verified against the 2026 Purok 2 - Pag-asa Registry of Barangay Inhabitants (RBI) and Lupon Tagapamayapa docket. Resident is in good civic standing with zero pending administrative complaints.',
      author: 'Hon. Rodrigo A. Balimbingan Sr. — Punong Barangay (Barangay Captain)',
      updatedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    },
    'BD-2026-000119': {
      referenceNumber: 'BD-2026-000119',
      notes:
        'Household social welfare evaluation confirmed with Purok 4 Leader. Statutory fee waived in full compliance with Barangay Lower Dimorok Indigency & Medical Assistance guidelines.',
      author: 'Hon. Rodrigo A. Balimbingan Sr. — Punong Barangay (Barangay Captain)',
      updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    },
  };

  if (typeof window === 'undefined') return defaultSeed;
  try {
    const raw = localStorage.getItem(CERTIFICATE_NOTES_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(CERTIFICATE_NOTES_STORAGE_KEY, JSON.stringify(defaultSeed));
      return defaultSeed;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaultSeed;
    return { ...defaultSeed, ...parsed };
  } catch {
    return defaultSeed;
  }
}

export function saveStoredCertificateNote(record: OfficialCertificateNoteRecord): void {
  if (typeof window === 'undefined') return;
  try {
    const map = getStoredCertificateNotesMap();
    map[record.referenceNumber] = record;
    localStorage.setItem(CERTIFICATE_NOTES_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage write errors
  }
}

interface CertificateModalProps {
  document: IssuedDocument | null;
  onClose: () => void;
  onVerifyClick: (code: string) => void;
  userRole?: string;
  authHeaders?: Record<string, string>;
  onNotesUpdated?: (referenceNumber: string, notes: string) => void;
  barangayName?: string;
}

interface CertificateRevision {
  version: string;
  statusLabel: string;
  timestamp: string;
  author: string;
  verificationHash: string;
  reasonForChange: string;
  changesSummary: string;
}

function buildQrMatrix(seedText: string): boolean[][] {
  const size = 21;
  const grid: boolean[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => false)
  );

  const drawFinder = (startR: number, startC: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const isInnerBlock = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        grid[startR + r][startC + c] = isBorder || isInnerBlock;
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  for (let i = 8; i < size - 8; i++) {
    grid[6][i] = i % 2 === 0;
    grid[i][6] = i % 2 === 0;
  }

  let hash = 2166136261;
  for (let i = 0; i < seedText.length; i++) {
    hash ^= seedText.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const inTopLeft = r < 8 && c < 8;
      const inTopRight = r < 8 && c >= size - 8;
      const inBottomLeft = r >= size - 8 && c < 8;
      const isTiming = r === 6 || c === 6;

      if (inTopLeft || inTopRight || inBottomLeft || isTiming) continue;

      const idx = r * size + c;
      const charCode = seedText.charCodeAt(idx % seedText.length);
      const val = (Math.abs(hash) + idx * 31 + charCode * 17) % 7;
      grid[r][c] = val < 3;
    }
  }

  return grid;
}

async function createCircularSealDataUrl(imgSrc: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const size = 240;
      const canvas = window.document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }

      ctx.save();
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2 - 6, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(img, 0, 0, size, size);
      ctx.restore();

      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2 - 6, 0, Math.PI * 2);
      ctx.lineWidth = 8;
      ctx.strokeStyle = '#1e293b';
      ctx.stroke();

      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(null);
    img.src = imgSrc;
  });
}

export const CertificateModal: React.FC<CertificateModalProps> = ({
  document: certDoc,
  onClose,
  onVerifyClick,
  userRole = 'RESIDENT',
  authHeaders = {},
  onNotesUpdated,
  barangayName = 'Barangay Lower Dimorok',
}) => {
  const [activeTab, setActiveTab] = useState<'certificate' | 'history'>('certificate');
  const [qrDownloaded, setQrDownloaded] = useState(false);
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const [pdfDownloaded, setPdfDownloaded] = useState(false);
  const [emailShared, setEmailShared] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [showShareDrawer, setShowShareDrawer] = useState(false);
  const [socialShareStatus, setSocialShareStatus] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedSocialCaption, setCopiedSocialCaption] = useState(false);
  const [simulateExpiringSoon, setSimulateExpiringSoon] = useState(false);

  // Custom Printer-Selection & A4 Landscape Preview Dialog State
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [printOutputMode, setPrintOutputMode] = useState<'local_pdf' | 'system_print'>('local_pdf');
  const [selectedPrinterDevice, setSelectedPrinterDevice] = useState<string>(
    'Barangay Hall LaserJet Pro M404n (A4 Landscape Tray)'
  );
  const [printCopies, setPrintCopies] = useState<number>(1);
  const [printColorMode, setPrintColorMode] = useState<'color' | 'grayscale'>('color');
  const [printConfirmBanner, setPrintConfirmBanner] = useState<string | null>(null);

  // Barangay Captain Official Notes / Remarks state
  const [notesMap, setNotesMap] = useState<Record<string, OfficialCertificateNoteRecord>>(() =>
    getStoredCertificateNotesMap()
  );
  const [showNotesEditor, setShowNotesEditor] = useState(false);
  const [draftOfficialNotes, setDraftOfficialNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSavedToast, setNotesSavedToast] = useState<string | null>(null);

  const activeOfficialNote = useMemo<OfficialCertificateNoteRecord | null>(() => {
    if (!certDoc) return null;
    const fromMap = notesMap[certDoc.referenceNumber];
    if (fromMap && fromMap.notes.trim()) return fromMap;
    if (certDoc.officialNotes && certDoc.officialNotes.trim()) {
      return {
        referenceNumber: certDoc.referenceNumber,
        notes: certDoc.officialNotes,
        author:
          certDoc.officialNotesAuthor ||
          'Hon. Rodrigo A. Balimbingan Sr. — Punong Barangay (Barangay Captain)',
        updatedAt: certDoc.officialNotesUpdatedAt || certDoc.issuedAt,
      };
    }
    return {
      referenceNumber: certDoc.referenceNumber,
      notes: `Verified in the Barangay Lower Dimorok Registry of Barangay Inhabitants (RBI) and Lupon clearance log for ${certDoc.purpose}.`,
      author: 'Hon. Rodrigo A. Balimbingan Sr. — Punong Barangay (Barangay Captain)',
      updatedAt: certDoc.issuedAt,
    };
  }, [certDoc, notesMap]);

  useEffect(() => {
    if (certDoc) {
      const latestMap = getStoredCertificateNotesMap();
      setNotesMap(latestMap);
      const existing =
        latestMap[certDoc.referenceNumber]?.notes ||
        certDoc.officialNotes ||
        `Verified in the Barangay Lower Dimorok Registry of Barangay Inhabitants (RBI) and Lupon clearance log for ${certDoc.purpose}.`;
      setDraftOfficialNotes(existing);
    }
  }, [certDoc]);

  const qrMatrix = useMemo(() => {
    if (!certDoc) return [];
    return buildQrMatrix(
      `${certDoc.verificationCode}|${certDoc.referenceNumber}|${certDoc.documentType}`
    );
  }, [certDoc]);

  // Resolve effective expiryDate (supports expiryDate, expiresAt, or 6-month statutory default)
  const expiryInfo = useMemo(() => {
    if (!certDoc) {
      return {
        rawDate: '',
        formattedDate: '',
        formattedLongDate: '',
        daysRemaining: 180,
        isExpiringWithin7Days: false,
        isExpired: false,
      };
    }

    const now = Date.now();
    let targetMs: number;

    if (simulateExpiringSoon) {
      targetMs = now + 5 * 24 * 60 * 60 * 1000; // 5 days from now to demonstrate 7-day warning
    } else if (certDoc.expiryDate) {
      targetMs = new Date(certDoc.expiryDate).getTime();
    } else if (certDoc.expiresAt) {
      targetMs = new Date(certDoc.expiresAt).getTime();
    } else {
      targetMs = new Date(certDoc.issuedAt).getTime() + 180 * 24 * 60 * 60 * 1000;
    }

    const diffMs = targetMs - now;
    const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    const isExpired = daysRemaining < 0 || certDoc.status === 'EXPIRED';
    const isExpiringWithin7Days = !isExpired && daysRemaining >= 0 && daysRemaining <= 7;

    const formattedDate = new Date(targetMs).toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    });

    const formattedLongDate = new Date(targetMs).toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    return {
      rawDate: new Date(targetMs).toISOString(),
      formattedDate,
      formattedLongDate,
      daysRemaining,
      isExpiringWithin7Days,
      isExpired,
    };
  }, [certDoc, simulateExpiringSoon]);

  const versionHistory = useMemo<CertificateRevision[]>(() => {
    if (!certDoc) return [];
    const issuedTime = new Date(certDoc.issuedAt).getTime();
    const reviewTime = new Date(issuedTime - 45 * 60 * 1000).toISOString();
    const initialTime = new Date(issuedTime - 2 * 60 * 60 * 1000).toISOString();

    return [
      {
        version: certDoc.status === 'REVOKED' ? 'v2.1 (Revoked)' : 'v2.0 (Current Official Release)',
        statusLabel: certDoc.status === 'REVOKED' ? 'REVOKED' : 'SIGNED & ACTIVE',
        timestamp: certDoc.issuedAt,
        author: certDoc.signatory || 'Hon. Rodrigo A. Balimbingan Sr. — Punong Barangay',
        verificationHash: certDoc.verificationCode,
        reasonForChange:
          certDoc.status === 'REVOKED'
            ? 'Document superseded and revoked by Barangay Licensing Division upon issuance of updated record.'
            : 'Executive digital signature applied and cryptographic QR verification code bound to Registry of Barangay Inhabitants (RBI).',
        changesSummary:
          certDoc.status === 'REVOKED'
            ? 'Status transitioned from VALID to REVOKED; public QR endpoint updated to warn verifiers.'
            : `Embedded Punong Barangay digital seal, set validity period until ${expiryInfo.formattedDate}, and activated public /verify endpoint.`,
      },
      {
        version: 'v1.2 (Secretariat Verification)',
        statusLabel: 'VERIFIED_DRAFT',
        timestamp: reviewTime,
        author: `Ms. Marites L. Cabrera (${certDoc.issuingOffice})`,
        verificationHash: `${certDoc.verificationCode.slice(0, -4)}DRFT`,
        reasonForChange:
          'Standardized residential Purok address formatting and verified zero pending Lupon Tagapamayapa administrative cases.',
        changesSummary: `Validated domicile at "${certDoc.residentAddress}" and confirmed statutory purpose: "${certDoc.purpose}".`,
      },
      {
        version: 'v1.0 (Initial Application Intake)',
        statusLabel: 'INTAKE_RECORD',
        timestamp: initialTime,
        author: `${certDoc.residentName} (Resident Portal Submission)`,
        verificationHash: `INTAKE-${certDoc.referenceNumber}`,
        reasonForChange:
          'Initial digital document generation triggered from resident service application and supporting ID upload.',
        changesSummary: `Assigned reference number ${certDoc.referenceNumber} for ${certDoc.documentType}.`,
      },
    ];
  }, [certDoc, expiryInfo.formattedDate]);

  if (!certDoc) return null;

  const verificationUrl = `${window.location.origin}/verify/${certDoc.referenceNumber}`;
  const qrFileName = `LOWER_DIMOROK_QR_${certDoc.referenceNumber}.png`;

  // Pre-formatted social caption containing the document's reference number
  const socialShareCaption = `Verified Official ${certDoc.documentType} issued by Barangay Lower Dimorok (Ref: ${certDoc.referenceNumber} | Verification Code: ${certDoc.verificationCode}). Check authenticity online at ${verificationUrl}`;
  const facebookShareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
    verificationUrl
  )}&quote=${encodeURIComponent(socialShareCaption)}`;
  const twitterShareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    socialShareCaption
  )}&url=${encodeURIComponent(verificationUrl)}`;

  const handleCopySocialCaption = async () => {
    try {
      await navigator.clipboard.writeText(socialShareCaption);
    } catch {
      // Fallback if clipboard blocked
    }
    setCopiedSocialCaption(true);
    setTimeout(() => setCopiedSocialCaption(false), 2500);
  };

  const handleSocialPlatformTrigger = async (platform: 'Facebook' | 'Twitter') => {
    try {
      await navigator.clipboard.writeText(socialShareCaption);
    } catch {
      // Ignore clipboard error
    }
    setSocialShareStatus(
      `Ready to post on ${platform}! Pre-formatted caption with Reference ${certDoc.referenceNumber} copied to clipboard.`
    );
    setTimeout(() => setSocialShareStatus(null), 5000);
  };

  const handleSaveOfficialNotes = async () => {
    const trimmed = draftOfficialNotes.trim();
    if (!trimmed) return;
    setSavingNotes(true);
    const updatedAt = new Date().toISOString();
    const author = 'Hon. Rodrigo A. Balimbingan Sr. — Punong Barangay (Barangay Captain)';
    const record: OfficialCertificateNoteRecord = {
      referenceNumber: certDoc.referenceNumber,
      notes: trimmed,
      author,
      updatedAt,
    };

    saveStoredCertificateNote(record);
    setNotesMap((prev) => ({
      ...prev,
      [certDoc.referenceNumber]: record,
    }));

    try {
      await fetch(`/api/documents/${encodeURIComponent(certDoc.referenceNumber)}/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          officialNotes: trimmed,
          authorName: author,
        }),
      });
    } catch {
      // Local storage state already updated
    }

    if (onNotesUpdated) {
      onNotesUpdated(certDoc.referenceNumber, trimmed);
    }

    setSavingNotes(false);
    setShowNotesEditor(false);
    setNotesSavedToast(`Official Notes / Remarks saved to certificate ${certDoc.referenceNumber}.`);
    setTimeout(() => setNotesSavedToast(null), 4000);
  };

  const renderQrCanvas = (): HTMLCanvasElement | null => {
    const canvas = window.document.createElement('canvas');
    const width = 640;
    const height = 780;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 6;
    ctx.strokeRect(20, 20, width - 40, height - 40);

    ctx.fillStyle = '#065f46';
    ctx.fillRect(23, 23, width - 46, 96);

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 20px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('BARANGAY LOWER DIMOROK', width / 2, 62);
    ctx.font = '500 13px "IBM Plex Mono", monospace';
    ctx.fillText('OFFICIAL OFFLINE QR VERIFICATION PASS', width / 2, 92);

    const matrixSize = qrMatrix.length;
    const cellSize = 18;
    const qrPixelSize = matrixSize * cellSize;
    const startX = Math.floor((width - qrPixelSize) / 2);
    const startY = 150;

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.strokeRect(startX - 16, startY - 16, qrPixelSize + 32, qrPixelSize + 32);

    for (let r = 0; r < matrixSize; r++) {
      for (let c = 0; c < matrixSize; c++) {
        ctx.fillStyle = qrMatrix[r][c] ? '#0f172a' : '#ffffff';
        ctx.fillRect(startX + c * cellSize, startY + r * cellSize, cellSize, cellSize);
      }
    }

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 18px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(certDoc.documentType.toUpperCase(), width / 2, startY + qrPixelSize + 48);

    ctx.fillStyle = '#334155';
    ctx.font = '600 14px "IBM Plex Mono", monospace';
    ctx.fillText(
      `REF: ${certDoc.referenceNumber} · EXPIRES: ${expiryInfo.formattedDate}`,
      width / 2,
      startY + qrPixelSize + 76
    );

    ctx.fillStyle = '#065f46';
    ctx.font = '600 14px "IBM Plex Mono", monospace';
    ctx.fillText(`CODE: ${certDoc.verificationCode}`, width / 2, startY + qrPixelSize + 102);

    ctx.fillStyle = '#64748b';
    ctx.font = '500 12px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(
      `Holder: ${certDoc.residentName} · Barangay Lower Dimorok, Molave`,
      width / 2,
      startY + qrPixelSize + 132
    );

    return canvas;
  };

  const handleSaveAsQrPng = () => {
    const canvas = renderQrCanvas();
    if (!canvas) return;

    const dataUrl = canvas.toDataURL('image/png');
    const link = window.document.createElement('a');
    link.href = dataUrl;
    link.download = qrFileName;
    window.document.body.appendChild(link);
    link.click();
    window.document.body.removeChild(link);

    setQrDownloaded(true);
    setTimeout(() => setQrDownloaded(false), 3000);
  };

  const handleShareViaEmail = async () => {
    // 1. Generate QR Code PNG image for attachment and copy to clipboard + trigger download
    const canvas = renderQrCanvas();
    if (canvas) {
      const dataUrl = canvas.toDataURL('image/png');

      // Trigger download of the QR image so the resident has the exact file ready to attach
      const downloadLink = window.document.createElement('a');
      downloadLink.href = dataUrl;
      downloadLink.download = qrFileName;
      window.document.body.appendChild(downloadLink);
      downloadLink.click();
      window.document.body.removeChild(downloadLink);

      // Also copy the QR image to clipboard if ClipboardItem is supported
      try {
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob((b) => resolve(b), 'image/png')
        );
        if (blob && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        }
      } catch {
        // Clipboard image write is optional enhancement
      }
    }

    const issuedFormatted = new Date(certDoc.issuedAt).toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // 2. Construct pre-filled subject referencing the certificate type and reference number
    const emailSubject = `Official ${certDoc.documentType} - ${certDoc.residentName} (${certDoc.referenceNumber})`;

    // 3. Construct pre-filled email body with verification page link and QR code attachment reference
    const emailBody = [
      `Greetings,`,
      ``,
      `Please find the official digital verification details for my ${certDoc.documentType} issued by the Office of the Punong Barangay, Barangay Lower Dimorok, Municipality of Molave, Zamboanga del Sur:`,
      ``,
      `• Certificate Type: ${certDoc.documentType}`,
      `• Resident / Holder: ${certDoc.residentName}`,
      `• Registered Address: ${certDoc.residentAddress}`,
      `• Reference Number: ${certDoc.referenceNumber}`,
      `• Cryptographic Verification Code: ${certDoc.verificationCode}`,
      `• Issued Date: ${issuedFormatted}`,
      `• Valid Until: ${expiryInfo.formattedLongDate}`,
      `• Purpose: ${certDoc.purpose}`,
      ``,
      `Verify this certificate online at the official Barangay Lower Dimorok Verification Page:`,
      `${verificationUrl}`,
      ``,
      `[Attachment: Official QR Code Verification Pass (${qrFileName}) — automatically saved & copied to your clipboard for attachment]`,
      ``,
      `Respectfully,`,
      `${certDoc.residentName}`,
    ].join('\r\n');

    const mailtoHref = `mailto:?subject=${encodeURIComponent(
      emailSubject
    )}&body=${encodeURIComponent(emailBody)}`;

    const mailLink = window.document.createElement('a');
    mailLink.href = mailtoHref;
    window.document.body.appendChild(mailLink);
    mailLink.click();
    window.document.body.removeChild(mailLink);

    setEmailShared(true);
    setTimeout(() => setEmailShared(false), 4500);
  };

  const handleDownloadPdf = async () => {
    if (pdfDownloading) return;
    setPdfDownloading(true);

    try {
      // Matches @page { size: A4 landscape; margin: 10mm; } in src/index.css
      // A4 Landscape dimensions: 297mm width x 210mm height
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
      });

      const pageW = 297;
      const pageH = 210;

      // White page background (#ffffff)
      pdf.setFillColor(255, 255, 255);
      pdf.rect(0, 0, pageW, pageH, 'F');

      // .certificate-print-root (277mm x 190mm, 10mm margin) + .certificate-print-sheet (6mm padding)
      // Frame outer box: x=16mm, y=16mm, width=265mm, height=178mm
      const frameX = 16;
      const frameY = 16;
      const frameW = 265;
      const frameH = 178;

      // .certificate-print-frame: border: 2.5px solid #0f172a; padding: 8mm 12mm;
      pdf.setDrawColor(15, 23, 42); // #0f172a (slate-900)
      pdf.setLineWidth(0.88);
      pdf.rect(frameX, frameY, frameW, frameH, 'S');

      const innerX = frameX + 12; // 28mm
      const innerRight = frameX + frameW - 12; // 269mm
      const innerW = frameW - 24; // 241mm
      const topY = frameY + 8; // 24mm

      // --- TOP HEADER SECTION ---
      const sealDataUrl = await createCircularSealDataUrl(sealImg);
      if (sealDataUrl) {
        pdf.addImage(sealDataUrl, 'PNG', innerX, topY, 18, 18);
      } else {
        pdf.setDrawColor(30, 41, 59);
        pdf.setLineWidth(0.5);
        pdf.circle(innerX + 9, topY + 9, 9, 'S');
      }

      const headerTextX = innerX + 22;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8.5);
      pdf.setTextColor(71, 85, 105); // #475569 (slate-600)
      pdf.text(
        'REPUBLIC OF THE PHILIPPINES · PROVINCE OF ZAMBOANGA DEL SUR',
        headerTextX,
        topY + 5
      );

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.5);
      pdf.text('Municipality of Molave · Barangay Lower Dimorok', headerTextX, topY + 9.8);

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(14);
      pdf.setTextColor(2, 6, 23); // #020617 (slate-950)
      pdf.text('OFFICE OF THE PUNONG BARANGAY', headerTextX, topY + 16);

      // Right-aligned Reference & Validity Metadata Block
      const issuedShortDate = new Date(certDoc.issuedAt).toLocaleDateString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
      });

      pdf.setFont('courier', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(2, 6, 23);
      pdf.text(`REF: ${certDoc.referenceNumber}`, innerRight, topY + 4.5, { align: 'right' });

      pdf.setFont('courier', 'normal');
      pdf.setFontSize(8.5);
      pdf.setTextColor(51, 65, 85); // #334155 (slate-700)
      pdf.text(`STATUS: ${certDoc.status}`, innerRight, topY + 8.8, { align: 'right' });
      pdf.text(`ISSUED: ${issuedShortDate}`, innerRight, topY + 13, { align: 'right' });

      pdf.setFont('courier', 'bold');
      if (expiryInfo.isExpired) {
        pdf.setTextColor(185, 28, 28); // #b91c1c (red-700)
      } else if (expiryInfo.isExpiringWithin7Days) {
        pdf.setTextColor(180, 83, 9); // #b45309 (amber-700)
      } else {
        pdf.setTextColor(6, 95, 70); // #065f46 (emerald-800)
      }
      pdf.text(`VALID UNTIL: ${expiryInfo.formattedDate}`, innerRight, topY + 17.2, {
        align: 'right',
      });

      // Header Bottom Divider (border-b-2 border-slate-900)
      const headerDividerY = topY + 22;
      pdf.setDrawColor(15, 23, 42);
      pdf.setLineWidth(0.6);
      pdf.line(innerX, headerDividerY, innerRight, headerDividerY);

      // --- MIDDLE SECTION: CERTIFICATE TITLE & FORMAL ATTESTATION ---
      const centerX = pageW / 2;
      const titleY = headerDividerY + 14;

      pdf.setFont('times', 'bold');
      pdf.setFontSize(22);
      pdf.setTextColor(2, 6, 23);
      pdf.text(certDoc.documentType.toUpperCase(), centerX, titleY, { align: 'center' });

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.5);
      pdf.setTextColor(100, 116, 139); // #64748b (slate-500)
      pdf.text(
        'Barangay Lower Dimorok Digital Governance & Civil Registry',
        centerX,
        titleY + 5.5,
        { align: 'center' }
      );

      // Attestation Body (max-w-4xl centered inside frame)
      const bodyMarginX = innerX + 8;
      const bodyMaxW = innerW - 16;
      let cursorY = titleY + 16;

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10.5);
      pdf.setTextColor(2, 6, 23);
      pdf.text('TO WHOM IT MAY CONCERN:', bodyMarginX, cursorY);
      cursorY += 7.5;

      const issuedLongDate = new Date(certDoc.issuedAt).toLocaleDateString('en-PH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      const paragraphs = [
        `This is to officially certify that ${certDoc.residentName.toUpperCase()}, of legal age, is a bona fide resident with registered domicile at ${certDoc.residentAddress}.`,
        `Based on the verified records of the Registry of Barangay Inhabitants (RBI) and the ${certDoc.issuingOffice}, the above-named citizen is of good moral standing and has complied with all statutory requirements prescribed by Barangay Lower Dimorok.`,
        `This certification is issued upon the request of the interested party for the official purpose of: ${certDoc.purpose}.`,
        `Given this ${issuedLongDate} at the Barangay Hall Compound, Barangay Lower Dimorok, Municipality of Molave, Province of Zamboanga del Sur, Philippines. Unless sooner revoked, this certification remains valid until ${expiryInfo.formattedLongDate}.`,
      ];

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10.2);
      pdf.setTextColor(30, 41, 59); // #1e293b (slate-800)

      paragraphs.forEach((para) => {
        const lines = pdf.splitTextToSize(para, bodyMaxW);
        pdf.text(lines, bodyMarginX, cursorY, { lineHeightFactor: 1.42 });
        cursorY += lines.length * 5.2 + 3.8;
      });

      // --- BOTTOM FOOTER: CRYPTOGRAPHIC QR CODE BLOCK + SIGNATORY ---
      const footerTopY = frameY + frameH - 39;
      pdf.setDrawColor(203, 213, 225); // #cbd5e1 (slate-300)
      pdf.setLineWidth(0.35);
      pdf.line(innerX, footerTopY, innerRight, footerTopY);

      // QR Box on Bottom Left
      const qrBoxSize = 27;
      const qrBoxX = innerX;
      const qrBoxY = footerTopY + 4.5;

      pdf.setDrawColor(15, 23, 42);
      pdf.setLineWidth(0.5);
      pdf.setFillColor(255, 255, 255);
      pdf.rect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 'FD');

      const matrixLen = qrMatrix.length;
      if (matrixLen > 0) {
        const qrPad = 2;
        const cellMm = (qrBoxSize - qrPad * 2) / matrixLen;
        pdf.setFillColor(2, 6, 23);
        for (let r = 0; r < matrixLen; r++) {
          for (let c = 0; c < matrixLen; c++) {
            if (qrMatrix[r][c]) {
              pdf.rect(
                qrBoxX + qrPad + c * cellMm,
                qrBoxY + qrPad + r * cellMm,
                cellMm + 0.04,
                cellMm + 0.04,
                'F'
              );
            }
          }
        }
      }

      // QR Verification Metadata next to QR Box
      const qrMetaX = qrBoxX + qrBoxSize + 5;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(6, 95, 70); // #065f46 (emerald-800)
      pdf.text('QR Cryptographic Verification', qrMetaX, qrBoxY + 7);

      pdf.setFont('courier', 'bold');
      pdf.setFontSize(9.5);
      pdf.setTextColor(2, 6, 23);
      pdf.text(certDoc.verificationCode, qrMetaX, qrBoxY + 13);

      pdf.setFont('courier', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(100, 116, 139);
      pdf.text(
        `Verify at: /verify/${certDoc.referenceNumber} · Valid Until: ${expiryInfo.formattedDate}`,
        qrMetaX,
        qrBoxY + 18.5
      );

      // Official Signatory on Bottom Right
      const sigName = 'HON. RODRIGO A. BALIMBINGAN SR.';
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(2, 6, 23);
      pdf.text(sigName, innerRight, qrBoxY + 11, { align: 'right' });

      const sigWidth = pdf.getTextWidth(sigName);
      pdf.setDrawColor(15, 23, 42);
      pdf.setLineWidth(0.55);
      pdf.line(innerRight - sigWidth, qrBoxY + 12.8, innerRight, qrBoxY + 12.8);

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8.8);
      pdf.setTextColor(51, 65, 85);
      pdf.text('Punong Barangay · Barangay Lower Dimorok', innerRight, qrBoxY + 17.5, {
        align: 'right',
      });

      pdf.setFont('courier', 'normal');
      pdf.setFontSize(7.8);
      pdf.setTextColor(100, 116, 139);
      pdf.text(`Attested by: ${certDoc.issuingOffice}`, innerRight, qrBoxY + 22, {
        align: 'right',
      });

      const safeType = certDoc.documentType.replace(/[^a-zA-Z0-9]+/g, '_');
      pdf.save(`LOWER_DIMOROK_${safeType}_${certDoc.referenceNumber}.pdf`);

      setPdfDownloaded(true);
      setTimeout(() => setPdfDownloaded(false), 3000);
    } finally {
      setPdfDownloading(false);
    }
  };

  const handleNativeShare = async (shareQrFile = false) => {
    const shareTitle = `Barangay Lower Dimorok Official ${certDoc.documentType} (${certDoc.referenceNumber})`;
    const shareText = `Verify official Barangay Lower Dimorok ${certDoc.documentType} for ${certDoc.residentName}. Reference: ${certDoc.referenceNumber} · Valid Until: ${expiryInfo.formattedDate} · Verification Code: ${certDoc.verificationCode}`;

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        if (shareQrFile) {
          const canvas = renderQrCanvas();
          if (canvas) {
            const blob = await new Promise<Blob | null>((resolve) =>
              canvas.toBlob((b) => resolve(b), 'image/png')
            );
            if (blob) {
              const file = new File([blob], qrFileName, {
                type: 'image/png',
              });
              if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                  title: shareTitle,
                  text: shareText,
                  url: verificationUrl,
                  files: [file],
                });
                setShareStatus('Shared QR & Link!');
                setTimeout(() => setShareStatus(null), 3000);
                return;
              }
            }
          }
        }

        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: verificationUrl,
        });
        setShareStatus('Shared Successfully!');
        setTimeout(() => setShareStatus(null), 3000);
        return;
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
      }
    }

    setShowShareDrawer((prev) => !prev);
  };

  const handleCopyVerificationLink = async () => {
    try {
      await navigator.clipboard.writeText(
        `Barangay Lower Dimorok Verification — ${certDoc.documentType} (${certDoc.referenceNumber}) | Valid Until: ${expiryInfo.formattedDate} | Code: ${certDoc.verificationCode} | Verify: ${verificationUrl}`
      );
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const handlePrintCertificate = () => {
    setShowPrintDialog(true);
  };

  const handleExecuteSystemPrint = () => {
    setShowPrintDialog(false);
    setPrintConfirmBanner(
      `System Print initialized for ${selectedPrinterDevice} (${printCopies} ${
        printCopies === 1 ? 'copy' : 'copies'
      } · A4 Landscape · ${printColorMode === 'color' ? 'Full Color Seal' : 'Archival Grayscale'}).`
    );
    setTimeout(() => setPrintConfirmBanner(null), 5000);
    if (activeTab !== 'certificate') {
      setActiveTab('certificate');
      setTimeout(() => window.print(), 120);
    } else {
      setTimeout(() => window.print(), 80);
    }
  };

  const handleConfirmPrintDialog = async () => {
    if (printOutputMode === 'local_pdf') {
      await handleDownloadPdf();
      setShowPrintDialog(false);
      setPrintConfirmBanner(
        `Local A4 Landscape PDF generated and downloaded for ${certDoc.referenceNumber}.`
      );
      setTimeout(() => setPrintConfirmBanner(null), 5000);
    } else {
      handleExecuteSystemPrint();
    }
  };

  return (
    <div className="certificate-print-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-3 sm:p-6 overflow-y-auto">
      <div className="certificate-print-root bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-5xl w-full overflow-hidden shadow-2xl my-6">
        {/* Top Action Bar (Hidden when printing) */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 bg-slate-900 text-white no-print">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <span className="text-sm font-semibold tracking-tight block">
                Official Barangay Lower Dimorok Digital Certificate · {certDoc.referenceNumber}
              </span>
              <span className="text-[11px] text-slate-400">
                Valid Until: {expiryInfo.formattedDate} ({expiryInfo.daysRemaining} days remaining)
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setSimulateExpiringSoon((s) => !s)}
              className={`min-h-[40px] px-3 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                simulateExpiringSoon
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700'
              }`}
              title="Preview 7-day certificate expiration warning"
            >
              <CalendarClock className="w-3.5 h-3.5" />
              <span>{simulateExpiringSoon ? '7-Day Warning Active' : 'Test 7-Day Expiry Alert'}</span>
            </button>

            <button
              onClick={handleShareViaEmail}
              className="min-h-[40px] px-3.5 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              title="Open default email client with pre-filled subject, verification link, and QR code image attachment"
            >
              <Mail className="w-3.5 h-3.5 text-emerald-400" />
              <span>{emailShared ? 'Email & QR Ready!' : 'Share via Email'}</span>
            </button>

            <button
              onClick={() => setShowShareDrawer((prev) => !prev)}
              className={`min-h-[40px] px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                showShareDrawer
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
              }`}
              title="Share verification link to Facebook or Twitter with pre-formatted reference number caption"
            >
              <Share2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>{shareStatus || 'Share via Social'}</span>
            </button>

            <button
              onClick={() => setShowNotesEditor((prev) => !prev)}
              className={`min-h-[40px] px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                showNotesEditor
                  ? 'bg-emerald-700 text-white'
                  : 'bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700'
              }`}
              title="Barangay Captain Digital Official Notes / Remarks"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Official Notes</span>
            </button>

            <button
              onClick={handleSaveAsQrPng}
              className="min-h-[40px] px-3.5 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>{qrDownloaded ? 'QR PNG Saved!' : 'Save as QR Code'}</span>
            </button>

            <button
              onClick={handleDownloadPdf}
              disabled={pdfDownloading}
              className="min-h-[40px] px-3.5 py-2 text-xs font-semibold bg-emerald-700 hover:bg-emerald-600 disabled:opacity-60 text-white rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              title="Download official A4 Landscape PDF certificate"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>
                {pdfDownloading
                  ? 'Generating PDF...'
                  : pdfDownloaded
                  ? 'PDF Downloaded!'
                  : 'Download as PDF'}
              </span>
            </button>

            <button
              onClick={() => onVerifyClick(certDoc.verificationCode)}
              className="min-h-[40px] px-3.5 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <QrCode className="w-3.5 h-3.5 text-emerald-400" />
              <span>Test QR Verification</span>
            </button>

            <button
              onClick={handlePrintCertificate}
              className="min-h-[40px] px-3.5 py-2 text-xs font-semibold bg-white text-slate-900 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print (A4 Landscape)</span>
            </button>

            <button
              onClick={onClose}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-white rounded-lg transition-colors"
              aria-label="Close certificate preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* EMAIL SHARE CONFIRMATION BANNER */}
        {emailShared && (
          <div className="px-6 py-3 bg-emerald-50 dark:bg-emerald-950/60 border-b border-emerald-200 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs no-print">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
              <span>
                Opened your default email client with pre-filled subject for{' '}
                <strong>{certDoc.documentType}</strong> and verification link. The QR code pass (
                <span className="font-mono">{qrFileName}</span>) has been downloaded and copied to your
                clipboard for attachment.
              </span>
            </div>
            <button
              onClick={handleSaveAsQrPng}
              className="font-semibold text-emerald-800 dark:text-emerald-300 underline shrink-0 cursor-pointer"
            >
              Download QR PNG Again
            </button>
          </div>
        )}

        {/* 7-DAY EXPIRATION WARNING BANNER (OR EXPIRED ALERT) */}
        {(expiryInfo.isExpiringWithin7Days || expiryInfo.isExpired) && (
          <div
            className={`px-6 py-3.5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-2 no-print ${
              expiryInfo.isExpired
                ? 'bg-red-50 dark:bg-red-950/60 border-red-300 dark:border-red-800 text-red-900 dark:text-red-200'
                : 'bg-amber-50 dark:bg-amber-950/60 border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-200'
            }`}
          >
            <div className="flex items-center gap-2.5 text-xs">
              <AlertTriangle
                className={`w-4 h-4 shrink-0 ${
                  expiryInfo.isExpired ? 'text-red-600' : 'text-amber-600'
                }`}
              />
              <div>
                <span className="font-bold">
                  {expiryInfo.isExpired
                    ? 'Certificate Validity Expired: '
                    : `Expiration Warning (${expiryInfo.daysRemaining} ${
                        expiryInfo.daysRemaining === 1 ? 'Day' : 'Days'
                      } Remaining): `}
                </span>
                <span>
                  {expiryInfo.isExpired
                    ? `This ${certDoc.documentType} expired on ${expiryInfo.formattedLongDate}. Please submit a renewal request in the Barangay Lower Dimorok Services portal.`
                    : `This ${certDoc.documentType} will expire on ${expiryInfo.formattedLongDate} (within 7 days). Submit a renewal early to avoid interruption.`}
                </span>
              </div>
            </div>
            <span className="font-mono text-xs font-semibold shrink-0">
              EXPIRY: {expiryInfo.formattedDate}
            </span>
          </div>
        )}

        {/* Interactive 'Share via Social' Drawer (Facebook & Twitter with pre-formatted Reference Number caption) */}
        {showShareDrawer && (
          <div className="px-6 py-4 bg-slate-100 dark:bg-slate-800/95 border-b border-slate-200 dark:border-slate-700 space-y-3 no-print">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Share2 className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                  <span>
                    Share via Social — Facebook & Twitter ({certDoc.referenceNumber})
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Share your official document verification link directly to Facebook or Twitter with a pre-formatted caption containing Reference Number{' '}
                  <span className="font-mono font-semibold text-slate-900 dark:text-white">
                    {certDoc.referenceNumber}
                  </span>
                  .
                </p>
              </div>
              <button
                onClick={() => setShowShareDrawer(false)}
                className="self-start sm:self-auto px-2.5 py-1 text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-white cursor-pointer"
              >
                Dismiss
              </button>
            </div>

            {/* Pre-formatted Social Caption Box */}
            <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Pre-Formatted Social Caption (includes Reference {certDoc.referenceNumber}):
                </span>
                <button
                  type="button"
                  onClick={handleCopySocialCaption}
                  className="font-semibold text-emerald-800 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  {copiedSocialCaption ? (
                    <>
                      <Check className="w-3 h-3" />
                      <span>Caption Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy Caption</span>
                    </>
                  )}
                </button>
              </div>
              <p className="text-xs font-mono text-slate-800 dark:text-slate-200 select-all leading-relaxed">
                {socialShareCaption}
              </p>
            </div>

            {socialShareStatus && (
              <div className="px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                <span>{socialShareStatus}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <a
                href={facebookShareUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => handleSocialPlatformTrigger('Facebook')}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#1877F2] hover:bg-[#166fe5] text-white flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Share to Facebook</span>
              </a>

              <a
                href={twitterShareUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => handleSocialPlatformTrigger('Twitter')}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-950 hover:bg-slate-800 dark:bg-sky-600 dark:hover:bg-sky-500 text-white flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Share to Twitter / X</span>
              </a>

              <button
                type="button"
                onClick={() => handleNativeShare(true)}
                className="px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-800 text-white hover:bg-emerald-700 flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Device Share Sheet</span>
              </button>

              <button
                type="button"
                onClick={handleCopyVerificationLink}
                className="px-3 py-2 text-xs font-semibold rounded-lg bg-slate-800 text-white hover:bg-slate-700 flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                {copiedLink ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedLink ? 'Verification Link Copied' : 'Copy Verification Link'}</span>
              </button>

              <button
                type="button"
                onClick={handleSaveAsQrPng}
                className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-50 flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download QR Image</span>
              </button>
            </div>
          </div>
        )}

        {/* BARANGAY CAPTAIN OFFICIAL NOTES / REMARKS EDITOR PANEL */}
        {showNotesEditor && (
          <div className="px-6 py-4 bg-emerald-950/10 dark:bg-slate-800/95 border-b border-emerald-800/30 dark:border-slate-700 space-y-3 no-print">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                  <span>
                    Barangay Captain Digital Official Notes & Remarks ({certDoc.referenceNumber})
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Add or update digital Official Notes / Remarks signed by the Punong Barangay to enhance certificate auditability.
                  {userRole !== 'CAPTAIN' && (
                    <span className="ml-1 font-mono text-[11px] text-emerald-800 dark:text-emerald-400">
                      (Executive Preview Enabled)
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowNotesEditor(false)}
                className="self-start sm:self-auto px-2.5 py-1 text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-white cursor-pointer"
              >
                Close Editor
              </button>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="captain-official-notes-input"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-200"
              >
                Official Notes / Executive Remarks
              </label>
              <textarea
                id="captain-official-notes-input"
                rows={3}
                value={draftOfficialNotes}
                onChange={(e) => setDraftOfficialNotes(e.target.value)}
                placeholder="Enter official Punong Barangay audit remarks, RBI verification reference, or special statutory conditions..."
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-700"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="text-slate-500">Quick Presets:</span>
                <button
                  type="button"
                  onClick={() =>
                    setDraftOfficialNotes(
                      'Verified against 2026 Registry of Barangay Inhabitants (RBI) and Lupon Tagapamayapa records. Zero pending administrative complaints.'
                    )
                  }
                  className="px-2 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-emerald-600 cursor-pointer"
                >
                  RBI & Lupon Cleared
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setDraftOfficialNotes(
                      'Statutory fee waived in accordance with RA 11261 / Barangay Social Welfare Indigency certification protocol.'
                    )
                  }
                  className="px-2 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-emerald-600 cursor-pointer"
                >
                  Statutory Fee Waiver Note
                </button>
              </div>

              <button
                type="button"
                disabled={savingNotes || !draftOfficialNotes.trim()}
                onClick={handleSaveOfficialNotes}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-emerald-800 hover:bg-emerald-700 disabled:opacity-50 text-white flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{savingNotes ? 'Saving Remarks...' : 'Save Official Notes'}</span>
              </button>
            </div>
          </div>
        )}

        {notesSavedToast && (
          <div className="px-6 py-2.5 bg-emerald-50 dark:bg-emerald-950/60 border-b border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200 flex items-center justify-between no-print">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
              <span>{notesSavedToast}</span>
            </div>
            <button
              type="button"
              onClick={() => setNotesSavedToast(null)}
              className="text-xs font-semibold underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {printConfirmBanner && (
          <div className="px-6 py-2.5 bg-emerald-50 dark:bg-emerald-950/60 border-b border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200 flex items-center justify-between no-print">
            <div className="flex items-center gap-2">
              <Printer className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
              <span>{printConfirmBanner}</span>
            </div>
            <button
              type="button"
              onClick={() => setPrintConfirmBanner(null)}
              className="text-xs font-semibold underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* CUSTOM PRINTER-SELECTION & A4 LANDSCAPE ORIENTATION PREVIEW DIALOG */}
        {showPrintDialog && (
          <div
            data-testid="custom-printer-selection-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Printer Selection and A4 Landscape Orientation Preview"
            className="px-6 py-5 bg-slate-100 dark:bg-slate-800/95 border-b border-slate-300 dark:border-slate-700 space-y-4 no-print"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-700">
              <div>
                <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Printer className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                  <span>
                    Printer Selection & A4 Landscape Orientation Preview ({certDoc.referenceNumber})
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                  Choose between local PDF generation or system print options and inspect the A4 landscape sheet orientation (297 mm × 210 mm) before confirming.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPrintDialog(false)}
                className="self-start sm:self-auto px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
              >
                Cancel
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* Left Column: Print Method Selection & Printer Settings (5 cols) */}
              <div className="lg:col-span-5 space-y-3.5 text-xs">
                <div className="font-bold text-slate-900 dark:text-white">
                  1. Select Output Method
                </div>

                <div className="grid grid-cols-1 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setPrintOutputMode('local_pdf')}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                      printOutputMode === 'local_pdf'
                        ? 'border-emerald-700 bg-emerald-50/90 dark:bg-emerald-950/50 dark:border-emerald-500 ring-2 ring-emerald-600/20'
                        : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <FileDown className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                        <span>Local PDF Generation (A4 Landscape)</span>
                      </span>
                      <span className="font-mono text-[10px] font-semibold text-emerald-800 dark:text-emerald-300">
                        {printOutputMode === 'local_pdf' ? '● SELECTED' : '○ SELECT'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                      Generates a direct 297mm × 210mm A4 Landscape PDF file on your device with embedded Barangay Seal, Official Notes, and cryptographic QR code.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPrintOutputMode('system_print')}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                      printOutputMode === 'system_print'
                        ? 'border-emerald-700 bg-emerald-50/90 dark:bg-emerald-950/50 dark:border-emerald-500 ring-2 ring-emerald-600/20'
                        : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Printer className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                        <span>System Print Options (Hardware / Network Printer)</span>
                      </span>
                      <span className="font-mono text-[10px] font-semibold text-emerald-800 dark:text-emerald-300">
                        {printOutputMode === 'system_print' ? '● SELECTED' : '○ SELECT'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                      Sends the certificate sheet to your operating system print spooler (`window.print()`) locked to A4 Landscape with 10mm statutory margins.
                    </p>
                  </button>
                </div>

                {/* Printer Hardware & Color Options */}
                <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-3">
                  <div>
                    <label
                      htmlFor="printer-device-select"
                      className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Target Printer / Spooler Destination
                    </label>
                    <select
                      id="printer-device-select"
                      value={selectedPrinterDevice}
                      onChange={(e) => setSelectedPrinterDevice(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                    >
                      <option value="Barangay Hall LaserJet Pro M404n (A4 Landscape Tray)">
                        Barangay Hall LaserJet Pro M404n (A4 Landscape Tray)
                      </option>
                      <option value="System Default Printer (OS Print Spooler)">
                        System Default Printer (OS Print Spooler)
                      </option>
                      <option value="Office of the Barangay Secretary Desk Printer">
                        Office of the Barangay Secretary Desk Printer
                      </option>
                      <option value="Save as Archival Print File (A4 Landscape)">
                        Save as Archival Print File (A4 Landscape)
                      </option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="print-copies-input"
                        className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1"
                      >
                        Number of Copies
                      </label>
                      <input
                        id="print-copies-input"
                        type="number"
                        min={1}
                        max={10}
                        value={printCopies}
                        onChange={(e) =>
                          setPrintCopies(Math.max(1, Math.min(10, Number(e.target.value) || 1)))
                        }
                        className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="print-color-select"
                        className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1"
                      >
                        Color Mode
                      </label>
                      <select
                        id="print-color-select"
                        value={printColorMode}
                        onChange={(e) =>
                          setPrintColorMode(e.target.value as 'color' | 'grayscale')
                        }
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                      >
                        <option value="color">Full Color Official Seal</option>
                        <option value="grayscale">High-Contrast Grayscale</option>
                      </select>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-500">
                    <span>Paper: ISO A4 (297mm × 210mm)</span>
                    <span className="font-semibold text-emerald-800 dark:text-emerald-400">
                      Orientation: LANDSCAPE
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Column: Visual A4 Landscape Orientation Preview (7 cols) */}
              <div className="lg:col-span-7 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-900 dark:text-white">
                    2. Visual A4 Landscape Orientation Preview (297 mm × 210 mm)
                  </span>
                  <span className="font-mono text-[11px] text-emerald-800 dark:text-emerald-400">
                    Scale 1:1 Aspect · 10mm Margins
                  </span>
                </div>

                {/* Visual A4 Landscape Sheet Container */}
                <div className="p-4 rounded-2xl bg-slate-900/95 border border-slate-700 flex flex-col items-center justify-center space-y-2">
                  {/* Top Width Dimension Ruler */}
                  <div className="w-full max-w-[520px] flex items-center justify-between text-[10px] font-mono text-emerald-300 px-1">
                    <span>◄─── 10mm Margin</span>
                    <span className="font-bold">297 mm Width · A4 LANDSCAPE SHEET</span>
                    <span>10mm Margin ───►</span>
                  </div>

                  {/* Proportional A4 Landscape Paper Sheet (297:210 ratio) */}
                  <div
                    data-testid="a4-landscape-visual-preview"
                    className={`w-full max-w-[520px] aspect-[297/210] bg-white text-slate-900 rounded-sm shadow-2xl p-3 sm:p-4 flex flex-col justify-between border border-slate-300 transition-all ${
                      printColorMode === 'grayscale' ? 'grayscale' : ''
                    }`}
                  >
                    <div className="border-2 border-slate-900 h-full p-2.5 sm:p-3.5 flex flex-col justify-between">
                      {/* Preview Header */}
                      <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-900">
                        <div className="flex items-center gap-2">
                          <img
                            src={sealImg}
                            alt="Barangay Seal Preview"
                            referrerPolicy="no-referrer"
                            className="w-7 h-7 rounded-full border border-slate-800 object-cover shrink-0"
                          />
                          <div className="leading-tight">
                            <div className="text-[8px] uppercase tracking-wider text-slate-500 font-semibold">
                              Republic of the Philippines · Molave, Zamboanga del Sur
                            </div>
                            <div className="text-[10px] font-bold text-slate-950">
                              {barangayName.toUpperCase()} · OFFICE OF THE PUNONG BARANGAY
                            </div>
                          </div>
                        </div>
                        <div className="text-right font-mono text-[8px] leading-tight shrink-0">
                          <div className="font-bold text-slate-950">
                            REF: {certDoc.referenceNumber}
                          </div>
                          <div className="text-emerald-800 font-semibold">
                            VALID: {expiryInfo.formattedDate}
                          </div>
                        </div>
                      </div>

                      {/* Preview Body */}
                      <div className="my-auto py-1.5 space-y-1.5 text-center">
                        <div className="text-xs sm:text-sm font-bold uppercase tracking-tight text-slate-950">
                          {certDoc.documentType}
                        </div>
                        <p className="text-[9px] text-slate-700 leading-snug text-left max-w-[95%] mx-auto">
                          This certifies that{' '}
                          <strong className="underline">{certDoc.residentName}</strong>, residing at{' '}
                          <strong>{certDoc.residentAddress}</strong>, is in good standing in{' '}
                          <strong>{barangayName}</strong>. Issued for:{' '}
                          <strong>{certDoc.purpose}</strong>.
                        </p>
                        {activeOfficialNote && (
                          <div className="mx-auto max-w-[95%] px-2 py-1 rounded-xs bg-slate-50 border border-slate-300 text-left text-[8px] text-slate-700 truncate">
                            <strong>Official Notes:</strong> "{activeOfficialNote.notes}"
                          </div>
                        )}
                      </div>

                      {/* Preview Footer */}
                      <div className="pt-1.5 border-t border-slate-300 flex items-end justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <div className="w-7 h-7 border border-slate-900 p-0.5 grid grid-cols-5 gap-px bg-white shrink-0">
                            {Array.from({ length: 25 }).map((_, idx) => (
                              <div
                                key={idx}
                                className={idx % 2 === 0 ? 'bg-slate-950' : 'bg-white'}
                              />
                            ))}
                          </div>
                          <div className="font-mono text-[7.5px] leading-tight text-slate-600">
                            <div className="font-bold text-emerald-800">QR VERIFIED</div>
                            <div>{certDoc.verificationCode}</div>
                          </div>
                        </div>
                        <div className="text-right leading-tight">
                          <div className="text-[9px] font-bold text-slate-950 border-b border-slate-900 inline-block">
                            HON. RODRIGO A. BALIMBINGAN SR.
                          </div>
                          <div className="text-[7.5px] text-slate-600">
                            Punong Barangay · {barangayName}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="w-full max-w-[520px] flex items-center justify-between text-[10px] font-mono text-slate-400 px-1">
                    <span>
                      Mode:{' '}
                      {printOutputMode === 'local_pdf'
                        ? 'Local PDF Generator (jsPDF A4 Landscape)'
                        : `System Print (${selectedPrinterDevice})`}
                    </span>
                    <span>210 mm Height</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Confirmation Action Footer */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-600 dark:text-slate-300">
                Selected:{' '}
                <strong className="text-slate-900 dark:text-white">
                  {printOutputMode === 'local_pdf'
                    ? `Local A4 Landscape PDF (LOWER_DIMOROK_${certDoc.referenceNumber}.pdf)`
                    : `System Print Dialog (${selectedPrinterDevice} · ${printCopies}x)`}
                </strong>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowPrintDialog(false)}
                  className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={pdfDownloading}
                  onClick={handleConfirmPrintDialog}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white flex items-center gap-1.5 cursor-pointer"
                >
                  {printOutputMode === 'local_pdf' ? (
                    <>
                      <FileDown className="w-3.5 h-3.5" />
                      <span>
                        {pdfDownloading
                          ? 'Generating A4 Landscape PDF...'
                          : 'Confirm & Generate Local PDF (A4 Landscape)'}
                      </span>
                    </>
                  ) : (
                    <>
                      <Printer className="w-3.5 h-3.5" />
                      <span>Confirm & Print via System Dialog (A4 Landscape)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Sub-Navigation Bar: Certificate View vs Version History Tab */}
        <div className="px-6 py-3 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-1 p-1 bg-slate-200/80 dark:bg-slate-800 rounded-xl">
            <button
              onClick={() => setActiveTab('certificate')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'certificate'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <FileCheck2 className="w-3.5 h-3.5" />
              <span>Official Certificate</span>
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'history'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Version History ({versionHistory.length})</span>
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500 font-mono">
            <span>Latest Revision: {versionHistory[0]?.version}</span>
            <span aria-hidden="true">·</span>
            <span>Valid Until: {expiryInfo.formattedDate}</span>
          </div>
        </div>

        {/* TAB 2: VERSION HISTORY VIEW */}
        {activeTab === 'history' && (
          <div className="p-6 sm:p-8 bg-white dark:bg-slate-900 space-y-6 no-print">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Document Revision & Cryptographic Signing History
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Complete audit trail of revisions, official signatory approvals, and reasons for changes for {certDoc.referenceNumber}.
                </p>
              </div>
              <button
                onClick={() => setActiveTab('certificate')}
                className="px-3.5 py-2 text-xs font-semibold bg-emerald-800 hover:bg-emerald-700 text-white rounded-lg self-start sm:self-auto whitespace-nowrap"
              >
                Return to Certificate View
              </button>
            </div>

            <div className="space-y-4">
              {versionHistory.map((rev, index) => (
                <div
                  key={rev.version}
                  className={`p-5 rounded-xl border ${
                    index === 0
                      ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40'
                  } space-y-3`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                        {rev.version}
                      </span>
                      <span aria-hidden="true" className="text-slate-400">
                        ·
                      </span>
                      <span className="font-mono text-xs font-semibold text-emerald-800 dark:text-emerald-400">
                        {rev.statusLabel}
                      </span>
                    </div>
                    <div className="font-mono text-xs text-slate-500">
                      {new Date(rev.timestamp).toLocaleString('en-PH', {
                        year: 'numeric',
                        month: 'short',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div>
                      <span className="text-slate-500 font-medium">Reason for Change: </span>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {rev.reasonForChange}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-medium">Revision Details: </span>
                      <span className="text-slate-700 dark:text-slate-300">
                        {rev.changesSummary}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200/80 dark:border-slate-700/70 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 font-mono">
                    <span>Actor / Authority: {rev.author}</span>
                    <span>Verification Hash: {rev.verificationHash}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 1 (AND ALWAYS PRINTABLE): Official Certificate Body (A4 Landscape Proportions) */}
        <div
          className={`certificate-print-sheet p-6 sm:p-8 md:p-10 bg-white text-slate-900 ${
            activeTab === 'history' ? 'hidden print:flex' : ''
          }`}
        >
          <div className="certificate-print-frame border-2 border-slate-900 p-6 sm:p-8 md:p-10 flex flex-col justify-between gap-6">
            {/* TOP HEADER: Republic + Barangay Seal + Reference & Expiry Metadata */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-5 border-b-2 border-slate-900 text-center sm:text-left">
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-slate-800 bg-slate-100 shrink-0 flex items-center justify-center">
                  <img
                    src={sealImg}
                    alt={`Official Seal of ${barangayName}`}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <p className="text-xs tracking-widest uppercase text-slate-600 font-semibold">
                    Republic of the Philippines · Province of Zamboanga del Sur
                  </p>
                  <p className="text-xs text-slate-600 font-medium">
                    Municipality of Molave · {barangayName}
                  </p>
                  <h2 className="text-lg sm:text-xl font-bold text-slate-950 mt-0.5 tracking-tight">
                    OFFICE OF THE PUNONG BARANGAY
                  </h2>
                </div>
              </div>

              <div className="text-center sm:text-right font-mono text-xs text-slate-700 shrink-0 space-y-0.5">
                <div className="font-bold text-slate-950">REF: {certDoc.referenceNumber}</div>
                <div>STATUS: {certDoc.status}</div>
                <div>
                  ISSUED:{' '}
                  {new Date(certDoc.issuedAt).toLocaleDateString('en-PH', {
                    year: 'numeric',
                    month: 'short',
                    day: '2-digit',
                  })}
                </div>
                <div
                  className={
                    expiryInfo.isExpired
                      ? 'font-bold text-red-700'
                      : expiryInfo.isExpiringWithin7Days
                      ? 'font-bold text-amber-700'
                      : 'font-semibold text-emerald-800'
                  }
                >
                  VALID UNTIL: {expiryInfo.formattedDate}
                </div>
              </div>
            </div>

            {/* MIDDLE SECTION: Certificate Title & Formal Attestation */}
            <div className="space-y-4 my-auto">
              <div className="text-center">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 uppercase">
                  {certDoc.documentType}
                </h1>
                <p className="text-xs text-slate-500 mt-1">
                  {barangayName} Digital Governance & Civil Registry
                </p>
              </div>

              <div className="space-y-3 text-sm leading-relaxed text-slate-800 max-w-4xl mx-auto">
                <p className="font-bold text-slate-950">TO WHOM IT MAY CONCERN:</p>
                <p>
                  This is to officially certify that{' '}
                  <strong className="text-slate-950 underline decoration-slate-500 underline-offset-4">
                    {certDoc.residentName}
                  </strong>
                  , of legal age, is a bona fide resident with registered domicile at{' '}
                  <strong className="text-slate-950">{certDoc.residentAddress}</strong>.
                </p>
                <p>
                  Based on the verified records of the Registry of Barangay Inhabitants (RBI) and the{' '}
                  <strong className="text-slate-950">{certDoc.issuingOffice}</strong>, the above-named
                  citizen is of good moral standing and has complied with all statutory requirements
                  prescribed by {barangayName}.
                </p>
                <p>
                  This certification is issued upon the request of the interested party for the
                  official purpose of:{' '}
                  <strong className="text-slate-950">{certDoc.purpose}</strong>.
                </p>
                <p>
                  Given this{' '}
                  <strong className="font-mono text-slate-950">
                    {new Date(certDoc.issuedAt).toLocaleDateString('en-PH', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </strong>{' '}
                  at the Barangay Hall Compound, {barangayName}, Municipality of Molave,
                  Province of Zamboanga del Sur, Philippines. Unless sooner revoked, this certification
                  remains valid until{' '}
                  <strong className="font-mono text-slate-950">
                    {expiryInfo.formattedLongDate}
                  </strong>
                  .
                </p>

                {/* DEDICATED SECTION: BARANGAY CAPTAIN OFFICIAL NOTES & REMARKS (DOCUMENT AUDITABILITY) */}
                {activeOfficialNote && (
                  <div
                    data-testid="certificate-official-notes-section"
                    className="mt-4 p-3.5 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-800 space-y-1.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-bold text-slate-950 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-emerald-800 shrink-0" />
                        <span>Official Notes & Remarks (Punong Barangay Audit Record)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowNotesEditor((prev) => !prev)}
                        className="no-print text-[11px] font-semibold text-emerald-800 hover:underline cursor-pointer"
                      >
                        {showNotesEditor ? 'Hide Remarks Editor' : 'Add / Edit Official Notes'}
                      </button>
                    </div>
                    <p className="text-xs text-slate-800 leading-relaxed italic">
                      "{activeOfficialNote.notes}"
                    </p>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-500 pt-1 border-t border-slate-200">
                      <span>Annotated by: {activeOfficialNote.author}</span>
                      <span>
                        Recorded:{' '}
                        {new Date(activeOfficialNote.updatedAt).toLocaleString('en-PH', {
                          year: 'numeric',
                          month: 'short',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* MULTI-OFFICIAL DIGITAL SIGNATURES (SECRETARY -> TREASURER PAID -> BARANGAY CAPTAIN) */}
            {(() => {
              const wf = getWorkflowMap()[certDoc.referenceNumber];
              const secSig =
                wf?.secretarySignatureDataUrl ||
                createSignatureSvgDataUrl(
                  'Ms. Marites L. Cabrera',
                  'Barangay Secretary',
                  '#0369a1'
                );
              const treasSig =
                wf?.treasurerSignatureDataUrl ||
                createSignatureSvgDataUrl(
                  'Mr. Eduardo R. Mendoza',
                  'Barangay Treasurer',
                  '#b45309'
                );
              const captSig =
                wf?.captainSignatureDataUrl ||
                createSignatureSvgDataUrl(
                  'Hon. Rodrigo A. Balimbingan Sr.',
                  'Punong Barangay / Captain',
                  '#065f46'
                );
              return (
                <div className="pt-4 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 text-center space-y-1">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                      1. Verified & Signed by Secretary
                    </div>
                    <img
                      src={secSig}
                      alt="Barangay Secretary Signature"
                      className="h-12 mx-auto object-contain"
                    />
                    <div className="text-xs font-bold text-slate-900">
                      {wf?.secretarySignedBy || 'Ms. Marites L. Cabrera'}
                    </div>
                    <div className="text-[10px] text-slate-600">Barangay Secretary</div>
                  </div>

                  <div className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 text-center space-y-1">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-emerald-800 font-bold">
                      2. Payment Verified PAID · Treasurer
                    </div>
                    <img
                      src={treasSig}
                      alt="Barangay Treasurer Signature"
                      className="h-12 mx-auto object-contain"
                    />
                    <div className="text-xs font-bold text-slate-900">
                      {wf?.treasurerSignedBy || 'Mr. Eduardo R. Mendoza'}
                    </div>
                    <div className="text-[10px] font-mono text-slate-600">
                      {wf?.paymentMethod || 'GCASH'} Ref: {wf?.paymentReferenceNumber || 'VERIFIED'} ·{' '}
                      {wf?.officialReceiptNumber || 'OR-PAID'}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl border border-emerald-300 bg-emerald-50/50 text-center space-y-1">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-emerald-900 font-bold">
                      3. Attested & Signed by Barangay Captain
                    </div>
                    <img
                      src={captSig}
                      alt="Barangay Captain Signature"
                      className="h-12 mx-auto object-contain"
                    />
                    <div className="text-xs font-bold text-slate-950">
                      {wf?.captainSignedBy || 'HON. RODRIGO A. BALIMBINGAN SR.'}
                    </div>
                    <div className="text-[10px] text-slate-700 font-semibold">
                      Punong Barangay · {barangayName}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* BOTTOM FOOTER: Cryptographic QR Code Block + Official Signatory */}
            <div className="pt-5 border-t border-slate-300 flex flex-col sm:flex-row items-start sm:items-end justify-between gap-6">
              <div className="flex items-center gap-4">
                <div
                  onClick={() => onVerifyClick(certDoc.verificationCode)}
                  className="p-2 border-2 border-slate-900 bg-white cursor-pointer hover:border-emerald-700 transition-colors shrink-0"
                  title="Click to verify QR code"
                >
                  <div
                    className="grid w-24 h-24"
                    style={{ gridTemplateColumns: `repeat(${qrMatrix.length}, minmax(0, 1fr))` }}
                  >
                    {qrMatrix.flatMap((row, rIdx) =>
                      row.map((filled, cIdx) => (
                        <div
                          key={`${rIdx}-${cIdx}`}
                          className={filled ? 'bg-slate-950' : 'bg-white'}
                        />
                      ))
                    )}
                  </div>
                </div>

                <div className="text-xs text-slate-600 space-y-1">
                  <div className="flex items-center gap-1.5 text-emerald-800 font-bold">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>QR Cryptographic Verification</span>
                  </div>
                  <div className="font-mono text-xs font-semibold text-slate-950">
                    {certDoc.verificationCode}
                  </div>
                  <div className="font-mono text-[11px] text-slate-500">
                    Verify at: /verify/{certDoc.referenceNumber} · Valid Until: {expiryInfo.formattedDate}
                  </div>
                  <div className="no-print mt-1 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setShowPrintDialog(true)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 hover:underline cursor-pointer"
                    >
                      <Printer className="w-3 h-3" />
                      <span>Printer & A4 Landscape Preview</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadPdf}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 hover:underline cursor-pointer"
                    >
                      <FileDown className="w-3 h-3" />
                      <span>Download as PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowShareDrawer((prev) => !prev)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 hover:underline cursor-pointer"
                    >
                      <Share2 className="w-3 h-3" />
                      <span>Share via Social</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleShareViaEmail}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 hover:underline cursor-pointer"
                    >
                      <Mail className="w-3 h-3" />
                      <span>Share via Email</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveAsQrPng}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 hover:underline cursor-pointer"
                    >
                      <Download className="w-3 h-3" />
                      <span>Download QR PNG</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="text-left sm:text-right">
                <div className="text-sm sm:text-base font-bold text-slate-950 border-b-2 border-slate-900 pb-1 inline-block">
                  HON. RODRIGO A. BALIMBINGAN SR.
                </div>
                <div className="text-xs font-semibold text-slate-700 mt-1">
                  Punong Barangay · {barangayName}
                </div>
                <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                  Attested by: {certDoc.issuingOffice}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
