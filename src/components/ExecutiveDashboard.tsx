import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CheckCircle2,
  Clock,
  FileCheck2,
  FileText,
  Fingerprint,
  Megaphone,
  Phone,
  Plus,
  QrCode,
  RefreshCw,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Upload,
  User,
  UserPlus,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AuditLogItem,
  BarangayOfficialMember,
  BarangayService,
  BarangaySettings,
  ExecutiveMetrics,
  IssuedDocument,
  ServiceRequestItem,
  UserProfile,
  UserRole,
} from '../types.ts';
import {
  getStoredCertificateNotesMap,
  OfficialCertificateNoteRecord,
  saveStoredCertificateNote,
} from './CertificateModal.tsx';
import { CertificateWorkflowRowPanel } from './CertificateWorkflowRowPanel.tsx';
import {
  CertificateWorkflowRecord,
  DEFAULT_PAYMAYA_QR_SVG_DATA_URL,
  getStageBadgeMeta,
  getStoredWorkflowMap,
  getWorkflowForRequest,
  getWorkflowMap,
  saveWorkflowRecord,
} from '../utils/certificateWorkflow.ts';

export const BARANGAY_SETTINGS_STORAGE_KEY = 'dabawgov_barangay_settings';
export const BARANGAY_OFFICIALS_STORAGE_KEY = 'dabawgov_barangay_officials_roster';

export const DEFAULT_GCASH_QR_SVG_DATA_URL = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240">
    <rect width="240" height="240" rx="16" fill="#0057ff"/>
    <rect x="16" y="16" width="208" height="208" rx="12" fill="#ffffff"/>
    <rect x="28" y="28" width="52" height="52" fill="none" stroke="#0f172a" stroke-width="8"/>
    <rect x="42" y="42" width="24" height="24" fill="#0057ff"/>
    <rect x="160" y="28" width="52" height="52" fill="none" stroke="#0f172a" stroke-width="8"/>
    <rect x="174" y="42" width="24" height="24" fill="#0057ff"/>
    <rect x="28" y="160" width="52" height="52" fill="none" stroke="#0f172a" stroke-width="8"/>
    <rect x="42" y="174" width="24" height="24" fill="#0057ff"/>
    <rect x="96" y="36" width="12" height="12" fill="#0f172a"/>
    <rect x="116" y="36" width="12" height="24" fill="#0f172a"/>
    <rect x="96" y="64" width="24" height="12" fill="#0f172a"/>
    <rect x="132" y="64" width="12" height="12" fill="#0f172a"/>
    <rect x="36" y="96" width="24" height="12" fill="#0f172a"/>
    <rect x="68" y="96" width="12" height="24" fill="#0f172a"/>
    <rect x="92" y="92" width="56" height="56" rx="8" fill="#0057ff"/>
    <text x="120" y="125" text-anchor="middle" font-family="Arial, sans-serif" font-weight="bold" font-size="15" fill="#ffffff">GCash</text>
    <rect x="160" y="96" width="16" height="12" fill="#0f172a"/>
    <rect x="188" y="96" width="16" height="24" fill="#0f172a"/>
    <rect x="160" y="124" width="24" height="12" fill="#0f172a"/>
    <rect x="36" y="124" width="16" height="20" fill="#0f172a"/>
    <rect x="96" y="160" width="16" height="16" fill="#0f172a"/>
    <rect x="124" y="160" width="24" height="12" fill="#0f172a"/>
    <rect x="160" y="156" width="20" height="20" fill="#0f172a"/>
    <rect x="188" y="160" width="16" height="36" fill="#0f172a"/>
    <rect x="104" y="188" width="32" height="16" fill="#0f172a"/>
    <rect x="148" y="188" width="28" height="16" fill="#0057ff"/>
  </svg>`
)}`;

export function getStoredBarangaySettings(): BarangaySettings {
  const defaultSettings: BarangaySettings = {
    barangayName: 'Barangay Lower Dimorok',
    municipality: 'Municipality of Molave',
    province: 'Zamboanga del Sur',
    contactNumber: '+63 917 555 0140',
    gcashNumber: '0917-555-0192',
    gcashAccountName: 'Barangay Lower Dimorok Treasury',
    gcashQrCodeDataUrl: DEFAULT_GCASH_QR_SVG_DATA_URL,
    paymayaNumber: '0918-555-0248',
    paymayaAccountName: 'Barangay Lower Dimorok PayMaya Treasury',
    paymayaQrCodeDataUrl: DEFAULT_PAYMAYA_QR_SVG_DATA_URL,
    updatedAt: new Date().toISOString(),
    updatedBy: 'Hon. Rodrigo A. Balimbingan Sr.',
  };
  if (typeof window === 'undefined') return defaultSettings;
  try {
    const raw = localStorage.getItem(BARANGAY_SETTINGS_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(BARANGAY_SETTINGS_STORAGE_KEY, JSON.stringify(defaultSettings));
      return defaultSettings;
    }
    const parsed = JSON.parse(raw);
    return {
      ...defaultSettings,
      ...parsed,
      gcashQrCodeDataUrl: parsed?.gcashQrCodeDataUrl || DEFAULT_GCASH_QR_SVG_DATA_URL,
      paymayaNumber: parsed?.paymayaNumber || '0918-555-0248',
      paymayaAccountName:
        parsed?.paymayaAccountName || 'Barangay Lower Dimorok PayMaya Treasury',
      paymayaQrCodeDataUrl: parsed?.paymayaQrCodeDataUrl || DEFAULT_PAYMAYA_QR_SVG_DATA_URL,
    };
  } catch {
    return defaultSettings;
  }
}

