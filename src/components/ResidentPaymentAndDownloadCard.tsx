import React, { useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  CreditCard,
  Download,
  FileUp,
  QrCode,
  Receipt,
  ShieldCheck,
} from 'lucide-react';
import {
  BarangaySettings,
  IssuedDocument,
  ServiceRequestItem,
  UserRole,
} from '../types.ts';
import {
  CertificateWorkflowRecord,
  createSamplePaymentReceiptDataUrl,
  DEFAULT_PAYMAYA_QR_SVG_DATA_URL,
  getStageBadgeMeta,
  getWorkflowForRequest,
  saveWorkflowRecord,
  WalletPaymentMethod,
} from '../utils/certificateWorkflow.ts';

interface ResidentPaymentAndDownloadCardProps {
  request: ServiceRequestItem;
  workflow?: CertificateWorkflowRecord;
  workflowRecord?: CertificateWorkflowRecord;
  barangaySettings: BarangaySettings;
  matchedDocument?: IssuedDocument | null;
  matchingDoc?: IssuedDocument | null;
  authHeaders?: Record<string, string>;
  onWorkflowUpdated?: (updatedMap: Record<string, CertificateWorkflowRecord>) => void;
  onSaveWorkflow?: (updatedRecord: CertificateWorkflowRecord) => void;
  onRefreshData?: () => void;
  onSwitchRole: (role: UserRole) => void;
  onOpenCertificate: (doc: IssuedDocument) => void;
}

export const ResidentPaymentAndDownloadCard: React.FC<
  ResidentPaymentAndDownloadCardProps
