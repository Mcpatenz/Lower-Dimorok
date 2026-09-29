import React, { useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  CreditCard,
  FileCheck2,
  Receipt,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { IssuedDocument, ServiceRequestItem, UserRole } from '../types.ts';
import {
  CertificateWorkflowRecord,
  createSignatureSvgDataUrl,
  getStageBadgeMeta,
  getWorkflowForRequest,
  saveWorkflowRecord,
} from '../utils/certificateWorkflow.ts';
import { SignaturePadField } from './SignaturePadField.tsx';

interface CertificateWorkflowRowPanelProps {
  request: ServiceRequestItem;
  workflow?: CertificateWorkflowRecord;
  workflowRecord?: CertificateWorkflowRecord;
  currentRole?: UserRole;
  currentUserRole?: UserRole;
  currentUserFullName?: string;
  matchingDoc?: IssuedDocument | null;
  authHeaders?: Record<string, string>;
  onWorkflowUpdated?: (updatedMap: Record<string, CertificateWorkflowRecord>) => void;
  onSaveWorkflow?: (updatedRecord: CertificateWorkflowRecord) => void;
  onRefreshData?: () => void;
  onUpdateBackendStatus?: (
    r: ServiceRequestItem,
    nextStatus: string,
    nextPayStatus?: string,
    nextPayRef?: string
  ) => Promise<void>;
  onSwitchRole: (role: UserRole) => void;
  onOpenCertificate?: (doc: IssuedDocument) => void;
}

export const CertificateWorkflowRowPanel: React.FC<CertificateWorkflowRowPanelProps> = ({
  request,
  workflow: propWorkflow,
  workflowRecord,
  currentRole: propCurrentRole,
  currentUserRole,
  authHeaders = {},
  onWorkflowUpdated,
  onSaveWorkflow,
  onRefreshData,
  onUpdateBackendStatus,
  onSwitchRole,
}) => {
  const workflow: CertificateWorkflowRecord =
    propWorkflow || workflowRecord || getWorkflowForRequest(request);
  const currentRole: UserRole = propCurrentRole || currentUserRole || 'CAPTAIN';

  const [secretarySig, setSecretarySig] = useState<string>(
    workflow?.secretarySignatureDataUrl ||
      createSignatureSvgDataUrl('Ms. Marites L. Cabrera', 'Barangay Secretary', '#0369a1')
  );
  const [treasurerVerifiedPaid, setTreasurerVerifiedPaid] = useState<boolean>(
    Boolean(workflow?.treasurerVerifiedPaid || request.paymentStatus === 'PAID')
  );
  const [treasurerSig, setTreasurerSig] = useState<string>(
    workflow?.treasurerSignatureDataUrl ||
      createSignatureSvgDataUrl('Mr. Eduardo R. Mendoza', 'Barangay Treasurer', '#b45309')
  );
  const [captainSig, setCaptainSig] = useState<string>(
    workflow?.captainSignatureDataUrl ||
      createSignatureSvgDataUrl(
        'Hon. Rodrigo A. Balimbingan Sr.',
        'Punong Barangay / Captain',
        '#065f46'
      )
  );
  const [submitting, setSubmitting] = useState(false);

  const stageMeta = getStageBadgeMeta(workflow.stage);

  const persistWorkflow = (updatedRecord: CertificateWorkflowRecord) => {
    const nextMap = saveWorkflowRecord(updatedRecord);
    if (onWorkflowUpdated) {
      onWorkflowUpdated(nextMap);
    }
    if (onSaveWorkflow) {
      onSaveWorkflow(updatedRecord);
    }
  };

  const updateBackendRequestStatus = async (
    status: string,
    paymentStatus?: string,
    paymentReference?: string,
    reviewerNotes?: string
  ) => {
    if (onUpdateBackendStatus) {
      try {
        await onUpdateBackendStatus(request, status, paymentStatus, paymentReference);
        return;
      } catch {
        // Fallback below
      }
    }
    try {
      await fetch(`/api/service-requests/${request.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          status,
          paymentStatus,
          paymentReference,
          reviewerNotes,
        }),
      });
    } catch {
      // Fallback handled by local state
    }
    if (onRefreshData) {
      onRefreshData();
    }
  };

  // STEP 2: Secretary Approve + Sign -> Redirect to Treasurer
  const handleSecretaryApproveAndSign = async () => {
    if (!secretarySig || submitting) return;
    setSubmitting(true);
    const nowIso = new Date().toISOString();
    const updatedRecord: CertificateWorkflowRecord = {
      ...workflow,
      referenceNumber: request.referenceNumber,
      requestId: request.id,
      stage: 'TREASURER_RECEIVE_FOR_PAYMENT',
      secretaryApproved: true,
      secretarySignatureDataUrl: secretarySig,
      secretarySignedBy: 'Ms. Marites L. Cabrera (Barangay Secretary)',
      secretarySignedAt: nowIso,
      updatedAt: nowIso,
    };
    persistWorkflow(updatedRecord);

    await updateBackendRequestStatus(
      'UNDER_REVIEW',
      'PENDING',
      request.paymentReference,
      'Approved & digitally signed by Barangay Secretary. Forwarded to Barangay Treasurer for payment processing.'
    );
    setSubmitting(false);
    onSwitchRole('TREASURER');
  };

  // STEP 3: Treasurer Receive Certificate -> Return to Resident for Payment
  const handleTreasurerReceiveReturnToResident = async () => {
    if (submitting) return;
    setSubmitting(true);
    const nowIso = new Date().toISOString();
    const updatedRecord: CertificateWorkflowRecord = {
      ...workflow,
      referenceNumber: request.referenceNumber,
      requestId: request.id,
      stage: 'RESIDENT_PAYMENT_SELECTION',
      treasurerReceivedForPayment: true,
      treasurerBilledAt: nowIso,
      updatedAt: nowIso,
    };
    persistWorkflow(updatedRecord);

    await updateBackendRequestStatus(
      'UNDER_REVIEW',
      'UNPAID',
      request.paymentReference,
      'Certificate received by Barangay Treasurer and returned to Resident for GCash / PayMaya payment and receipt upload.'
    );
    setSubmitting(false);
    onSwitchRole('RESIDENT');
  };

  // STEP 5: Once Verify Status is PAID -> Treasurer Attach Signature -> Redirect to Barangay Captain
  const handleTreasurerVerifyPaidAndSign = async () => {
    if (!treasurerVerifiedPaid || !treasurerSig || submitting) return;
    setSubmitting(true);
    const nowIso = new Date().toISOString();
    const orNum =
      workflow.officialReceiptNumber ||
      `OR-2026-${Math.floor(10000 + Math.random() * 89999)}`;
    const updatedRecord: CertificateWorkflowRecord = {
      ...workflow,
      referenceNumber: request.referenceNumber,
      requestId: request.id,
      stage: 'CAPTAIN_FINAL_SIGN',
      treasurerVerifiedPaid: true,
      treasurerSignatureDataUrl: treasurerSig,
      treasurerSignedBy: 'Mr. Eduardo R. Mendoza (Barangay Treasurer)',
      treasurerSignedAt: nowIso,
      officialReceiptNumber: orNum,
      updatedAt: nowIso,
    };
    persistWorkflow(updatedRecord);

    await updateBackendRequestStatus(
      'UNDER_REVIEW',
      'PAID',
      workflow.paymentReferenceNumber || orNum,
      `Payment verified as PAID (${workflow.paymentMethod || 'GCASH'} Ref: ${
        workflow.paymentReferenceNumber || orNum
      }). Signed by Barangay Treasurer and forwarded to Barangay Captain.`
    );
    setSubmitting(false);
    onSwitchRole('CAPTAIN');
  };

  // STEP 6: Barangay Captain Attach Signature -> Redirect to Resident for Download
  const handleCaptainSignAndReturnToResident = async () => {
    if (!captainSig || submitting) return;
    setSubmitting(true);
    const nowIso = new Date().toISOString();
    const updatedRecord: CertificateWorkflowRecord = {
      ...workflow,
      referenceNumber: request.referenceNumber,
      requestId: request.id,
      stage: 'RELEASED_TO_RESIDENT',
      captainApprovedAndSigned: true,
      captainSignatureDataUrl: captainSig,
      captainSignedBy: 'Hon. Rodrigo A. Balimbingan Sr. (Barangay Captain)',
      captainSignedAt: nowIso,
      updatedAt: nowIso,
    };
    persistWorkflow(updatedRecord);

    await updateBackendRequestStatus(
      'APPROVED',
      'PAID',
      workflow.paymentReferenceNumber || request.paymentReference,
      'Final executive signature attached by Barangay Captain. Certificate released to Resident for download.'
    );
    setSubmitting(false);
    onSwitchRole('RESIDENT');
  };

  return (
    <div className="mt-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-4">
      {/* 6-Step Visual Routing Pipeline Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-700">
        <div>
          <span className="text-xs font-bold text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>{stageMeta.label}</span>
          </span>
          <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
            {stageMeta.description}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {[1, 2, 3, 4, 5, 6].map((step) => (
            <span
              key={step}
              className={`w-6 h-6 rounded-full text-[11px] font-mono font-bold flex items-center justify-center ${
                step < stageMeta.stepNumber
                  ? 'bg-emerald-600 text-white'
                  : step === stageMeta.stepNumber
                  ? 'bg-slate-900 dark:bg-emerald-400 text-white dark:text-slate-950 ring-2 ring-emerald-500/40'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
              }`}
            >
              {step < stageMeta.stepNumber ? '✓' : step}
            </span>
          ))}
        </div>
      </div>

      {/* Attached Official Signatures Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
        <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
          <div>
            <span className="text-[10px] font-mono uppercase text-slate-500 block">
              1. Barangay Secretary
            </span>
            <span className="font-semibold text-slate-900 dark:text-white">
              {workflow.secretaryApproved ? 'Approved & Signed' : 'Pending Signature'}
            </span>
          </div>
          {workflow.secretarySignatureDataUrl && (
            <img
              src={workflow.secretarySignatureDataUrl}
              alt="Secretary Signature"
              className="h-9 w-auto rounded border border-slate-200 bg-white px-1"
            />
          )}
        </div>

        <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
          <div>
            <span className="text-[10px] font-mono uppercase text-slate-500 block">
              2. Barangay Treasurer
            </span>
            <span className="font-semibold text-slate-900 dark:text-white">
              {workflow.treasurerVerifiedPaid
                ? 'Verified PAID & Signed'
                : workflow.treasurerReceivedForPayment
                ? 'Sent to Resident for Payment'
                : 'Awaiting Billing'}
            </span>
          </div>
          {workflow.treasurerSignatureDataUrl && (
            <img
              src={workflow.treasurerSignatureDataUrl}
              alt="Treasurer Signature"
              className="h-9 w-auto rounded border border-slate-200 bg-white px-1"
            />
          )}
        </div>

        <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
          <div>
            <span className="text-[10px] font-mono uppercase text-slate-500 block">
              3. Barangay Captain
            </span>
            <span className="font-semibold text-slate-900 dark:text-white">
              {workflow.captainApprovedAndSigned
                ? 'Signed & Released'
                : 'Pending Final Signature'}
            </span>
          </div>
          {workflow.captainSignatureDataUrl && (
            <img
              src={workflow.captainSignatureDataUrl}
              alt="Captain Signature"
              className="h-9 w-auto rounded border border-slate-200 bg-white px-1"
            />
          )}
        </div>
      </div>

      {/* STAGE 1: BARANGAY SECRETARY APPROVAL & SIGNATURE */}
      {workflow.stage === 'SECRETARY_REVIEW' && (
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-sky-900 dark:text-sky-300 flex items-center gap-1.5">
              <UserCheck className="w-4 h-4" />
              <span>
                Barangay Secretary Action: Approve Certificate & Attach Signature
              </span>
            </span>
            {currentRole !== 'SECRETARY' && (
              <button
                type="button"
                onClick={() => onSwitchRole('SECRETARY')}
                className="text-xs font-semibold text-sky-700 dark:text-sky-400 underline cursor-pointer"
              >
                Switch to Secretary View →
              </button>
            )}
          </div>

          <SignaturePadField
            roleLabel="Barangay Secretary"
            signerName="Ms. Marites L. Cabrera"
            strokeColor="#0369a1"
            signatureDataUrl={secretarySig}
            onChangeSignature={setSecretarySig}
          />

          <div className="flex justify-end">
            <button
              type="button"
              disabled={!secretarySig || submitting}
              onClick={handleSecretaryApproveAndSign}
              className="px-4 py-2.5 rounded-xl bg-sky-700 hover:bg-sky-600 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 cursor-pointer shadow-sm"
            >
              <FileCheck2 className="w-4 h-4" />
              <span>
                {submitting
                  ? 'Signing & Forwarding...'
                  : 'Approve & Attach Secretary Signature → Redirect to Treasurer'}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STAGE 2: BARANGAY TREASURER RECEIVES CERTIFICATE & RETURNS TO RESIDENT FOR PAYMENT */}
      {workflow.stage === 'TREASURER_RECEIVE_FOR_PAYMENT' && (
        <div className="space-y-3 pt-1">
          <div className="p-3.5 rounded-xl bg-amber-50/90 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="text-xs font-bold text-amber-950 dark:text-amber-200 flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-amber-700" />
                <span>
                  Barangay Treasurer Action: Receive Signed Certificate & Return to Resident for Payment
                </span>
              </div>
              <p className="text-xs text-amber-900/80 dark:text-amber-300">
                Barangay Secretary <strong>Ms. Marites L. Cabrera</strong> has approved and signed this certificate. Click below to acknowledge receipt and return it to{' '}
                <strong>{request.residentName}</strong> for GCash / PayMaya payment (PHP{' '}
                {request.fee.toFixed(2)}).
              </p>
            </div>
            <button
              type="button"
              disabled={submitting}
              onClick={handleTreasurerReceiveReturnToResident}
              className="px-4 py-2.5 rounded-xl bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 shrink-0 cursor-pointer shadow-sm"
            >
              <Receipt className="w-4 h-4" />
              <span>
                {submitting
                  ? 'Returning to Resident...'
                  : 'Receive Certificate & Return to Resident for Payment'}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STAGE 3: AWAITING RESIDENT PAYMENT (GCASH / PAYMAYA) */}
      {workflow.stage === 'RESIDENT_PAYMENT_SELECTION' && (
        <div className="p-3.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-emerald-950 dark:text-emerald-200">
            <span className="font-bold block">
              Returned to Resident ({request.residentName}) for GCash / PayMaya Payment
            </span>
            <span>
              Waiting for the resident to select GCash or PayMaya, scan the QR code, upload their payment screenshot/receipt, and submit the reference number.
            </span>
          </div>
          <button
            type="button"
            onClick={() => onSwitchRole('RESIDENT')}
            className="px-3.5 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <span>Open Resident Payment Screen</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* STAGE 4: BARANGAY TREASURER VERIFIES PAID STATUS & ATTACHES SIGNATURE */}
      {workflow.stage === 'TREASURER_VERIFY_AND_SIGN' && (
        <div className="space-y-3 pt-1">
          <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Receipt className="w-4 h-4 text-amber-600" />
                  <span>
                    Resident Payment Proof Received — Treasurer Verification Required
                  </span>
                </span>
                <span className="text-[11px] text-slate-500">
                  Verify the resident's uploaded screenshot/receipt and reference number, set status to{' '}
                  <strong>PAID</strong>, and attach the Treasurer signature.
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 font-mono text-xs font-bold text-slate-900 dark:text-white">
                  {workflow.paymentMethod || 'GCASH'} · Ref: {workflow.paymentReferenceNumber || request.paymentReference}
                </span>
                <button
                  type="button"
                  onClick={() => setTreasurerVerifiedPaid((v) => !v)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                    treasurerVerifiedPaid
                      ? 'bg-emerald-700 text-white'
                      : 'bg-amber-600 hover:bg-amber-500 text-white'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>
                    {treasurerVerifiedPaid ? 'Status Verified: PAID' : 'Click to Verify Status as PAID'}
                  </span>
                </button>
              </div>
            </div>

            {workflow.paymentReceiptDataUrl && (
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <img
                  src={workflow.paymentReceiptDataUrl}
                  alt="Resident Payment Receipt Screenshot"
                  className="h-28 w-auto rounded-lg border border-slate-300 bg-white object-contain"
                />
                <div className="text-xs space-y-1">
                  <div className="font-bold text-slate-900 dark:text-white">
                    Uploaded Payment Screenshot / Receipt
                  </div>
                  <div className="font-mono text-slate-600 dark:text-slate-300">
                    Payment Channel: <strong>{workflow.paymentMethod || 'GCASH'}</strong> ({workflow.paymentAccountNumber || '0917-550-0911'})
                  </div>
                  <div className="font-mono text-slate-600 dark:text-slate-300">
                    Reference Number: <strong>{workflow.paymentReferenceNumber}</strong>
                  </div>
                  <div className="font-mono text-emerald-700 dark:text-emerald-400 font-semibold">
                    Amount: PHP {request.fee.toFixed(2)}
                  </div>
                </div>
              </div>
            )}
          </div>

          <SignaturePadField
            roleLabel="Barangay Treasurer"
            signerName="Mr. Eduardo R. Mendoza"
            strokeColor="#b45309"
            signatureDataUrl={treasurerSig}
            onChangeSignature={setTreasurerSig}
          />

          <div className="flex justify-end">
            <button
              type="button"
              disabled={!treasurerVerifiedPaid || !treasurerSig || submitting}
              onClick={handleTreasurerVerifyPaidAndSign}
              className="px-4 py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 cursor-pointer shadow-sm"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {submitting
                  ? 'Verifying & Forwarding...'
                  : 'Verify PAID & Attach Treasurer Signature → Redirect to Barangay Captain'}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STAGE 5: BARANGAY CAPTAIN ATTACHES SIGNATURE & REDIRECTS TO RESIDENT */}
      {workflow.stage === 'CAPTAIN_FINAL_SIGN' && (
        <div className="space-y-3 pt-1">
          <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-950 dark:text-emerald-200 flex items-center justify-between gap-2">
            <span>
              <strong>Ready for Punong Barangay Executive Signature:</strong> Secretary approved & signed, and Treasurer verified payment as <strong>PAID</strong> (Ref: {workflow.paymentReferenceNumber || request.paymentReference}).
            </span>
          </div>

          <SignaturePadField
            roleLabel="Barangay Captain (Punong Barangay)"
            signerName="Hon. Rodrigo A. Balimbingan Sr."
            strokeColor="#065f46"
            signatureDataUrl={captainSig}
            onChangeSignature={setCaptainSig}
          />

          <div className="flex justify-end">
            <button
              type="button"
              disabled={!captainSig || submitting}
              onClick={handleCaptainSignAndReturnToResident}
              className="px-4 py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 cursor-pointer shadow-sm"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>
                {submitting
                  ? 'Signing & Releasing...'
                  : 'Attach Barangay Captain Signature & Issue → Redirect to Resident'}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STAGE 6: COMPLETED & RELEASED TO RESIDENT FOR DOWNLOAD */}
      {workflow.stage === 'RELEASED_TO_RESIDENT' && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-emerald-950 dark:text-emerald-200">
            <span className="font-bold flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>
                All 3 Official Signatures Attached (Secretary, Treasurer & Barangay Captain) — Released to Resident
              </span>
            </span>
            <span className="block mt-0.5">
              Resident <strong>{request.residentName}</strong> can now download the signed certificate.
            </span>
          </div>
          <button
            type="button"
            onClick={() => onSwitchRole('RESIDENT')}
            className="px-3.5 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <span>Switch to Resident to Download</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