export function getStoredBarangayOfficials(): BarangayOfficialMember[] {
  const defaultRoster: BarangayOfficialMember[] = [
    {
      id: 'off-captain-01',
      uid: 'admin-captain-01',
      firstName: 'Rodrigo',
      middleName: 'A.',
      lastName: 'Balimbingan',
      suffix: 'Sr.',
      role: 'CAPTAIN',
      email: 'captain.balimbingan@dimorok.gov.ph',
      username: 'captain.balimbingan',
      contactNumber: '+63 917 555 0140',
      purok: 'Purok 1 - Centro',
      committeeOrDesignation: 'Punong Barangay / Chief Executive',
      status: 'ACTIVE',
      addedAt: '2026-01-05T08:00:00.000Z',
    },
    {
      id: 'off-secretary-01',
      uid: 'admin-secretary-01',
      firstName: 'Marites',
      middleName: 'L.',
      lastName: 'Cabrera',
      suffix: '',
      role: 'SECRETARY',
      email: 'secretary.cabrera@dimorok.gov.ph',
      username: 'secretary.cabrera',
      contactNumber: '+63 917 555 0181',
      purok: 'Purok 1 - Centro',
      committeeOrDesignation: 'Head of Barangay Secretariat & RBI Civil Registry',
      status: 'ACTIVE',
      addedAt: '2026-01-06T08:00:00.000Z',
    },
    {
      id: 'off-treasurer-01',
      uid: 'admin-treasurer-01',
      firstName: 'Evelyn',
      middleName: 'P.',
      lastName: 'Mendoza',
      suffix: '',
      role: 'TREASURER',
      email: 'treasurer.mendoza@dimorok.gov.ph',
      username: 'treasurer.mendoza',
      contactNumber: '+63 917 555 0192',
      purok: 'Purok 2 - Pag-asa',
      committeeOrDesignation: 'Barangay Treasurer & Official Receipt / GCash Custodian',
      status: 'ACTIVE',
      addedAt: '2026-01-07T08:00:00.000Z',
    },
    {
      id: 'off-tanod-01',
      uid: 'admin-tanod-01',
      firstName: 'Rogelio',
      middleName: 'D.',
      lastName: 'Magbanua',
      suffix: '',
      role: 'TANOD',
      email: 'tanod.magbanua@dimorok.gov.ph',
      username: 'tanod.magbanua',
      contactNumber: '+63 917 555 0210',
      purok: 'Purok 3 - Mabuhay',
      committeeOrDesignation: 'Chief Barangay Tanod · Peace & Order Patrol Commander',
      status: 'ACTIVE',
      addedAt: '2026-01-08T08:00:00.000Z',
    },
    {
      id: 'off-kagawad-01',
      uid: 'admin-kagawad-01',
      firstName: 'Danilo',
      middleName: 'C.',
      lastName: 'Villanueva',
      suffix: '',
      role: 'KAGAWAD',
      email: 'kagawad.villanueva@dimorok.gov.ph',
      username: 'kagawad.villanueva',
      contactNumber: '+63 917 555 0244',
      purok: 'Purok 4 - Bagong Silang',
      committeeOrDesignation: 'Sangguniang Barangay Kagawad · Chair on Peace, Order & Appropriations',
      status: 'ACTIVE',
      addedAt: '2026-01-09T08:00:00.000Z',
    },
  ];

  if (typeof window === 'undefined') return defaultRoster;
  try {
    const raw = localStorage.getItem(BARANGAY_OFFICIALS_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(BARANGAY_OFFICIALS_STORAGE_KEY, JSON.stringify(defaultRoster));
      return defaultRoster;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return defaultRoster;
    return parsed;
  } catch {
    return defaultRoster;
  }
}

interface ExecutiveDashboardProps {
  currentUser: UserProfile;
  metrics: ExecutiveMetrics;
  requests: ServiceRequestItem[];
  documents: IssuedDocument[];
  services: BarangayService[];
  citizens: UserProfile[];
  auditLogs: AuditLogItem[];
  authHeaders: Record<string, string>;
  onRefresh: () => Promise<void>;
  onOpenCertificate: (doc: IssuedDocument) => void;
  onSwitchRole: (role: UserRole, personaUid?: string) => Promise<void>;
  barangaySettings?: BarangaySettings;
  onSaveBarangaySettings?: (updated: BarangaySettings) => Promise<void>;
  officialsRoster?: BarangayOfficialMember[];
  onAddBarangayOfficial?: (newOfficial: BarangayOfficialMember, password?: string) => Promise<void>;
  onOpenEditProfile?: () => void;
}

interface MonthlyVolumeDatum {
  monthKey: string;
  monthLabel: string;
  fullMonth: string;
  totalRequests: number;
  approvedRequests: number;
  pendingRequests: number;
  clearances: number;
  indigencyAndResidency: number;
  businessPermits: number;
}

interface WebAuthnActivityRecord {
  id: string;
  credentialId: string;
  actorName: string;
  actorRole: string;
  eventType: string;
  authenticatorMode: string;
  accessTimestamp: string;
  status: 'VERIFIED' | 'REJECTED';
}

interface TanodIncidentLogItem {
  id: string;
  blotterRef: string;
  purokSector: string;
  incidentType: string;
  reportedBy: string;
  assignedTanod: string;
  timestamp: string;
  status: 'RESOLVED' | 'ON_PATROL' | 'ESCALATED';
  remarks: string;
}

export const ExecutiveDashboard: React.FC<ExecutiveDashboardProps> = ({
  currentUser,
  metrics,
  requests,
  documents,
  services,
  citizens,
  auditLogs,
  authHeaders,
  onRefresh,
  onOpenCertificate,
  onSwitchRole,
  barangaySettings: propSettings,
  onSaveBarangaySettings,
  officialsRoster: propOfficials,
  onAddBarangayOfficial,
  onOpenEditProfile,
}) => {
  const [activeTab, setActiveTab] = useState<
    | 'requests'
    | 'verifications'
    | 'fees'
    | 'security'
    | 'citizens'
    | 'notices'
    | 'officials'
    | 'settings'
    | 'tanod-patrol'
    | 'kagawad-council'
  >('requests');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedReq, setSelectedReq] = useState<ServiceRequestItem | null>(null);
  const [reviewerNotes, setReviewerNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [tamperTestOutput, setTamperTestOutput] = useState<string | null>(null);
  const [chartMode, setChartMode] = useState<'total' | 'breakdown'>('total');
  const [workflowMap, setWorkflowMap] = useState<Record<string, CertificateWorkflowRecord>>(() =>
    getStoredWorkflowMap()
  );

  useEffect(() => {
    setWorkflowMap(getStoredWorkflowMap());
  }, [requests, currentUser.role]);

  // Barangay Settings state (Barangay Name, Contact Number, GCash QR Code & GCash Number)
  const [localSettings, setLocalSettings] = useState<BarangaySettings>(() =>
    propSettings || getStoredBarangaySettings()
  );
  const [settingsBarangayName, setSettingsBarangayName] = useState(localSettings.barangayName);
  const [settingsContactNumber, setSettingsContactNumber] = useState(localSettings.contactNumber);
  const [settingsGcashNumber, setSettingsGcashNumber] = useState(localSettings.gcashNumber);
  const [settingsGcashAccountName, setSettingsGcashAccountName] = useState(
    localSettings.gcashAccountName || 'Barangay Lower Dimorok Treasury'
  );
  const [settingsGcashQrUrl, setSettingsGcashQrUrl] = useState(localSettings.gcashQrCodeDataUrl);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSavedBanner, setSettingsSavedBanner] = useState<string | null>(null);

  useEffect(() => {
    if (propSettings) {
      setLocalSettings(propSettings);
      setSettingsBarangayName(propSettings.barangayName);
      setSettingsContactNumber(propSettings.contactNumber);
      setSettingsGcashNumber(propSettings.gcashNumber);
      setSettingsGcashAccountName(
        propSettings.gcashAccountName || `${propSettings.barangayName} Treasury`
      );
      setSettingsGcashQrUrl(propSettings.gcashQrCodeDataUrl);
    }
  }, [propSettings]);

  // Barangay Officials Roster state (Captain can add Secretary, Treasurer, Tanod, and Kagawad)
  const [localOfficials, setLocalOfficials] = useState<BarangayOfficialMember[]>(() =>
    propOfficials || getStoredBarangayOfficials()
  );
  useEffect(() => {
    if (propOfficials && propOfficials.length > 0) {
      setLocalOfficials(propOfficials);
    }
  }, [propOfficials]);

  const [newOfficialRole, setNewOfficialRole] = useState<
    'SECRETARY' | 'TREASURER' | 'TANOD' | 'KAGAWAD'
  >('SECRETARY');
  const [newOfficialFirstName, setNewOfficialFirstName] = useState('');
  const [newOfficialMiddleName, setNewOfficialMiddleName] = useState('');
  const [newOfficialLastName, setNewOfficialLastName] = useState('');
  const [newOfficialUsername, setNewOfficialUsername] = useState('');
  const [newOfficialEmail, setNewOfficialEmail] = useState('');
  const [newOfficialPassword, setNewOfficialPassword] = useState('Barangay2026!');
  const [newOfficialContact, setNewOfficialContact] = useState('+63 917 555 0300');
  const [newOfficialPurok, setNewOfficialPurok] = useState('Purok 1 - Centro');
  const [newOfficialDesignation, setNewOfficialDesignation] = useState(
    'Office of the Barangay Secretariat & Civil Registry'
  );
  const [addingOfficial, setAddingOfficial] = useState(false);
  const [officialFeedback, setOfficialFeedback] = useState<string | null>(null);

  // Barangay Tanod Patrol & Peace and Order Blotter state
  const [tanodLogs, setTanodLogs] = useState<TanodIncidentLogItem[]>([
    {
      id: 'tanod-1',
      blotterRef: 'BLT-2026-041',
      purokSector: 'Purok 2 - Pag-asa',
      incidentType: 'Night Curfew & Streetlight Inspection Patrol',
      reportedBy: 'Purok 2 Leader',
      assignedTanod: 'Chief Tanod Rogelio D. Magbanua',
      timestamp: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
      status: 'RESOLVED',
      remarks: 'All solar streetlights operational; zero curfew violations recorded.',
    },
    {
      id: 'tanod-2',
      blotterRef: 'BLT-2026-042',
      purokSector: 'Purok 3 - Mabuhay',
      incidentType: 'Highway Checkpoint & QR Business Permit Spot Check',
      reportedBy: 'Tanod Outpost Sector 3',
      assignedTanod: 'Chief Tanod Rogelio D. Magbanua',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      status: 'ON_PATROL',
      remarks: 'Verified 6 commercial delivery clearances via QR scanner.',
    },
    {
      id: 'tanod-3',
      blotterRef: 'BLT-2026-043',
      purokSector: 'Purok 4 - Bagong Silang',
      incidentType: 'Minor Boundary Mediation Referral to Lupon',
      reportedBy: 'Resident Walk-In',
      assignedTanod: 'Tanod Shift Team B',
      timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
      status: 'ESCALATED',
      remarks: 'Endorsed to Punong Barangay & Lupon Tagapamayapa for conciliation.',
    },
  ]);
  const [newPatrolSector, setNewPatrolSector] = useState('Purok 1 - Centro');
  const [newPatrolIncident, setNewPatrolIncident] = useState('');
  const [newPatrolRemarks, setNewPatrolRemarks] = useState('');

  // Auto-select default tab when switching to specific role dashboards
  useEffect(() => {
    if (currentUser.role === 'TANOD') {
      setActiveTab('tanod-patrol');
    } else if (currentUser.role === 'TREASURER') {
      setActiveTab('fees');
    } else if (currentUser.role === 'KAGAWAD') {
      setActiveTab('kagawad-council');
    } else if (currentUser.role === 'SECRETARY') {
      setActiveTab('requests');
    }
  }, [currentUser.role]);

  // New Announcement form state
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeCategory, setNoticeCategory] = useState('Official Notice');
  const [noticePriority, setNoticePriority] = useState('NORMAL');
  const [noticeSummary, setNoticeSummary] = useState('');
  const [noticeContent, setNoticeContent] = useState('');
  const [publishingNotice, setPublishingNotice] = useState(false);

  // Fee editing state
  const [editingFeeCode, setEditingFeeCode] = useState<string | null>(null);
  const [newFeeValue, setNewFeeValue] = useState<number>(50);

  // Barangay Captain Digital Official Notes / Remarks state for Issued Certificates
  const [certNotesMap, setCertNotesMap] = useState<Record<string, OfficialCertificateNoteRecord>>(() =>
    getStoredCertificateNotesMap()
  );
  const [editingDocNotesRef, setEditingDocNotesRef] = useState<string | null>(null);
  const [docNotesDraft, setDocNotesDraft] = useState('');
  const [savingDocNotes, setSavingDocNotes] = useState(false);

  const isOfficial = ['SECRETARY', 'TREASURER', 'CAPTAIN', 'TANOD', 'KAGAWAD'].includes(
    currentUser.role
  );
  const isCaptain = currentUser.role === 'CAPTAIN';

  const handleSaveCaptainDocNotes = async (doc: IssuedDocument) => {
    const trimmed = docNotesDraft.trim();
    if (!trimmed) return;
    setSavingDocNotes(true);
    try {
      const record: OfficialCertificateNoteRecord = {
        referenceNumber: doc.referenceNumber,
        notes: trimmed,
        author: 'Hon. Rodrigo A. Balimbingan Sr. — Punong Barangay (Barangay Captain)',
        updatedAt: new Date().toISOString(),
      };
      saveStoredCertificateNote(record);
      setCertNotesMap(getStoredCertificateNotesMap());

      await fetch(`/api/documents/${encodeURIComponent(doc.referenceNumber)}/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          notes: trimmed,
          author: record.author,
        }),
      }).catch(() => {});

      setEditingDocNotesRef(null);
      await onRefresh();
    } finally {
      setSavingDocNotes(false);
    }
  };

  // Compute past 6 months service requests volume for the Barangay Captain demand trend chart
  const monthlyVolumeData = useMemo<MonthlyVolumeDatum[]>(() => {
    const baselineSeeds = [
      { offset: 5, baseTotal: 24, baseApproved: 21, basePending: 3, clearances: 11, indigency: 9, permits: 4 },
      { offset: 4, baseTotal: 29, baseApproved: 26, basePending: 3, clearances: 13, indigency: 11, permits: 5 },
      { offset: 3, baseTotal: 33, baseApproved: 30, basePending: 3, clearances: 15, indigency: 13, permits: 5 },
      { offset: 2, baseTotal: 27, baseApproved: 24, basePending: 3, clearances: 12, indigency: 11, permits: 4 },
      { offset: 1, baseTotal: 36, baseApproved: 32, basePending: 4, clearances: 16, indigency: 14, permits: 6 },
      { offset: 0, baseTotal: 38, baseApproved: 31, basePending: 7, clearances: 17, indigency: 15, permits: 6 },
    ];

    const referenceNow = new Date();

    return baselineSeeds.map((seed) => {
      const d = new Date(referenceNow.getFullYear(), referenceNow.getMonth() - seed.offset, 1);
      const year = d.getFullYear();
      const month = d.getMonth();
      const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
      const monthLabel = d.toLocaleDateString('en-PH', { month: 'short', year: '2-digit' });
      const fullMonth = d.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });

      // Count live database requests submitted in this month
      const matchingLive = requests.filter((r) => {
        const subDate = new Date(r.submittedAt);
        return subDate.getFullYear() === year && subDate.getMonth() === month;
      });

      const liveCount = matchingLive.length;
      const liveApproved = matchingLive.filter(
        (r) => r.status === 'APPROVED' || r.status === 'READY_FOR_RELEASE' || r.status === 'COMPLETED'
      ).length;
      const livePending = matchingLive.filter(
        (r) => r.status === 'SUBMITTED' || r.status === 'UNDER_REVIEW' || r.status === 'NEEDS_CORRECTION'
      ).length;

      // For the current month (offset 0), reflect live additions dynamically on top of historical baseline
      const totalRequests = seed.offset === 0 ? seed.baseTotal + liveCount : seed.baseTotal + liveCount;
      const approvedRequests = seed.baseApproved + liveApproved;
      const pendingRequests = seed.basePending + livePending;

      return {
        monthKey,
        monthLabel,
        fullMonth,
        totalRequests,
        approvedRequests,
        pendingRequests,
        clearances: seed.clearances + matchingLive.filter((r) => r.serviceCode.includes('CLEARANCE')).length,
        indigencyAndResidency:
          seed.indigency +
          matchingLive.filter((r) => r.serviceCode.includes('INDIGENCY') || r.serviceCode.includes('RESIDENCY')).length,
        businessPermits:
          seed.permits + matchingLive.filter((r) => r.serviceCode.includes('BUSINESS')).length,
      };
    });
  }, [requests]);

  const sixMonthSummary = useMemo(() => {
    const totalSixMonths = monthlyVolumeData.reduce((sum, item) => sum + item.totalRequests, 0);
    const currentMonth = monthlyVolumeData[monthlyVolumeData.length - 1]?.totalRequests || 0;
    const prevMonth = monthlyVolumeData[monthlyVolumeData.length - 2]?.totalRequests || 1;
    const growthPct = (((currentMonth - prevMonth) / prevMonth) * 100).toFixed(1);
    const avgMonthly = Math.round(totalSixMonths / (monthlyVolumeData.length || 1));
    return {
      totalSixMonths,
      currentMonth,
      growthPct,
      avgMonthly,
    };
  }, [monthlyVolumeData]);

  // Compute Recent WebAuthn Biometric Activity for audited security tracking
  const recentWebAuthnActivity = useMemo<WebAuthnActivityRecord[]>(() => {
    const records: WebAuthnActivityRecord[] = [];
    const seenKeys = new Set<string>();

    // 1. Check localStorage WebAuthn activity log & enrolled credential
    if (typeof window !== 'undefined') {
      try {
        const rawLog = localStorage.getItem('dabawgov_webauthn_activity_log');
        if (rawLog) {
          const parsedLog = JSON.parse(rawLog);
          if (Array.isArray(parsedLog)) {
            for (const entry of parsedLog) {
              if (entry?.credentialId && entry?.accessTimestamp) {
                const key = `${entry.credentialId}-${entry.accessTimestamp}`;
                if (!seenKeys.has(key)) {
                  seenKeys.add(key);
                  const isRejected =
                    entry.eventStatus === 'Failed' ||
                    String(entry.eventType || '').toLowerCase().includes('fail') ||
                    String(entry.eventType || '').toLowerCase().includes('reject');
                  records.push({
                    id: entry.id || key,
                    credentialId: String(entry.credentialId),
                    actorName: String(entry.actorName || 'Jonel Delos Reyes Mabini'),
                    actorRole: String(entry.actorRole || 'RESIDENT'),
                    eventType: String(entry.eventType || 'Biometric Sign-In (Assertion)'),
                    authenticatorMode: String(
                      entry.authenticatorMode || 'WebAuthn Platform Biometric (FIDO2)'
                    ),
                    accessTimestamp: String(entry.accessTimestamp),
                    status: isRejected ? 'REJECTED' : 'VERIFIED',
                  });
                }
              }
            }
          }
        }

        const rawCred = localStorage.getItem('dabawgov_webauthn_credential');
        if (rawCred) {
          const cred = JSON.parse(rawCred);
          if (cred?.credentialId && cred?.enrolledAt) {
            const key = `${cred.credentialId}-${cred.enrolledAt}`;
            if (!seenKeys.has(key)) {
              seenKeys.add(key);
              records.push({
                id: `enrolled-${cred.credentialId}`,
                credentialId: String(cred.credentialId),
                actorName: String(cred.residentName || cred.username || 'Jonel Delos Reyes Mabini'),
                actorRole: 'RESIDENT',
                eventType: 'Passkey Enrolled (FIDO2)',
                authenticatorMode: String(
                  cred.authenticatorMode || 'WebAuthn Platform Biometric (FIDO2)'
                ),
                accessTimestamp: String(cred.enrolledAt),
                status: 'VERIFIED',
              });
            }
          }
        }
      } catch {
        // Ignore storage read errors
      }
    }

    // 2. Check database auditLogs for WebAuthn / Biometric events
    for (const log of auditLogs) {
      if (
        log.eventCode === 'WEBAUTHN_BIOMETRIC_AUTH' ||
        log.eventCode === 'WEBAUTHN_PASSKEY_ENROLLED' ||
        log.eventCode === 'WEBAUTHN_AUTH_FAILED' ||
        log.description.toLowerCase().includes('webauthn')
      ) {
        let meta: any = {};
        try {
          meta = log.metadata ? JSON.parse(log.metadata) : {};
        } catch {
          meta = {};
        }
        const credId =
          meta.credentialId ||
          `pk_dimorok_${log.actorUid.replace(/[^a-zA-Z0-9]/g, '').slice(-10)}_${log.id}`;
        const key = `${credId}-${log.createdAt}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          const isFailedAudit =
            log.eventCode === 'WEBAUTHN_AUTH_FAILED' || meta.webAuthnAction === 'FAILURE';
          records.push({
            id: `audit-${log.id}`,
            credentialId: credId,
            actorName: meta.residentName || log.actorEmail || log.actorUid,
            actorRole: log.actorRole || 'RESIDENT',
            eventType: isFailedAudit
              ? 'Biometric Sign-In Failed (Rejected Passkey)'
              : log.eventCode === 'WEBAUTHN_BIOMETRIC_AUTH' || meta.webAuthnAction === 'ASSERTION'
              ? 'Biometric Sign-In (Assertion)'
              : 'Passkey Enrolled (FIDO2)',
            authenticatorMode:
              meta.authenticatorMode || 'WebAuthn Platform Biometric (FIDO2)',
            accessTimestamp: log.createdAt,
            status: isFailedAudit ? 'REJECTED' : 'VERIFIED',
          });
        }
      }
    }

    // 3. Baseline audited WebAuthn biometric activity records for Barangay Lower Dimorok
    const nowMs = Date.now();
    const baselineRecords: WebAuthnActivityRecord[] = [
      {
        id: 'base-webauthn-1',
        credentialId: 'pk_dimorok_8f94a21c7e3b09d4a112',
        actorName: 'Jonel Delos Reyes Mabini',
        actorRole: 'RESIDENT',
        eventType: 'Biometric Sign-In (Assertion)',
        authenticatorMode: 'Platform Fingerprint / Face ID (FIDO2)',
        accessTimestamp: new Date(nowMs - 14 * 60 * 1000).toISOString(),
        status: 'VERIFIED',
      },
      {
        id: 'base-webauthn-2',
        credentialId: 'pk_dimorok_3c71e08b5a29f461d908',
        actorName: 'Hon. Rodrigo A. Balimbingan Sr.',
        actorRole: 'CAPTAIN',
        eventType: 'Biometric Sign-In (Assertion)',
        authenticatorMode: 'Platform Biometric Enclave (ES256)',
        accessTimestamp: new Date(nowMs - 48 * 60 * 1000).toISOString(),
        status: 'VERIFIED',
      },
      {
        id: 'base-webauthn-3',
        credentialId: 'pk_dimorok_6d19b472c803e51af330',
        actorName: 'Marites L. Cabrera',
        actorRole: 'SECRETARY',
        eventType: 'Biometric Sign-In (Assertion)',
        authenticatorMode: 'Platform Fingerprint Sensor (FIDO2)',
        accessTimestamp: new Date(nowMs - 2 * 60 * 60 * 1000).toISOString(),
        status: 'VERIFIED',
      },
      {
        id: 'base-webauthn-4',
        credentialId: 'pk_dimorok_9a42d510f718c63eb204',
        actorName: 'Elena G. Soriano',
        actorRole: 'RESIDENT',
        eventType: 'Passkey Enrolled (FIDO2)',
        authenticatorMode: 'Mobile Face ID Passkey (ES256)',
        accessTimestamp: new Date(nowMs - 5 * 60 * 60 * 1000).toISOString(),
        status: 'VERIFIED',
      },
    ];

    for (const base of baselineRecords) {
      records.push(base);
    }

    return records
      .sort((a, b) => new Date(b.accessTimestamp).getTime() - new Date(a.accessTimestamp).getTime())
      .slice(0, 6);
  }, [auditLogs]);

  const handleUpdateStatus = async (
    reqItem: ServiceRequestItem,
    newStatus: string,
    paymentStatusOverride?: string
  ) => {
    setUpdatingId(reqItem.id);
    try {
      const res = await fetch(`/api/service-requests/${reqItem.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          status: newStatus,
          reviewerNotes:
            reviewerNotes ||
            (newStatus === 'APPROVED'
              ? 'Verified against Barangay Lower Dimorok RBI & Lupon records.'
              : reqItem.reviewerNotes),
          rejectionReason: newStatus === 'REJECTED' ? rejectionReason || 'Incomplete documentary requirements' : '',
          paymentStatus: paymentStatusOverride,
        }),
      });
      if (res.ok) {
        setReviewerNotes('');
        setRejectionReason('');
        setSelectedReq(null);
        await onRefresh();
      }
    } finally {
      setUpdatingId(null);
    }
  };

  const handleSaveServiceFee = async (service: BarangayService) => {
    const label = newFeeValue === 0 ? 'FREE / WAIVED' : `PHP ${newFeeValue.toFixed(2)}`;
    const res = await fetch(`/api/services/${service.code}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({ fee: newFeeValue, feeLabel: label }),
    });
    if (res.ok) {
      setEditingFeeCode(null);
      await onRefresh();
    }
  };

  const handlePublishNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noticeTitle.trim() || !noticeSummary.trim()) return;
    setPublishingNotice(true);
    try {
      const res = await fetch('/api/announcements', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          title: noticeTitle,
          category: noticeCategory,
          priority: noticePriority,
          summary: noticeSummary,
          content: noticeContent || noticeSummary,
          authorOffice:
            currentUser.role === 'CAPTAIN'
              ? 'Office of the Punong Barangay'
              : 'Office of the Barangay Secretary',
        }),
      });
      if (res.ok) {
        setNoticeTitle('');
        setNoticeSummary('');
        setNoticeContent('');
        await onRefresh();
      }
    } finally {
      setPublishingNotice(false);
    }
  };

  const triggerWafTamperSimulation = async () => {
    setTamperTestOutput('Sending simulated SQL Injection / XSS payload to /api/documents/verify...');
    try {
      const res = await fetch(`/api/documents/verify/BD-2026-000118'%20UNION%20SELECT%20*--`, {
        headers: authHeaders,
      });
      const data = await res.json();
      setTamperTestOutput(
        `HTTP ${res.status} — ${data.error || 'Intercepted'} (Event logged: ${data.code || 'ER_DETECT_TAMPER'})`
      );
      await onRefresh();
    } catch {
      setTamperTestOutput('Intercepted by WAF Guard.');
    }
  };

  const filteredRequests = requests.filter((r) =>
    statusFilter === 'ALL' ? true : r.status === statusFilter
  );

  // Upload GCash QR Code Image file handler
  const handleGcashQrFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSettingsGcashQrUrl(reader.result);
        setSettingsSavedBanner(
          `Uploaded GCash QR Code image (${file.name}). Click "Save Barangay & Payment Settings" to publish.`
        );
      }
    };
    reader.readAsDataURL(file);
  };

  // Generate dynamic SVG QR code for the configured GCash number
  const handleGenerateCustomGcashQr = () => {
    const cleanNum = settingsGcashNumber.trim() || '0917-555-0192';
    const customSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240">
      <rect width="240" height="240" rx="16" fill="#0057ff"/>
      <rect x="14" y="14" width="212" height="212" rx="12" fill="#ffffff"/>
      <rect x="26" y="26" width="50" height="50" fill="none" stroke="#0f172a" stroke-width="8"/>
      <rect x="39" y="39" width="24" height="24" fill="#0057ff"/>
      <rect x="164" y="26" width="50" height="50" fill="none" stroke="#0f172a" stroke-width="8"/>
      <rect x="177" y="39" width="24" height="24" fill="#0057ff"/>
      <rect x="26" y="164" width="50" height="50" fill="none" stroke="#0f172a" stroke-width="8"/>
      <rect x="39" y="177" width="24" height="24" fill="#0057ff"/>
      <rect x="92" y="32" width="14" height="14" fill="#0f172a"/>
      <rect x="114" y="32" width="14" height="26" fill="#0f172a"/>
      <rect x="136" y="44" width="14" height="14" fill="#0f172a"/>
      <rect x="92" y="64" width="26" height="12" fill="#0f172a"/>
      <rect x="34" y="92" width="26" height="12" fill="#0f172a"/>
      <rect x="68" y="92" width="12" height="26" fill="#0f172a"/>
      <rect x="88" y="88" width="64" height="64" rx="10" fill="#0057ff"/>
      <text x="120" y="118" text-anchor="middle" font-family="Arial, sans-serif" font-weight="bold" font-size="14" fill="#ffffff">GCash</text>
      <text x="120" y="135" text-anchor="middle" font-family="monospace" font-weight="bold" font-size="9" fill="#e0f2fe">${cleanNum.slice(-9)}</text>
      <rect x="162" y="94" width="16" height="14" fill="#0f172a"/>
      <rect x="188" y="94" width="18" height="28" fill="#0f172a"/>
      <rect x="162" y="128" width="24" height="14" fill="#0f172a"/>
      <rect x="94" y="164" width="18" height="18" fill="#0f172a"/>
      <rect x="122" y="164" width="26" height="14" fill="#0f172a"/>
      <rect x="162" y="160" width="22" height="22" fill="#0f172a"/>
      <rect x="190" y="164" width="16" height="38" fill="#0f172a"/>
      <rect x="102" y="192" width="36" height="14" fill="#0f172a"/>
    </svg>`;
    setSettingsGcashQrUrl(`data:image/svg+xml;utf8,${encodeURIComponent(customSvg)}`);
    setSettingsSavedBanner(`Generated official GCash QR code for ${cleanNum}.`);
  };

  // Save Barangay Captain Settings (Barangay Name, Contact Number, GCash QR Code & GCash Number)
  const handleSaveBarangaySettingsForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const updated: BarangaySettings = {
        barangayName: settingsBarangayName.trim() || 'Barangay Lower Dimorok',
        municipality: localSettings.municipality || 'Municipality of Molave',
        province: localSettings.province || 'Zamboanga del Sur',
        contactNumber: settingsContactNumber.trim() || '+63 917 555 0140',
        gcashNumber: settingsGcashNumber.trim() || '0917-555-0192',
        gcashAccountName:
          settingsGcashAccountName.trim() ||
          `${settingsBarangayName.trim() || 'Barangay Lower Dimorok'} Treasury`,
        gcashQrCodeDataUrl: settingsGcashQrUrl || DEFAULT_GCASH_QR_SVG_DATA_URL,
        updatedAt: new Date().toISOString(),
        updatedBy: `${currentUser.firstName} ${currentUser.lastName}`.trim() || 'Barangay Captain',
      };

      localStorage.setItem(BARANGAY_SETTINGS_STORAGE_KEY, JSON.stringify(updated));
      setLocalSettings(updated);

      await fetch('/api/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify(updated),
      }).catch(() => {});

      if (onSaveBarangaySettings) {
        await onSaveBarangaySettings(updated);
      }
      setSettingsSavedBanner(
        `Saved Barangay Settings for ${updated.barangayName} (Contact: ${updated.contactNumber} · GCash: ${updated.gcashNumber}).`
      );
      await onRefresh();
    } finally {
      setSavingSettings(false);
    }
  };

  // Add Barangay Official Role (Secretary, Treasurer, Tanod, Kagawad) from Barangay Captain Dashboard
  const handleAddOfficialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOfficialFirstName.trim() || !newOfficialLastName.trim()) return;
    setAddingOfficial(true);
    try {
      const roleSlug = newOfficialRole.toLowerCase();
      const cleanLast = newOfficialLastName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
      const generatedUsername =
        newOfficialUsername.trim() || `${roleSlug}.${cleanLast || 'official'}`;
      const generatedEmail =
        newOfficialEmail.trim() || `${generatedUsername}@dimorok.gov.ph`;
      const generatedUid = `admin-${roleSlug}-${cleanLast || Date.now().toString().slice(-4)}`;

      const createdOfficial: BarangayOfficialMember = {
        id: `off-${Date.now()}`,
        uid: generatedUid,
        firstName: newOfficialFirstName.trim(),
        middleName: newOfficialMiddleName.trim(),
        lastName: newOfficialLastName.trim(),
        suffix: '',
        role: newOfficialRole,
        email: generatedEmail,
        username: generatedUsername,
        contactNumber: newOfficialContact.trim() || '+63 917 555 0300',
        purok: newOfficialPurok,
        committeeOrDesignation:
          newOfficialDesignation.trim() || `Barangay ${newOfficialRole}`,
        status: 'ACTIVE',
        addedAt: new Date().toISOString(),
      };

      const nextRoster = [
        createdOfficial,
        ...localOfficials.filter((o) => o.uid !== createdOfficial.uid),
      ];
      localStorage.setItem(BARANGAY_OFFICIALS_STORAGE_KEY, JSON.stringify(nextRoster));
      setLocalOfficials(nextRoster);

      await fetch('/api/admin/officials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          ...createdOfficial,
          password: newOfficialPassword,
        }),
      }).catch(() => {});

      if (onAddBarangayOfficial) {
        await onAddBarangayOfficial(createdOfficial, newOfficialPassword);
      }

      setOfficialFeedback(
        `Added Barangay ${newOfficialRole}: ${createdOfficial.firstName} ${createdOfficial.lastName} (Username: ${createdOfficial.username}). They can now sign in and will be automatically redirected to the Barangay ${
          newOfficialRole.charAt(0) + newOfficialRole.slice(1).toLowerCase()
        } Dashboard.`
      );
      setNewOfficialFirstName('');
      setNewOfficialMiddleName('');
      setNewOfficialLastName('');
      setNewOfficialUsername('');
      setNewOfficialEmail('');
      await onRefresh();
    } finally {
      setAddingOfficial(false);
    }
  };

  // Promote or update an existing citizen's role from Barangay Captain Dashboard
  const handleAssignCitizenRole = async (
    citizen: UserProfile,
    targetRole: 'SECRETARY' | 'TREASURER' | 'TANOD' | 'KAGAWAD' | 'RESIDENT'
  ) => {
    await fetch('/api/admin/officials', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({
        uid: citizen.uid,
        firstName: citizen.firstName,
        middleName: citizen.middleName,
        lastName: citizen.lastName,
        suffix: citizen.suffix,
        role: targetRole,
        email: citizen.email,
        username: citizen.username,
        contactNumber: citizen.contactNumber,
        purok: citizen.purok,
      }),
    }).catch(() => {});

    if (targetRole !== 'RESIDENT') {
      const promotedMember: BarangayOfficialMember = {
        id: `off-${citizen.uid}`,
        uid: citizen.uid,
        firstName: citizen.firstName,
        middleName: citizen.middleName,
        lastName: citizen.lastName,
        suffix: citizen.suffix,
        role: targetRole,
        email: citizen.email,
        username: citizen.username,
        contactNumber: citizen.contactNumber,
        purok: citizen.purok,
        committeeOrDesignation: `Appointed Barangay ${
          targetRole.charAt(0) + targetRole.slice(1).toLowerCase()
        }`,
        status: 'ACTIVE',
        addedAt: new Date().toISOString(),
      };
      const updatedRoster = [
        promotedMember,
        ...localOfficials.filter((m) => m.uid !== citizen.uid),
      ];
      localStorage.setItem(BARANGAY_OFFICIALS_STORAGE_KEY, JSON.stringify(updatedRoster));
      setLocalOfficials(updatedRoster);
    }

    setOfficialFeedback(
      `Updated ${citizen.firstName} ${citizen.lastName}'s role to ${targetRole}.`
    );
    await onRefresh();
  };

  const handleAddTanodPatrolEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPatrolIncident.trim()) return;
    const newEntry: TanodIncidentLogItem = {
      id: `tanod-${Date.now()}`,
      blotterRef: `BLT-2026-0${tanodLogs.length + 41}`,
      purokSector: newPatrolSector,
      incidentType: newPatrolIncident.trim(),
      reportedBy: 'Tanod Field Dispatch',
      assignedTanod: `${currentUser.firstName} ${currentUser.lastName}`.trim(),
      timestamp: new Date().toISOString(),
      status: 'ON_PATROL',
      remarks:
        newPatrolRemarks.trim() ||
        'Patrol unit dispatched for Purok peace & order verification.',
    };
    setTanodLogs((prev) => [newEntry, ...prev]);
    setNewPatrolIncident('');
    setNewPatrolRemarks('');
  };

  const roleDashboardMeta = useMemo(() => {
    switch (currentUser.role) {
      case 'CAPTAIN':
        return {
          badge: `Office of the Punong Barangay · ${localSettings.barangayName}`,
          title: `${localSettings.barangayName} — Barangay Captain Dashboard`,
          subtitle:
            'Executive command center: appoint Barangay Secretary, Treasurer, Tanod & Kagawad roles, configure Barangay Settings & GCash QR payment, and oversee certificates.',
        };
      case 'SECRETARY':
        return {
          badge: `Office of the Barangay Secretary · ${localSettings.barangayName}`,
          title: `${localSettings.barangayName} — Barangay Secretary Dashboard`,
          subtitle:
            'Civil registry & secretariat console: review resident document applications, manage the Registry of Barangay Inhabitants (RBI), and publish official advisories.',
        };
      case 'TREASURER':
        return {
          badge: `Office of the Barangay Treasurer · ${localSettings.barangayName}`,
          title: `${localSettings.barangayName} — Barangay Treasurer Dashboard`,
          subtitle: `Treasury & OR collection ledger: verify Official Receipt and GCash payments (${localSettings.gcashNumber}), manage statutory fees, and audit collections.`,
        };
      case 'TANOD':
        return {
          badge: `Barangay Peace & Order Patrol · ${localSettings.barangayName}`,
          title: `${localSettings.barangayName} — Barangay Tanod Dashboard`,
          subtitle:
            'Peace & order operations center: manage Purok patrol dispatches, blotter incident logs, curfew enforcement, and field QR certificate verification.',
        };
      case 'KAGAWAD':
        return {
          badge: `Sangguniang Barangay · ${localSettings.barangayName}`,
          title: `${localSettings.barangayName} — Barangay Kagawad Dashboard`,
          subtitle:
            'Sangguniang Barangay legislative & committee oversight console: review barangay resolutions, Purok projects, service requests, and public advisories.',
        };
      default:
        return {
          badge: `Republic of the Philippines · ${localSettings.municipality}, ${localSettings.province}`,
          title: `${localSettings.barangayName} Executive & Compliance Console`,
          subtitle:
            'Centralized document workflow, treasury fee ledger, citizen registry, and real-time security monitoring.',
        };
    }
  }, [currentUser.role, localSettings]);

  return (
    <div className="max-w-[1360px] mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Role-Specific Executive Header & Role Control */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-400">
              {roleDashboardMeta.badge}
            </p>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs font-mono text-slate-600 dark:text-slate-300 inline-flex items-center gap-1">
              <Phone className="w-3 h-3 text-emerald-700 dark:text-emerald-400" />
              {localSettings.contactNumber}
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs font-mono text-sky-700 dark:text-sky-400 inline-flex items-center gap-1">
              <Wallet className="w-3 h-3" />
              GCash: {localSettings.gcashNumber}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white mt-1">
            {roleDashboardMeta.title}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            {roleDashboardMeta.subtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-500 mr-1">Switch Role Dashboard:</span>
          {(
            [
              { role: 'CAPTAIN', label: 'Captain' },
              { role: 'SECRETARY', label: 'Secretary' },
              { role: 'TREASURER', label: 'Treasurer' },
              { role: 'TANOD', label: 'Tanod' },
              { role: 'KAGAWAD', label: 'Kagawad' },
            ] as const
          ).map((item) => (
            <button
              key={item.role}
              onClick={() => onSwitchRole(item.role)}
              className={`px-3 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                currentUser.role === item.role
                  ? 'bg-emerald-800 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              Barangay {item.label}
            </button>
          ))}
          {onOpenEditProfile && (
            <button
              type="button"
              onClick={onOpenEditProfile}
              className="px-3 py-2 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-slate-800 text-white hover:bg-slate-800 dark:hover:bg-slate-700 border border-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
              title="Update your profile information"
            >
              <User className="w-3.5 h-3.5 text-emerald-400" />
              <span>Edit Profile ({currentUser.firstName})</span>
            </button>
          )}
          <button
            onClick={onRefresh}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            title="Refresh records"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Barangay Captain Command Bar: Quick Access to Add Officials (Secretary, Treasurer, Tanod, Kagawad) & Barangay Settings */}
      {isCaptain && (
        <div className="p-5 rounded-2xl bg-emerald-950 text-white border border-emerald-800 shadow-md flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-mono font-semibold text-emerald-300">
              <Shield className="w-4 h-4" />
              <span>PUNONG BARANGAY EXECUTIVE AUTHORITY · {localSettings.barangayName.toUpperCase()}</span>
            </div>
            <h2 className="text-base sm:text-lg font-bold">
              Manage Barangay Officials (Secretary, Treasurer, Tanod & Kagawad) & Barangay Payment Settings
            </h2>
            <p className="text-xs text-emerald-100/80">
              Appoint or add Barangay Secretary, Treasurer, Tanod, and Kagawad accounts, or configure the Barangay Name, Contact Number, GCash QR Code, and GCash Number used in resident payments.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('officials')}
              className={`px-4 py-2.5 text-xs font-semibold rounded-xl inline-flex items-center gap-2 transition-colors cursor-pointer ${
                activeTab === 'officials'
                  ? 'bg-white text-emerald-950'
                  : 'bg-emerald-800 hover:bg-emerald-700 text-white border border-emerald-600'
              }`}
            >
              <UserPlus className="w-4 h-4" />
              <span>Manage Officials & Add Roles ({localOfficials.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`px-4 py-2.5 text-xs font-semibold rounded-xl inline-flex items-center gap-2 transition-colors cursor-pointer ${
                activeTab === 'settings'
                  ? 'bg-white text-emerald-950'
                  : 'bg-slate-900 hover:bg-slate-800 text-white border border-emerald-700'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>Barangay & GCash Settings</span>
            </button>
          </div>
        </div>
      )}

      {!isOfficial && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-amber-900 dark:text-amber-200">
            <strong>Read-Only Citizen Preview:</strong> Your current session role is{' '}
            <span className="font-mono">{currentUser.role}</span>. Switch to an official role above to approve applications, record payments, or modify service fees.
          </div>
          <button
            onClick={() => onSwitchRole('CAPTAIN')}
            className="px-3.5 py-2 text-xs font-semibold bg-amber-900 text-white rounded-lg shrink-0 whitespace-nowrap"
          >
            Activate Barangay Captain Role
          </button>
        </div>
      )}

      {/* 3 Mandatory Executive Oversight Metrics + 2 Operational Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Total Registered Citizens</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-2">
            {metrics.totalRegisteredCitizens}
          </div>
          <p className="text-xs text-slate-500 mt-1">Verified RBI Accounts</p>
        </div>

        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Active Document Verifications</span>
            <FileCheck2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400 mt-2">
            {metrics.activeDocumentVerifications}
          </div>
          <p className="text-xs text-slate-500 mt-1">QR-Signed Valid Certificates</p>
        </div>

        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Flagged Security Incidents</span>
            <ShieldAlert className="w-4 h-4 text-red-600" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-red-600 dark:text-red-400 mt-2">
            {metrics.flaggedSecurityIncidents}
          </div>
          <p className="text-xs text-slate-500 mt-1">WAF & ER_DETECT_TAMPER Logs</p>
        </div>

        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Pending Applications</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-2">
            {metrics.pendingRequestsCount}
          </div>
          <p className="text-xs text-slate-500 mt-1">Awaiting Secretary / Captain Action</p>
        </div>

        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Treasury Fees Collected</span>
            <FileText className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-2">
            PHP {metrics.totalFeesCollected.toFixed(2)}
          </div>
          <p className="text-xs text-slate-500 mt-1">GCash ({localSettings.gcashNumber}) & OR</p>
        </div>
      </div>

      {/* =====================================================================
          PUNONG BARANGAY DEMAND ANALYTICS: MONTHLY SERVICE REQUESTS VOLUME (6 MONTHS)
         ===================================================================== */}
      <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800 dark:text-emerald-400">
              <BarChart3 className="w-4 h-4" />
              <span>Office of the Punong Barangay · Executive Demand Intelligence</span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Monthly Service Requests Volume (Past 6 Months)
            </h2>
            <p className="text-xs text-slate-500">
              Tracks monthly clearance, residency, indigency, and permit application volume across {localSettings.barangayName} to guide staffing and service allocation.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs">
              <span className="text-slate-500 block">6-Month Volume</span>
              <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                {sixMonthSummary.totalSixMonths} Requests
              </span>
            </div>
            <div className="px-3.5 py-2 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 text-xs">
              <span className="text-slate-500 block">Monthly Pace</span>
              <span className="font-mono font-bold text-sm text-emerald-800 dark:text-emerald-400 inline-flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" />
                {Number(sixMonthSummary.growthPct) >= 0 ? `+${sixMonthSummary.growthPct}%` : `${sixMonthSummary.growthPct}%`} vs last mo.
              </span>
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <button
                onClick={() => setChartMode('total')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  chartMode === 'total'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Total Volume
              </button>
              <button
                onClick={() => setChartMode('breakdown')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  chartMode === 'breakdown'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                By Status Breakdown
              </button>
            </div>
          </div>
        </div>

        <div className="h-72 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={monthlyVolumeData}
              margin={{ top: 10, right: 16, left: -10, bottom: 4 }}
              barGap={6}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="monthLabel"
                tick={{ fontSize: 12, fill: '#64748b', fontFamily: 'IBM Plex Mono, monospace' }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 12, fill: '#64748b', fontFamily: 'IBM Plex Mono, monospace' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }}
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderColor: '#1e293b',
                  borderRadius: '12px',
                  color: '#f8fafc',
                  fontSize: '12px',
                  fontFamily: 'Plus Jakarta Sans, sans-serif',
                }}
                labelStyle={{ fontWeight: 700, color: '#34d399', marginBottom: '4px' }}
                formatter={(value: any, name: any) => [`${value} requests`, name]}
                labelFormatter={(label, payload) =>
                  payload?.[0]?.payload?.fullMonth || String(label)
                }
              />
              <Legend
                wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
                iconType="circle"
              />
              {chartMode === 'total' ? (
                <Bar
                  dataKey="totalRequests"
                  name="Monthly Service Requests Volume"
                  fill="#065f46"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={52}
                />
              ) : (
                <>
                  <Bar
                    dataKey="approvedRequests"
                    name="Approved & Released"
                    fill="#065f46"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={36}
                  />
                  <Bar
                    dataKey="pendingRequests"
                    name="Pending / Under Review"
                    fill="#d97706"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={36}
                  />
                </>
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <span className="text-slate-500">6-Month Monthly Average:</span>
            <span className="font-mono font-bold text-slate-900 dark:text-white ml-1.5">
              {sixMonthSummary.avgMonthly} reqs/mo
            </span>
          </div>
          <div>
            <span className="text-slate-500">Current Month Volume:</span>
            <span className="font-mono font-bold text-emerald-800 dark:text-emerald-400 ml-1.5">
              {sixMonthSummary.currentMonth} requests
            </span>
          </div>
          <div>
            <span className="text-slate-500">Top Requested Document:</span>
            <span className="font-semibold text-slate-900 dark:text-white ml-1.5">
              Barangay Clearance
            </span>
          </div>
          <div>
            <span className="text-slate-500">Peak Purok Origin:</span>
            <span className="font-semibold text-slate-900 dark:text-white ml-1.5">
              Purok 2 - Pag-asa & Purok 1
            </span>
          </div>
        </div>
      </div>

      {/* =====================================================================
          RECENT WEBAUTHN BIOMETRIC ACTIVITY WIDGET (AUDITED SECURITY TRACKING)
         ===================================================================== */}
      <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800 dark:text-emerald-400">
              <Fingerprint className="w-4 h-4" />
              <span>FIDO2 / WebAuthn Hardware Passkey Telemetry · Security Audit</span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Recent WebAuthn Biometric Activity
            </h2>
            <p className="text-xs text-slate-500">
              Audited security tracking of resident and official cryptographic passkey credential IDs and biometric access timestamps.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <span className="px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs font-mono font-semibold text-emerald-800 dark:text-emerald-300">
              {recentWebAuthnActivity.length} Audited Passkey Events
            </span>
            <button
              type="button"
              onClick={() => setActiveTab('security')}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Full Security Logs →
            </button>
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-slate-500">
                <th className="py-2.5 px-4 font-semibold">Credential ID</th>
                <th className="py-2.5 px-4 font-semibold">Access Timestamp</th>
                <th className="py-2.5 px-4 font-semibold">Resident / Official Actor</th>
                <th className="py-2.5 px-4 font-semibold">Biometric Action & Authenticator</th>
                <th className="py-2.5 px-4 font-semibold text-right">Audit Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {recentWebAuthnActivity.map((item) => (
                <tr
                  key={item.id}
                  className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td className="py-3 px-4 font-mono font-semibold text-emerald-900 dark:text-emerald-300 whitespace-nowrap">
                    {item.credentialId}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
                    {new Date(item.accessTimestamp).toLocaleString('en-PH', {
                      month: 'short',
                      day: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {item.actorName}
                    </span>{' '}
                    <span className="font-mono text-[11px] text-slate-500">
                      ({item.actorRole})
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-medium text-slate-800 dark:text-slate-200">
                      {item.eventType}
                    </div>
                    <div className="text-[11px] text-slate-500">{item.authenticatorMode}</div>
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    {item.status === 'REJECTED' ? (
                      <span className="inline-flex items-center gap-1 font-mono font-semibold text-red-700 dark:text-red-400">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>REJECTED</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>{item.status}</span>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Console Section Navigation */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-xl w-fit">
        {[
          { id: 'requests', label: `Service Requests (${requests.length})` },
          { id: 'verifications', label: `Issued Documents (${documents.length})` },
          { id: 'officials', label: `Officials & Roles (${localOfficials.length})` },
          { id: 'settings', label: 'Barangay & GCash Settings' },
          { id: 'fees', label: 'Treasury & Service Fees' },
          { id: 'tanod-patrol', label: `Tanod Patrol & Blotter (${tanodLogs.length})` },
          { id: 'kagawad-council', label: 'Kagawad Council' },
          { id: 'notices', label: 'Publish Announcement' },
          { id: 'citizens', label: `Citizen Registry (${citizens.length})` },
          { id: 'security', label: `Security & Audit Logs (${auditLogs.length})` },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === tab.id
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: SERVICE REQUESTS PROCESSING QUEUE */}
      {activeTab === 'requests' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Resident Document Applications Queue
              </h2>
              <p className="text-xs text-slate-500">
                Approving an application automatically generates a QR-signed certificate and notifies the resident.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
              {['ALL', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'COMPLETED', 'REJECTED'].map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    statusFilter === st
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {st.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 bg-slate-50/60 dark:bg-slate-800/40">
                  <th className="py-3 px-4 font-medium">Reference</th>
                  <th className="py-3 px-4 font-medium">Resident & Purok</th>
                  <th className="py-3 px-4 font-medium">Service & Purpose</th>
                  <th className="py-3 px-4 font-medium text-right">Fee & Payment</th>
                  <th className="py-3 px-4 font-medium">Workflow Status</th>
                  <th className="py-3 px-4 font-medium text-right">Official Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                {filteredRequests.map((req) => {
                  const wf = workflowMap[req.referenceNumber];
                  const stageMeta = wf ? getStageBadgeMeta(wf.stage) : null;
                  const matchingDoc =
                    documents.find((d) => d.referenceNumber === req.referenceNumber) || null;
                  return (
                    <React.Fragment key={req.id}>
                      <tr className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-3.5 px-4 font-mono text-xs font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                          {req.referenceNumber}
                          <div className="text-[11px] font-normal text-slate-500 mt-0.5">
                            {new Date(req.submittedAt).toLocaleDateString('en-PH')}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-medium text-slate-900 dark:text-white">
                            {req.residentName}
                          </div>
                          <div className="text-xs text-slate-500">{req.residentPurok}</div>
                        </td>
                        <td className="py-3.5 px-4 max-w-xs">
                          <div className="font-medium text-slate-900 dark:text-white">
                            {req.serviceName}
                          </div>
                          <div className="text-xs text-slate-500 truncate">{req.purpose}</div>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-xs whitespace-nowrap">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {req.fee === 0 ? 'FREE / WAIVED' : `PHP ${req.fee.toFixed(2)}`}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {wf?.treasurerVerifiedPaid ? 'PAID' : req.paymentStatus} ·{' '}
                            {wf?.paymentReferenceNumber || req.paymentReference}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-xs font-medium">
                          {stageMeta ? (
                            <div className="space-y-0.5">
                              <div className="font-bold text-emerald-800 dark:text-emerald-400">
                                {stageMeta.label}
                              </div>
                              <div className="font-mono text-[10px] text-slate-500">
                                Active Role: {stageMeta.targetRole}
                              </div>
                            </div>
                          ) : req.status === 'APPROVED' || req.status === 'COMPLETED' ? (
                            <span className="text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                              <CheckCircle2 className="w-4 h-4" />
                              <span>{req.status.replace('_', ' ')}</span>
                            </span>
                          ) : req.status === 'REJECTED' ? (
                            <span className="text-red-600 dark:text-red-400 flex items-center gap-1.5">
                              <XCircle className="w-4 h-4" />
                              <span>Application Rejected</span>
                            </span>
                          ) : (
                            <span className="text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                              <Clock className="w-4 h-4" />
                              <span>{req.status.replace('_', ' ')}</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {matchingDoc && (
                              <button
                                onClick={() => onOpenCertificate(matchingDoc)}
                                className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-800 text-white hover:bg-emerald-700 cursor-pointer"
                              >
                                View Certificate
                              </button>
                            )}
                            <button
                              onClick={() => setSelectedReq(req)}
                              className="px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:underline cursor-pointer"
                            >
                              Inspect
                            </button>
                          </div>
                        </td>
                      </tr>
                      <tr className="bg-slate-50/40 dark:bg-slate-900/50">
                        <td colSpan={6} className="px-4 pb-4 pt-1">
                          <CertificateWorkflowRowPanel
                            request={req}
                            currentUserRole={currentUser.role}
                            currentUserFullName={`${currentUser.firstName} ${currentUser.lastName}`}
                            workflowRecord={wf}
                            matchingDoc={matchingDoc}
                            onSaveWorkflow={(updatedWf) => {
                              const nextMap = saveWorkflowRecord(updatedWf);
                              setWorkflowMap(nextMap);
                            }}
                            onUpdateBackendStatus={async (r, nextStatus, nextPayStatus, nextPayRef) => {
                              await handleUpdateStatus(r, nextStatus, nextPayStatus);
                              if (nextPayRef) {
                                await fetch(`/api/service-requests/${r.id}/status`, {
                                  method: 'PATCH',
                                  headers: {
                                    'Content-Type': 'application/json',
                                    ...authHeaders,
                                  },
                                  body: JSON.stringify({
                                    status: nextStatus,
                                    paymentStatus: nextPayStatus || r.paymentStatus,
                                    paymentReference: nextPayRef,
                                  }),
                                });
                                onRefresh();
                              }
                            }}
                            onSwitchRole={(role) => onSwitchRole(role)}
                            onOpenCertificate={onOpenCertificate}
                          />
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Detailed Inspection Drawer / Modal */}
          {selectedReq && (
            <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Inspecting Application {selectedReq.referenceNumber} — {selectedReq.residentName}
                </h3>
                <button
                  onClick={() => setSelectedReq(null)}
                  className="text-xs text-slate-500 hover:text-slate-900"
                >
                  Close Panel
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div>
                  <span className="text-slate-500">Submitted Attachments:</span>
                  <div className="font-mono mt-1 text-slate-800 dark:text-slate-200">
                    {selectedReq.attachments}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Additional Declarations:</span>
                  <div className="font-mono mt-1 text-slate-800 dark:text-slate-200">
                    {selectedReq.additionalDetails}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Reviewed By:</span>
                  <div className="mt-1 font-medium text-slate-800 dark:text-slate-200">
                    {selectedReq.reviewedBy || 'Pending official review'}
                  </div>
                </div>
              </div>

              {isOfficial && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                      Official Review Notes
                    </label>
                    <input
                      type="text"
                      value={reviewerNotes}
                      onChange={(e) => setReviewerNotes(e.target.value)}
                      placeholder="e.g., Verified in Purok 2 RBI and Lupon clearance book"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                      Rejection / Correction Reason (if declining)
                    </label>
                    <input
                      type="text"
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="e.g., Expired Community Tax Certificate (Cedula)"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                </div>
              )}

              {isOfficial && (
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <button
                    onClick={() => handleUpdateStatus(selectedReq, 'APPROVED')}
                    className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-800 text-white hover:bg-emerald-700"
                  >
                    Approve & Issue Certificate
                  </button>
                  <button
                    onClick={() => handleUpdateStatus(selectedReq, 'READY_FOR_RELEASE')}
                    className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800"
                  >
                    Mark Ready for Release
                  </button>
                  <button
                    onClick={() => handleUpdateStatus(selectedReq, 'COMPLETED')}
                    className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700"
                  >
                    Mark Completed
                  </button>
                  <button
                    onClick={() => handleUpdateStatus(selectedReq, 'NEEDS_CORRECTION')}
                    className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-amber-700 text-white"
                  >
                    Request Correction
                  </button>
                  <button
                    onClick={() => handleUpdateStatus(selectedReq, 'REJECTED')}
                    className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-red-700 text-white"
                  >
                    Reject Application
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ISSUED DOCUMENTS & QR VERIFICATION REGISTRY */}
      {activeTab === 'verifications' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Issued Barangay Certificates & Cryptographic QR Registry
            </h2>
            <p className="text-xs text-slate-500">
              Inspect, print, or revoke digital certificates issued by Barangay Lower Dimorok.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 bg-slate-50/60 dark:bg-slate-800/40">
                  <th className="py-3 px-4 font-medium">Reference / QR Code</th>
                  <th className="py-3 px-4 font-medium">Document Type</th>
                  <th className="py-3 px-4 font-medium">Resident Holder</th>
                  <th className="py-3 px-4 font-medium">Official Notes / Remarks</th>
                  <th className="py-3 px-4 font-medium">Validity Status</th>
                  <th className="py-3 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {documents.map((doc) => {
                  const currentNote =
                    certNotesMap[doc.referenceNumber]?.notes ||
                    doc.officialNotes ||
                    `Verified in Barangay Lower Dimorok RBI & Lupon clearance log for ${doc.purpose}.`;
                  const isEditingThisNote = editingDocNotesRef === doc.referenceNumber;

                  return (
                    <tr key={doc.id}>
                      <td className="py-3.5 px-4 font-mono text-xs">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {doc.referenceNumber}
                        </div>
                        <div className="text-slate-500">{doc.verificationCode}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-900 dark:text-white">
                          {doc.documentType}
                        </div>
                        <div className="text-xs text-slate-500">{doc.issuingOffice}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-900 dark:text-white">
                          {doc.residentName}
                        </div>
                        <div className="text-xs text-slate-500">{doc.purpose}</div>
                      </td>
                      <td className="py-3.5 px-4 max-w-xs">
                        {isEditingThisNote ? (
                          <div className="space-y-2">
                            <textarea
                              rows={2}
                              value={docNotesDraft}
                              onChange={(e) => setDocNotesDraft(e.target.value)}
                              placeholder="Enter Punong Barangay Official Notes / Remarks..."
                              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                            />
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={savingDocNotes || !docNotesDraft.trim()}
                                onClick={() => handleSaveCaptainDocNotes(doc)}
                                className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-800 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                              >
                                {savingDocNotes ? 'Saving...' : 'Save Remarks'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingDocNotesRef(null)}
                                className="px-2 py-1 text-[11px] text-slate-500 hover:text-slate-800 cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <p className="text-xs text-slate-700 dark:text-slate-300 line-clamp-2 italic">
                              "{currentNote}"
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingDocNotesRef(doc.referenceNumber);
                                setDocNotesDraft(currentNote);
                              }}
                              className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                            >
                              <FileText className="w-3 h-3" />
                              <span>Add / Edit Captain Remarks</span>
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs font-semibold">
                        {doc.status === 'VALID' ? (
                          <span className="text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                            <ShieldCheck className="w-4 h-4" />
                            <span>VALID CERTIFICATE</span>
                          </span>
                        ) : (
                          <span className="text-red-600 dark:text-red-400 flex items-center gap-1">
                            <AlertTriangle className="w-4 h-4" />
                            <span>REVOKED</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-2 whitespace-nowrap">
                        <button
                          onClick={() =>
                            onOpenCertificate({
                              ...doc,
                              officialNotes: currentNote,
                              officialNotesAuthor:
                                certNotesMap[doc.referenceNumber]?.author ||
                                'Hon. Rodrigo A. Balimbingan Sr. — Punong Barangay (Barangay Captain)',
                              officialNotesUpdatedAt:
                                certNotesMap[doc.referenceNumber]?.updatedAt || doc.issuedAt,
                            })
                          }
                          className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 inline-flex items-center gap-1 cursor-pointer"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                          View Certificate
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: LOCALIZED SERVICE DIRECTORY, TREASURY GCASH QR & CONFIGURABLE FEES */}
      {activeTab === 'fees' && (
        <div className="space-y-6">
          {/* Active Barangay GCash Payment Channel Summary Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 dark:text-sky-400">
                <Wallet className="w-4 h-4" />
                <span>Official Treasury Digital Payment Channel · {localSettings.barangayName}</span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                GCash Treasury Account & QR Payment Configuration
              </h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                Residents applying for paid clearances or permits can pay via Cash at Barangay Hall or scan the official Barangay GCash QR code below.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                  <span className="text-slate-500 block">Barangay Name</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {localSettings.barangayName}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                  <span className="text-slate-500 block">GCash Number</span>
                  <span className="font-mono font-bold text-sky-700 dark:text-sky-400">
                    {localSettings.gcashNumber}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                  <span className="text-slate-500 block">Contact Number</span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-white">
                    {localSettings.contactNumber}
                  </span>
                </div>
              </div>
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('settings')}
                  className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-800 hover:bg-emerald-700 text-white inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>Edit Barangay & GCash QR Settings</span>
                </button>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex flex-col items-center gap-2 shrink-0">
              <img
                src={localSettings.gcashQrCodeDataUrl || DEFAULT_GCASH_QR_SVG_DATA_URL}
                alt="Barangay GCash Payment QR Code"
                className="w-36 h-36 rounded-xl object-contain bg-white p-1.5 border border-slate-200"
              />
              <span className="text-[11px] font-mono font-bold text-slate-800 dark:text-slate-200">
                GCash: {localSettings.gcashNumber}
              </span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                {localSettings.barangayName} Service Matrix & Fee Configuration
              </h2>
              <p className="text-xs text-slate-500">
                Fees are dynamically stored in Cloud SQL PostgreSQL and reflected immediately on the Resident Mobile App.
              </p>
            </div>
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {services.map((svc) => (
                <div
                  key={svc.code}
                  className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      {svc.name}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Responsible Authority: {svc.office} · Turnaround: {svc.processingTime}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {editingFeeCode === svc.code ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          value={newFeeValue}
                          onChange={(e) => setNewFeeValue(Number(e.target.value))}
                          className="w-24 px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
                        />
                        <button
                          onClick={() => handleSaveServiceFee(svc)}
                          className="px-3 py-1.5 text-xs font-semibold bg-emerald-800 text-white rounded-lg"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingFeeCode(null)}
                          className="px-2.5 py-1.5 text-xs text-slate-500"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                          {svc.feeLabel}
                        </span>
                        {isOfficial && (
                          <button
                            onClick={() => {
                              setEditingFeeCode(svc.code);
                              setNewFeeValue(svc.fee);
                            }}
                            className="px-3 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            Adjust Fee
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: PUBLISH BARANGAY ANNOUNCEMENT */}
      {activeTab === 'notices' && (
        <form
          onSubmit={handlePublishNotice}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4 max-w-2xl"
        >
          <div className="flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-emerald-700" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Broadcast Official {localSettings.barangayName} Notice
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Notice Category
              </label>
              <select
                value={noticeCategory}
                onChange={(e) => setNoticeCategory(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option>Official Notice</option>
                <option>Community Event</option>
                <option>Emergency Notice</option>
                <option>Public Service</option>
                <option>Advisory</option>
                <option>Barangay Updates</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Priority Level
              </label>
              <select
                value={noticePriority}
                onChange={(e) => setNoticePriority(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option value="NORMAL">NORMAL</option>
                <option value="HIGH">HIGH</option>
                <option value="URGENT">URGENT</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              Headline Title
            </label>
            <input
              type="text"
              required
              value={noticeTitle}
              onChange={(e) => setNoticeTitle(e.target.value)}
              placeholder="e.g., Purok 4 Solar Streetlight Installation Schedule"
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              Brief Summary
            </label>
            <input
              type="text"
              required
              value={noticeSummary}
              onChange={(e) => setNoticeSummary(e.target.value)}
              placeholder="1-sentence summary shown on resident home screen"
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              Full Official Advisory Content
            </label>
            <textarea
              rows={3}
              value={noticeContent}
              onChange={(e) => setNoticeContent(e.target.value)}
              placeholder="Detailed announcement instructions, schedule, and Purok coverage..."
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
          </div>
          <button
            type="submit"
            disabled={!isOfficial || publishingNotice}
            className="px-4 py-2.5 text-xs font-semibold rounded-lg bg-emerald-800 hover:bg-emerald-700 text-white disabled:opacity-40 inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Publish Official Announcement
          </button>
        </form>
      )}

      {/* TAB 5: CITIZEN REGISTRY */}
      {activeTab === 'citizens' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Registry of Barangay Inhabitants (RBI) — {localSettings.barangayName}
              </h2>
              <p className="text-xs text-slate-500">
                Barangay Captain can also assign or promote registered inhabitants to Secretary, Treasurer, Tanod, or Kagawad roles.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('officials')}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-800 text-white hover:bg-emerald-700 cursor-pointer"
            >
              Open Officials & Role Manager →
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 bg-slate-50/60 dark:bg-slate-800/40">
                  <th className="py-3 px-4 font-medium">Full Name</th>
                  <th className="py-3 px-4 font-medium">Purok / Address</th>
                  <th className="py-3 px-4 font-medium">Role</th>
                  <th className="py-3 px-4 font-medium">Contact & Email</th>
                  <th className="py-3 px-4 font-medium">Assign Barangay Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {citizens.map((c) => (
                  <tr key={c.uid}>
                    <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">
                      {c.firstName} {c.middleName} {c.lastName} {c.suffix}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                      {c.purok} · {c.address}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs font-semibold text-emerald-800 dark:text-emerald-400">
                      {c.role}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                      {c.contactNumber || '—'} · {c.email}
                    </td>
                    <td className="py-3 px-4 text-xs">
                      <select
                        value={c.role}
                        onChange={(e) =>
                          handleAssignCitizenRole(
                            c,
                            e.target.value as
                              | 'SECRETARY'
                              | 'TREASURER'
                              | 'TANOD'
                              | 'KAGAWAD'
                              | 'RESIDENT'
                          )
                        }
                        className="px-2.5 py-1 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold"
                      >
                        <option value="RESIDENT">RESIDENT</option>
                        <option value="SECRETARY">SECRETARY</option>
                        <option value="TREASURER">TREASURER</option>
                        <option value="TANOD">TANOD</option>
                        <option value="KAGAWAD">KAGAWAD</option>
                        <option value="CAPTAIN">CAPTAIN</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 6: SECURITY & AUDIT EVENT LOGS (ER_DETECT_TAMPER) */}
      {activeTab === 'security' && (
        <div className="space-y-4">
          <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Real-Time Input Validation & Tamper Monitoring (ER_DETECT_TAMPER)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                All API endpoints validate payloads against SQL Injection and Cross-Site Scripting (XSS) signatures.
              </p>
              {tamperTestOutput && (
                <p className="mt-2 text-xs font-mono text-red-600 dark:text-red-400">
                  {tamperTestOutput}
                </p>
              )}
            </div>
            <button
              onClick={triggerWafTamperSimulation}
              className="px-4 py-2.5 text-xs font-semibold bg-red-700 hover:bg-red-600 text-white rounded-lg shrink-0 whitespace-nowrap"
            >
              Simulate SQLi / Tamper Attack (Test ER_DETECT_TAMPER)
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 bg-slate-50/60 dark:bg-slate-800/40">
                    <th className="py-3 px-4 font-medium">Timestamp</th>
                    <th className="py-3 px-4 font-medium">Event Identifier</th>
                    <th className="py-3 px-4 font-medium">Severity</th>
                    <th className="py-3 px-4 font-medium">Actor / Role</th>
                    <th className="py-3 px-4 font-medium">Audit Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  {auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString('en-PH')}
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                        {log.eventCode}
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold whitespace-nowrap">
                        {log.severity === 'CRITICAL' ? (
                          <span className="text-red-600 dark:text-red-400">● CRITICAL</span>
                        ) : log.severity === 'WARNING' ? (
                          <span className="text-amber-600 dark:text-amber-400">● WARNING</span>
                        ) : (
                          <span className="text-emerald-700 dark:text-emerald-400">● INFO</span>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {log.actorRole}
                        </span>{' '}
                        <span className="text-slate-400">·</span>{' '}
                        <span className="font-mono text-slate-500">{log.actorUid}</span>
                      </td>
                      <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                        {log.description}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 7: BARANGAY OFFICIALS & ROLE MANAGEMENT (SECRETARY, TREASURER, TANOD, KAGAWAD) */}
      {activeTab === 'officials' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Add Barangay Official Role Form (Captain Authority) */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-400">
                <UserPlus className="w-4 h-4" />
                <span>Barangay Captain Role Appointment Authority</span>
              </div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Add Barangay Official Role (Secretary, Treasurer, Tanod & Kagawad)
              </h2>
              <p className="text-xs text-slate-500">
                Create or appoint Barangay Secretary, Barangay Treasurer, Barangay Tanod, or Barangay Kagawad accounts. At Sign In, each official is automatically redirected to their respective dashboard.
              </p>
            </div>

            {officialFeedback && (
              <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span>{officialFeedback}</span>
              </div>
            )}

            <form onSubmit={handleAddOfficialSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Barangay Official Role to Add *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      {
                        role: 'SECRETARY',
                        title: 'Barangay Secretary',
                        defaultDesig: 'Office of the Barangay Secretariat & Civil Registry',
                      },
                      {
                        role: 'TREASURER',
                        title: 'Barangay Treasurer',
                        defaultDesig: 'Barangay Treasury & OR / GCash Custodian',
                      },
                      {
                        role: 'TANOD',
                        title: 'Barangay Tanod',
                        defaultDesig: 'Peace & Order Patrol Officer · Tanod Outpost',
                      },
                      {
                        role: 'KAGAWAD',
                        title: 'Barangay Kagawad',
                        defaultDesig: 'Sangguniang Barangay Kagawad · Committee Chair',
                      },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.role}
                      type="button"
                      onClick={() => {
                        setNewOfficialRole(item.role);
                        setNewOfficialDesignation(item.defaultDesig);
                      }}
                      className={`p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                        newOfficialRole === item.role
                          ? 'border-emerald-700 bg-emerald-50/80 dark:bg-emerald-950/50 text-emerald-950 dark:text-white font-bold'
                          : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className="font-bold">{item.title}</div>
                      <div className="font-mono text-[10px] text-slate-500 mt-0.5">
                        Role: {item.role}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                    First Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newOfficialFirstName}
                    onChange={(e) => setNewOfficialFirstName(e.target.value)}
                    placeholder="e.g., Lorna"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Middle Initial
                  </label>
                  <input
                    type="text"
                    value={newOfficialMiddleName}
                    onChange={(e) => setNewOfficialMiddleName(e.target.value)}
                    placeholder="e.g., M."
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newOfficialLastName}
                    onChange={(e) => setNewOfficialLastName(e.target.value)}
                    placeholder="e.g., Dalisay"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Committee / Official Designation
                </label>
                <input
                  type="text"
                  value={newOfficialDesignation}
                  onChange={(e) => setNewOfficialDesignation(e.target.value)}
                  placeholder="e.g., Kagawad — Committee on Peace & Order"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Login Username
                  </label>
                  <input
                    type="text"
                    value={newOfficialUsername}
                    onChange={(e) => setNewOfficialUsername(e.target.value)}
                    placeholder={`${newOfficialRole.toLowerCase()}.official`}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Official Email Address
                  </label>
                  <input
                    type="email"
                    value={newOfficialEmail}
                    onChange={(e) => setNewOfficialEmail(e.target.value)}
                    placeholder={`${newOfficialRole.toLowerCase()}@dimorok.gov.ph`}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Assigned Purok
                  </label>
                  <select
                    value={newOfficialPurok}
                    onChange={(e) => setNewOfficialPurok(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    <option>Purok 1 - Centro</option>
                    <option>Purok 2 - Pag-asa</option>
                    <option>Purok 3 - Mabuhay</option>
                    <option>Purok 4 - Bagong Silang</option>
                    <option>Purok 5 -Riverside</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Contact Number
                  </label>
                  <input
                    type="text"
                    value={newOfficialContact}
                    onChange={(e) => setNewOfficialContact(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Temporary Password
                  </label>
                  <input
                    type="text"
                    value={newOfficialPassword}
                    onChange={(e) => setNewOfficialPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={addingOfficial}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white font-semibold text-xs inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
              >
                <UserPlus className="w-4 h-4" />
                <span>
                  {addingOfficial
                    ? 'Adding Official Role...'
                    : `Add Barangay ${
                        newOfficialRole.charAt(0) + newOfficialRole.slice(1).toLowerCase()
                      } to Roster`}
                </span>
              </button>
            </form>
          </div>

          {/* Right Column: Active Barangay Officials Roster */}
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  {localSettings.barangayName} Official Roster & Role Directory
                </h2>
                <p className="text-xs text-slate-500">
                  Includes Punong Barangay (Captain), Barangay Secretary, Barangay Treasurer, Barangay Tanod, and Barangay Kagawad.
                </p>
              </div>
              <span className="font-mono text-xs font-bold text-emerald-800 dark:text-emerald-400">
                {localOfficials.length} Active Officials
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-slate-500">
                    <th className="py-3 px-4 font-semibold">Official Name & Designation</th>
                    <th className="py-3 px-4 font-semibold">Role</th>
                    <th className="py-3 px-4 font-semibold">Login Username / Contact</th>
                    <th className="py-3 px-4 font-semibold text-right">Dashboard Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {localOfficials.map((member) => (
                    <tr
                      key={member.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 dark:text-white text-sm">
                          {member.firstName} {member.middleName} {member.lastName}{' '}
                          {member.suffix}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {member.committeeOrDesignation} · {member.purok}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-emerald-800 dark:text-emerald-400 whitespace-nowrap">
                        {member.role}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-300">
                        <div>{member.username}</div>
                        <div className="text-[11px] text-slate-500">{member.contactNumber}</div>
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onSwitchRole(member.role, member.uid)}
                          className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-emerald-800 hover:bg-slate-800 text-white font-semibold text-xs cursor-pointer"
                        >
                          Open {member.role.charAt(0) + member.role.slice(1).toLowerCase()} Dashboard
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 8: BARANGAY CAPTAIN SETTINGS (BARANGAY NAME, CONTACT NUMBER, UPLOAD GCASH QR CODE & GCASH NUMBER) */}
      {activeTab === 'settings' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleSaveBarangaySettingsForm}
            className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5"
          >
            <div className="space-y-1 border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-400">
                <Settings className="w-4 h-4" />
                <span>Barangay Captain Configuration Console</span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Barangay Profile & GCash Payment Settings
              </h2>
              <p className="text-xs text-slate-500">
                Configure the official Barangay Name, Contact Number, GCash Number used in payment, and upload the official GCash QR Code. Changes immediately take effect across Resident and Official Dashboards.
              </p>
            </div>

            {settingsSavedBanner && (
              <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                <span>{settingsSavedBanner}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Barangay Name *
                </label>
                <div className="relative">
                  <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={settingsBarangayName}
                    onChange={(e) => setSettingsBarangayName(e.target.value)}
                    placeholder="e.g., Barangay Lower Dimorok"
                    className="w-full pl-9 pr-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Barangay Official Contact Number *
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={settingsContactNumber}
                    onChange={(e) => setSettingsContactNumber(e.target.value)}
                    placeholder="e.g., +63 917 555 0140"
                    className="w-full pl-9 pr-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  GCash Number Used in Payment *
                </label>
                <div className="relative">
                  <Wallet className="w-4 h-4 text-sky-600 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={settingsGcashNumber}
                    onChange={(e) => setSettingsGcashNumber(e.target.value)}
                    placeholder="e.g., 0917-555-0192"
                    className="w-full pl-9 pr-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold text-sky-800 dark:text-sky-300"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  GCash Account Holder Name
                </label>
                <input
                  type="text"
                  value={settingsGcashAccountName}
                  onChange={(e) => setSettingsGcashAccountName(e.target.value)}
                  placeholder="e.g., Barangay Lower Dimorok Treasury"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>
            </div>

            <div className="space-y-2.5 pt-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Upload GCash QR Code Used in Payment *
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <label className="min-h-[44px] px-4 py-2.5 rounded-xl border-2 border-dashed border-sky-600/70 dark:border-sky-500/70 bg-sky-50/50 dark:bg-sky-950/30 hover:bg-sky-100/60 text-xs font-semibold text-sky-900 dark:text-sky-200 inline-flex items-center gap-2 cursor-pointer transition-colors">
                  <Upload className="w-4 h-4 text-sky-600" />
                  <span>Upload GCash QR Code Image (PNG / JPG / SVG)</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleGcashQrFileUpload}
                    className="hidden"
                  />
                </label>

                <button
                  type="button"
                  onClick={handleGenerateCustomGcashQr}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <QrCode className="w-4 h-4 text-sky-600" />
                  <span>Generate QR from GCash Number</span>
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                Uploaded QR code and GCash number are displayed to residents when paying for Barangay Clearances and Business Permits.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={savingSettings}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white font-semibold text-xs inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {savingSettings
                    ? 'Saving Barangay Settings...'
                    : 'Save Barangay & Payment Settings'}
                </span>
              </button>
            </div>
          </form>

          {/* Live GCash Payment & Barangay Header Preview Card */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <div>
                  <span className="text-[11px] font-mono font-semibold text-sky-700 dark:text-sky-400">
                    LIVE RESIDENT PAYMENT PREVIEW
                  </span>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {settingsBarangayName || 'Barangay Lower Dimorok'} — GCash QR Terminal
                  </h3>
                </div>
                <QrCode className="w-5 h-5 text-sky-600" />
              </div>

              <div className="p-5 rounded-2xl bg-gradient-to-b from-sky-600 to-blue-800 text-white flex flex-col items-center text-center space-y-3 shadow-md">
                <div className="text-xs font-bold tracking-wide uppercase text-sky-100">
                  {settingsBarangayName || 'Barangay Lower Dimorok'} Official Payment QR
                </div>
                <div className="p-3 bg-white rounded-2xl shadow-lg">
                  <img
                    src={settingsGcashQrUrl || DEFAULT_GCASH_QR_SVG_DATA_URL}
                    alt="Uploaded GCash QR Code Preview"
                    className="w-44 h-44 object-contain rounded-lg"
                  />
                </div>
                <div className="space-y-0.5">
                  <div className="text-sm font-bold">{settingsGcashAccountName}</div>
                  <div className="font-mono text-base font-bold text-amber-300">
                    GCash #: {settingsGcashNumber || '0917-555-0192'}
                  </div>
                  <div className="text-[11px] text-sky-100 font-mono">
                    Barangay Hotline: {settingsContactNumber || '+63 917 555 0140'}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 space-y-1">
              <div className="font-semibold text-slate-900 dark:text-white">
                Where these settings appear:
              </div>
              <p>
                1. Resident Service Request Wizard (GCash QR Payment Option) · 2. Certificate Header & Signatory · 3. Barangay Captain & Treasurer Dashboards.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 9: BARANGAY TANOD DASHBOARD — PEACE & ORDER PATROL & BLOTTER CONSOLE */}
      {activeTab === 'tanod-patrol' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleAddTanodPatrolEntry}
            className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4"
          >
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-400">
                <Shield className="w-4 h-4" />
                <span>Barangay Tanod Field Operations</span>
              </div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Log Patrol Dispatch / Peace & Order Blotter
              </h2>
              <p className="text-xs text-slate-500">
                Record Purok patrol checkpoints, night curfew inspections, or field certificate verification dispatches.
              </p>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Purok Patrol Sector *
                </label>
                <select
                  value={newPatrolSector}
                  onChange={(e) => setNewPatrolSector(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                >
                  <option>Purok 1 - Centro</option>
                  <option>Purok 2 - Pag-asa</option>
                  <option>Purok 3 - Mabuhay</option>
                  <option>Purok 4 - Bagong Silang</option>
                  <option>Purok 5 - Riverside</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Patrol Activity / Incident Description *
                </label>
                <input
                  type="text"
                  required
                  value={newPatrolIncident}
                  onChange={(e) => setNewPatrolIncident(e.target.value)}
                  placeholder="e.g., Night Patrol & Curfew Verification"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Field Remarks / Action Taken
                </label>
                <textarea
                  rows={3}
                  value={newPatrolRemarks}
                  onChange={(e) => setNewPatrolRemarks(e.target.value)}
                  placeholder="Enter patrol observations or QR verification notes..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white font-semibold text-xs inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Record Tanod Patrol Dispatch</span>
              </button>
            </div>
          </form>

          <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  {localSettings.barangayName} Tanod Peace & Order Blotter & Patrol Roster
                </h2>
                <p className="text-xs text-slate-500">
                  Real-time Purok patrol dispatches, checkpoint logs, and emergency hotline {localSettings.contactNumber}.
                </p>
              </div>
              <span className="font-mono text-xs font-bold text-emerald-800 dark:text-emerald-400">
                {tanodLogs.length} Active Blotter Records
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-slate-500">
                    <th className="py-3 px-4 font-semibold">Blotter Ref</th>
                    <th className="py-3 px-4 font-semibold">Purok Sector</th>
                    <th className="py-3 px-4 font-semibold">Incident / Patrol Dispatch</th>
                    <th className="py-3 px-4 font-semibold">Assigned Tanod</th>
                    <th className="py-3 px-4 font-semibold text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {tanodLogs.map((item) => (
                    <tr key={item.id}>
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                        {item.blotterRef}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap font-medium">
                        {item.purokSector}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {item.incidentType}
                        </div>
                        <div className="text-slate-500 mt-0.5">{item.remarks}</div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">{item.assignedTanod}</td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold whitespace-nowrap">
                        {item.status === 'RESOLVED' ? (
                          <span className="text-emerald-700 dark:text-emerald-400">✓ RESOLVED</span>
                        ) : item.status === 'ON_PATROL' ? (
                          <span className="text-sky-700 dark:text-sky-400">● ON PATROL</span>
                        ) : (
                          <span className="text-amber-700 dark:text-amber-400">▲ ESCALATED</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 10: BARANGAY KAGAWAD COUNCIL & COMMITTEE OVERSIGHT */}
      {activeTab === 'kagawad-council' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Sangguniang Barangay Kagawad — Legislative & Committee Roster ({localSettings.barangayName})
              </h2>
              <p className="text-xs text-slate-500">
                Barangay Kagawad members appointed by the Barangay Captain oversee standing committees, ordinances, and Purok development programs.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setNewOfficialRole('KAGAWAD');
                setNewOfficialDesignation('Sangguniang Barangay Kagawad · Committee Chair');
                setActiveTab('officials');
              }}
              className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white inline-flex items-center gap-1.5 cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Add Barangay Kagawad</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {localOfficials
              .filter((o) => o.role === 'KAGAWAD' || o.role === 'CAPTAIN')
              .map((member) => (
                <div
                  key={member.id}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex items-start justify-between gap-3"
                >
                  <div className="space-y-1 text-xs">
                    <div className="font-mono text-[11px] font-bold text-emerald-800 dark:text-emerald-400">
                      {member.role === 'CAPTAIN' ? 'PRESIDING OFFICER · PUNONG BARANGAY' : 'SANGGUNIANG BARANGAY KAGAWAD'}
                    </div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white">
                      Hon. {member.firstName} {member.middleName} {member.lastName} {member.suffix}
                    </div>
                    <div className="text-slate-600 dark:text-slate-300">
                      {member.committeeOrDesignation}
                    </div>
                    <div className="font-mono text-[11px] text-slate-500">
                      {member.purok} · {member.contactNumber}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSwitchRole(member.role, member.uid)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-white dark:hover:bg-slate-800 shrink-0 cursor-pointer"
                  >
                    Switch Role
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};