> = ({
  request,
  workflow: propWorkflow,
  workflowRecord,
  barangaySettings,
  matchedDocument: propMatchedDoc,
  matchingDoc,
  authHeaders = {},
  onWorkflowUpdated,
  onSaveWorkflow,
  onRefreshData,
  onSwitchRole,
  onOpenCertificate,
}) => {
  const workflow: CertificateWorkflowRecord =
    propWorkflow || workflowRecord || getWorkflowForRequest(request);
  const matchedDocument = propMatchedDoc || matchingDoc || null;

  const [selectedWallet, setSelectedWallet] = useState<WalletPaymentMethod>(
    workflow?.paymentMethod || 'GCASH'
  );
  const [referenceInput, setReferenceInput] = useState<string>(
    workflow?.paymentReferenceNumber || ''
  );
  const [receiptImageDataUrl, setReceiptImageDataUrl] = useState<string>(
    workflow?.paymentReceiptDataUrl || ''
  );
  const [receiptFileName, setReceiptFileName] = useState<string>(
    workflow?.paymentReceiptDataUrl ? 'payment_receipt_screenshot.png' : ''
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const stageMeta = getStageBadgeMeta(workflow.stage);

  const gcashNumber = barangaySettings.gcashNumber || '0917-550-0911';
  const paymayaNumber = barangaySettings.paymayaNumber || '0918-880-2409';
  const activeAccountNumber =
    selectedWallet === 'GCASH' ? gcashNumber : paymayaNumber;
  const activeQrDataUrl =
    selectedWallet === 'GCASH'
      ? barangaySettings.gcashQrCodeDataUrl
      : barangaySettings.paymayaQrCodeDataUrl || DEFAULT_PAYMAYA_QR_SVG_DATA_URL;

  const handleReceiptFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReceiptFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setReceiptImageDataUrl(reader.result);
        setErrorMsg(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAttachSampleScreenshot = () => {
    const generatedRef =
      referenceInput.trim() ||
      `${selectedWallet}-2026-${Math.floor(1000000 + Math.random() * 8999999)}`;
    if (!referenceInput.trim()) {
      setReferenceInput(generatedRef);
    }
    const sampleUrl = createSamplePaymentReceiptDataUrl(
      selectedWallet,
      generatedRef,
      request.fee || 50,
      activeAccountNumber
    );
    setReceiptImageDataUrl(sampleUrl);
    setReceiptFileName(`${selectedWallet.toLowerCase()}_receipt_${request.referenceNumber}.png`);
    setErrorMsg(null);
  };

  const handleSubmitResidentPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanRef = referenceInput.trim();
    if (!cleanRef) {
      setErrorMsg(
        `Please enter your ${selectedWallet === 'GCASH' ? 'GCash' : 'PayMaya'} Payment Reference Number.`
      );
      return;
    }
    if (!receiptImageDataUrl) {
      setErrorMsg('Please upload your payment screenshot / receipt before submitting.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    const nowIso = new Date().toISOString();

    const updatedRecord: CertificateWorkflowRecord = {
      ...workflow,
      referenceNumber: request.referenceNumber,
      requestId: request.id,
      stage: 'TREASURER_VERIFY_AND_SIGN',
      paymentMethod: selectedWallet,
      paymentAccountNumber: activeAccountNumber,
      paymentReferenceNumber: cleanRef,
      paymentReceiptDataUrl: receiptImageDataUrl,
      paymentSubmittedAt: nowIso,
      updatedAt: nowIso,
    };
    const nextMap = saveWorkflowRecord(updatedRecord);
    if (onWorkflowUpdated) {
      onWorkflowUpdated(nextMap);
    }
    if (onSaveWorkflow) {
      onSaveWorkflow(updatedRecord);
    }

    try {
      await fetch(`/api/service-requests/${request.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          status: 'UNDER_REVIEW',
          paymentStatus: 'PENDING',
          paymentReference: cleanRef,
          reviewerNotes: `Resident paid via ${selectedWallet} (${activeAccountNumber}) with Reference No. ${cleanRef} and uploaded receipt screenshot. Routed to Barangay Treasurer for verification.`,
        }),
      });
    } catch {
      // Local state already persisted
    }

    if (onRefreshData) {
      onRefreshData();
    }
    setSubmitting(false);
    onSwitchRole('TREASURER');
  };

  const handleOpenAndDownloadCertificate = () => {
    if (matchedDocument) {
      onOpenCertificate(matchedDocument);
      return;
    }
    // Synthesize IssuedDocument if not yet loaded from server list
    const nowIso = new Date().toISOString();
    const fallbackDoc: IssuedDocument = {
      id: request.id,
      referenceNumber: request.referenceNumber,
      verificationCode: `DGV-LD-${request.referenceNumber.replace('BD-', '')}-SIGN`,
      requestId: request.id,
      userUid: request.userUid,
      residentName: request.residentName,
      residentAddress: `${request.residentPurok}, ${barangaySettings.barangayName}, Molave, Zamboanga del Sur`,
      documentType: request.serviceName,
      issuingOffice: request.office,
      signatory: 'Hon. Rodrigo A. Balimbingan Sr. — Punong Barangay',
      purpose: request.purpose,
      status: 'VALID',
      issuedAt: workflow.captainSignedAt || nowIso,
      expiryDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
    };
    onOpenCertificate(fallbackDoc);
  };

  return (
    <div className="mt-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-3">
      {/* Workflow Progress Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            <span>{stageMeta.label}</span>
          </span>
          <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
            {stageMeta.description}
          </p>
        </div>
      </div>

      {/* 3-Signature Status Strip */}
      <div className="grid grid-cols-3 gap-1.5 text-[10px]">
        <div
          className={`p-2 rounded-lg border ${
            workflow.secretaryApproved
              ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500'
          }`}
        >
          <div className="font-bold">1. Secretary</div>
          <div>{workflow.secretaryApproved ? '✓ Signed' : 'Pending'}</div>
        </div>
        <div
          className={`p-2 rounded-lg border ${
            workflow.treasurerVerifiedPaid
              ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500'
          }`}
        >
          <div className="font-bold">2. Treasurer</div>
          <div>
            {workflow.treasurerVerifiedPaid
              ? '✓ PAID & Signed'
              : workflow.treasurerReceivedForPayment
              ? 'Awaiting Payment'
              : 'Pending'}
          </div>
        </div>
        <div
          className={`p-2 rounded-lg border ${
            workflow.captainApprovedAndSigned
              ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500'
          }`}
        >
          <div className="font-bold">3. Brgy. Captain</div>
          <div>{workflow.captainApprovedAndSigned ? '✓ Signed' : 'Pending'}</div>
        </div>
      </div>

      {/* STEP 3: RESIDENT PAYMENT VIA GCASH OR PAYMAYA */}
      {workflow.stage === 'RESIDENT_PAYMENT_SELECTION' && (
        <form
          onSubmit={handleSubmitResidentPayment}
          className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border-2 border-emerald-600/70 space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <CreditCard className="w-4 h-4 text-emerald-700" />
              <span>
                Certificate Payment Required (PHP {(request.fee || 50).toFixed(2)})
              </span>
            </span>
            <span className="text-[10px] font-mono font-semibold text-emerald-800 dark:text-emerald-400">
              Returned by Barangay Treasurer
            </span>
          </div>

          {/* Select GCash or PayMaya */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              1. Select e-Wallet Payment Method (GCash or PayMaya)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSelectedWallet('GCASH')}
                className={`p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                  selectedWallet === 'GCASH'
                    ? 'border-sky-600 bg-sky-50/90 dark:bg-sky-950/50 text-sky-950 dark:text-white ring-2 ring-sky-500/20'
                    : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="text-xs font-bold">GCash</div>
                <div className="font-mono text-[10px] text-sky-700 dark:text-sky-300">
                  {gcashNumber}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedWallet('PAYMAYA')}
                className={`p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                  selectedWallet === 'PAYMAYA'
                    ? 'border-emerald-600 bg-emerald-50/90 dark:bg-emerald-950/50 text-emerald-950 dark:text-white ring-2 ring-emerald-500/20'
                    : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="text-xs font-bold">PayMaya (Maya)</div>
                <div className="font-mono text-[10px] text-emerald-700 dark:text-emerald-300">
                  {paymayaNumber}
                </div>
              </button>
            </div>
          </div>

          {/* Display QR Code + Account Number */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-center gap-3">
            <div className="p-2 rounded-xl bg-white border border-slate-200 shrink-0">
              <img
                src={activeQrDataUrl}
                alt={`${selectedWallet} Official QR Code`}
                className="w-28 h-28 object-contain"
              />
            </div>
            <div className="text-xs space-y-1 text-center sm:text-left">
              <div className="font-bold text-slate-900 dark:text-white flex items-center justify-center sm:justify-start gap-1">
                <QrCode className="w-3.5 h-3.5 text-emerald-700" />
                <span>
                  Official {selectedWallet === 'GCASH' ? 'GCash' : 'PayMaya'} QR Code
                </span>
              </div>
              <div className="font-mono text-xs font-bold text-emerald-800 dark:text-emerald-300">
                {selectedWallet === 'GCASH' ? 'GCash Number: ' : 'PayMaya Number: '}
                {activeAccountNumber}
              </div>
              <div className="text-[11px] text-slate-500">
                Account Name:{' '}
                <strong>
                  {selectedWallet === 'GCASH'
                    ? barangaySettings.gcashAccountName
                    : barangaySettings.paymayaAccountName ||
                      'Barangay Lower Dimorok Treasury'}
                </strong>
              </div>
              <div className="text-[11px] font-mono text-slate-700 dark:text-slate-300">
                Amount to Pay: <strong>PHP {(request.fee || 50).toFixed(2)}</strong>
              </div>
            </div>
          </div>

          {/* Upload Screenshot or Receipt */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
              2. Upload Payment Screenshot or Official Receipt
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <label className="px-3 py-2 rounded-xl bg-slate-900 dark:bg-slate-700 text-white text-xs font-semibold cursor-pointer flex items-center gap-1.5 hover:bg-slate-800">
                <FileUp className="w-3.5 h-3.5" />
                <span>Upload Screenshot / Receipt</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleReceiptFileUpload}
                  className="hidden"
                />
              </label>

              <button
                type="button"
                onClick={handleAttachSampleScreenshot}
                className="px-3 py-2 rounded-xl border border-emerald-600 text-emerald-800 dark:text-emerald-300 text-xs font-semibold hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer"
              >
                Generate Sample {selectedWallet} Receipt
              </button>
            </div>

            {receiptImageDataUrl && (
              <div className="mt-2 p-2 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 flex items-center gap-2.5">
                <img
                  src={receiptImageDataUrl}
                  alt="Uploaded Payment Receipt"
                  className="h-16 w-auto rounded border border-slate-300 bg-white object-contain"
                />
                <div className="text-[11px]">
                  <span className="font-bold text-emerald-900 dark:text-emerald-300 block">
                    ✓ Receipt Screenshot Attached
                  </span>
                  <span className="font-mono text-slate-500 truncate block max-w-[180px]">
                    {receiptFileName || 'receipt_screenshot.png'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Enter Payment Reference Number */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
              3. Enter {selectedWallet === 'GCASH' ? 'GCash' : 'PayMaya'} Reference Number
            </label>
            <input
              type="text"
              value={referenceInput}
              onChange={(e) => setReferenceInput(e.target.value)}
              placeholder={`e.g. ${selectedWallet}-2026-9084125`}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-xs text-slate-900 dark:text-white"
            />
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-[11px] text-red-700 dark:text-red-300 font-medium">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 px-4 rounded-xl bg-emerald-800 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-sm"
          >
            <Receipt className="w-4 h-4" />
            <span>
              {submitting
                ? 'Submitting Payment to Treasurer...'
                : 'Submit Payment & Receipt → Redirect to Treasurer for Verification'}
            </span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      )}

      {/* STEP 6: CERTIFICATE SIGNED BY SECRETARY, TREASURER & CAPTAIN -> READY FOR RESIDENT DOWNLOAD */}
      {(workflow.stage === 'RELEASED_TO_RESIDENT' ||
        request.status === 'APPROVED' ||
        request.status === 'COMPLETED') && (
        <div className="p-3.5 rounded-xl bg-emerald-900 text-white space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-bold flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
              <span>Official Certificate Signed & Ready for Download!</span>
            </div>
            <span className="px-2 py-0.5 rounded bg-emerald-800 font-mono text-[10px] text-emerald-200">
              PAID & SIGNED
            </span>
          </div>
          <p className="text-[11px] text-emerald-100 leading-relaxed">
            Signed by Barangay Secretary <strong>Ms. Marites L. Cabrera</strong>, Barangay Treasurer{' '}
            <strong>Mr. Eduardo R. Mendoza</strong>, and Punong Barangay{' '}
            <strong>Hon. Rodrigo A. Balimbingan Sr.</strong>
          </p>
          <button
            type="button"
            onClick={handleOpenAndDownloadCertificate}
            className="w-full py-2.5 px-4 rounded-xl bg-white text-emerald-950 hover:bg-emerald-50 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-sm"
          >
            <Download className="w-4 h-4 text-emerald-800" />
            <span>Download Signed Certificate (PDF / Print)</span>
          </button>
        </div>
      )}

      {/* Quick Role Navigation Button when waiting for Official Action */}
      {workflow.stage !== 'RESIDENT_PAYMENT_SELECTION' &&
        workflow.stage !== 'RELEASED_TO_RESIDENT' &&
        request.status !== 'APPROVED' && (
          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-[11px] text-slate-500">
              Currently routed to: <strong>{stageMeta.targetRole} Dashboard</strong>
            </span>
            <button
              type="button"
              onClick={() => onSwitchRole(stageMeta.targetRole)}
              className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-emerald-800 text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
            >
              <span>Go to {stageMeta.targetRole} Dashboard</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        )}
    </div>
  );
};
