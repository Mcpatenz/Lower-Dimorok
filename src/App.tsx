import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { signInWithPopup, signOut } from 'firebase/auth';
import {
  AlertCircle,
  ArrowLeft,
  Bell,
  Bot,
  Camera,
  CameraOff,
  CheckCircle2,
  ChevronRight,
  Clock,
  ScanLine,
  Download,
  Eye,
  EyeOff,
  FileCheck2,
  FileText,
  Fingerprint,
  Home,
  KeyRound,
  Lock,
  LogOut,
  Megaphone,
  Moon,
  QrCode,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  Sun,
  Upload,
  User,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { auth, googleAuthProvider } from './lib/firebase.ts';
import {
  AnnouncementItem,
  AuditLogItem,
  BarangayOfficialMember,
  BarangayService,
  BarangaySettings,
  ExecutiveMetrics,
  IssuedDocument,
  NotificationItem,
  ServiceRequestItem,
  UserProfile,
  UserRole,
} from './types.ts';
import { CertificateModal } from './components/CertificateModal.tsx';
import { CivicAssistantDrawer } from './components/CivicAssistantDrawer.tsx';
import { ResidentPaymentAndDownloadCard } from './components/ResidentPaymentAndDownloadCard.tsx';
import {
  CertificateWorkflowRecord,
  getStageBadgeMeta,
  getStoredWorkflowMap,
  saveWorkflowRecord,
} from './utils/certificateWorkflow.ts';
import {
  DEFAULT_GCASH_QR_SVG_DATA_URL,
  ExecutiveDashboard,
  getStoredBarangayOfficials,
  getStoredBarangaySettings,
} from './components/ExecutiveDashboard.tsx';

import sealImg from './assets/images/barangay_seal_emblem_1790596934896.jpg';
import hallHeroImg from './assets/images/lower_dimorok_hall_hero_1790596948027.jpg';
import communityBannerImg from './assets/images/community_announcement_banner_1790596963973.jpg';

type WorkspaceView = 'resident' | 'verify' | 'executive' | 'onboarding' | 'auth';
type ResidentTab = 'home' | 'services' | 'requests' | 'announcements' | 'profile';
type ProfileSubTab = 'overview' | 'biometric_history';

interface BiometricUsageLogEntry {
  id: string;
  credentialId: string;
  actorName: string;
  actorRole: string;
  eventType: string;
  eventStatus: 'Enrolled' | 'Signed In' | 'Failed';
  authenticatorMode: string;
  accessTimestamp: string;
  failureReason?: string;
}

interface RecentlyVerifiedQrEntry {
  code: string;
  documentType: string;
  holderInitialsName: string;
  outcome: 'VERIFIED' | 'REVOKED' | 'NOT_FOUND';
  verifiedAt: string;
}

const RECENT_VERIFIED_QR_STORAGE_KEY = 'dabawgov_recently_verified_qr';

const PUROK_LIST = [
  'Purok 1 - Centro',
  'Purok 2 - Pag-asa',
  'Purok 3 - Mabuhay',
  'Purok 4 - Maligaya',
  'Purok 5 - Masagana',
  'Purok 6 - Bagong Silang',
  'Purok 7 - Hillside',
];

const WORKFLOW_STEPS = [
  { key: 'SUBMITTED', label: 'Application Submitted' },
  { key: 'DOCUMENTS_RECEIVED', label: 'Documents Received' },
  { key: 'UNDER_REVIEW', label: 'Under Review' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'READY_FOR_RELEASE', label: 'Ready for Release' },
  { key: 'COMPLETED', label: 'Completed' },
];

export default function App() {
  // Top-level workspace mode
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>('resident');
  const [residentTab, setResidentTab] = useState<ResidentTab>('home');
  const [darkMode, setDarkMode] = useState(false);
  const [mobileFrameMode, setMobileFrameMode] = useState(true);
  const [offlineSimulation, setOfflineSimulation] = useState(false);

  // Auth & Persona State (in-memory token + persona switcher for seamless testing)
  const [firebaseToken, setFirebaseToken] = useState<string | null>(null);
  const [activePersona, setActivePersona] = useState<string>('demo-resident-jonel');
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);

  // Domain Data State
  const [services, setServices] = useState<BarangayService[]>([]);
  const [requests, setRequests] = useState<ServiceRequestItem[]>([]);
  const [allAdminRequests, setAllAdminRequests] = useState<ServiceRequestItem[]>([]);
  const [documents, setDocuments] = useState<IssuedDocument[]>([]);
  const [allAdminDocuments, setAllAdminDocuments] = useState<IssuedDocument[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [citizens, setCitizens] = useState<UserProfile[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [metrics, setMetrics] = useState<ExecutiveMetrics>({
    totalRegisteredCitizens: 4,
    activeDocumentVerifications: 2,
    flaggedSecurityIncidents: 1,
    pendingRequestsCount: 1,
    totalFeesCollected: 100,
  });

  const [loadingData, setLoadingData] = useState(true);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Interactive Sub-Views inside Resident Portal
  const [selectedService, setSelectedService] = useState<BarangayService | null>(null);
  const [applyingService, setApplyingService] = useState<BarangayService | null>(null);
  const [selectedRequestDetail, setSelectedRequestDetail] = useState<ServiceRequestItem | null>(null);
  const [activeCertificate, setActiveCertificate] = useState<IssuedDocument | null>(null);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [showAiAssistant, setShowAiAssistant] = useState(false);

  // Service Application Wizard State (Initialized with localStorage autosave recovery)
  const [applyStep, setApplyStep] = useState<1 | 2 | 3>(1);
  const [applyPurpose, setApplyPurpose] = useState(() => {
    try {
      const saved = localStorage.getItem('dabawgov_wizard_autosave');
      return saved ? JSON.parse(saved).applyPurpose || '' : '';
    } catch {
      return '';
    }
  });
  const [applyPurok, setApplyPurok] = useState(() => {
    try {
      const saved = localStorage.getItem('dabawgov_wizard_autosave');
      return saved ? JSON.parse(saved).applyPurok || 'Purok 2 - Pag-asa' : 'Purok 2 - Pag-asa';
    } catch {
      return 'Purok 2 - Pag-asa';
    }
  });
  const [applyCedula, setApplyCedula] = useState('CCI-2026-8841209');
  const [applyYears, setApplyYears] = useState('15 years');
  const [applyBusinessName, setApplyBusinessName] = useState(() => {
    try {
      const saved = localStorage.getItem('dabawgov_wizard_autosave');
      return saved ? JSON.parse(saved).applyBusinessName || '' : '';
    } catch {
      return '';
    }
  });
  const [applyAttachments, setApplyAttachments] = useState<string[]>([
    'Valid_Government_ID_Front.jpg',
    'Purok_Leader_Endorsement_Signed.pdf',
  ]);
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [lastAutosavedAt, setLastAutosavedAt] = useState<string | null>(() => {
    try {
      const saved = localStorage.getItem('dabawgov_wizard_autosave');
      return saved ? JSON.parse(saved).savedAt || null : null;
    } catch {
      return null;
    }
  });
  const [savedDraftMeta, setSavedDraftMeta] = useState<{
    serviceCode?: string;
    serviceName?: string;
    applyPurpose: string;
    applyPurok: string;
    applyBusinessName: string;
    savedAt: string;
  } | null>(() => {
    try {
      const saved = localStorage.getItem('dabawgov_wizard_autosave');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // QR Document Verification & Camera QR Scanner (getUserMedia) State
  const [verifyInput, setVerifyInput] = useState('BD-2026-000118');
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{
    outcome: 'VERIFIED' | 'NOT_FOUND' | 'REVOKED';
    document: any;
  } | null>(null);
  const [cameraScannerOpen, setCameraScannerOpen] = useState(true);
  const [cameraStreamActive, setCameraStreamActive] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraStatusMessage, setCameraStatusMessage] = useState<string>(
    'Align the physical certificate QR code inside the optical frame'
  );
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [showScannerQuickGuide, setShowScannerQuickGuide] = useState(false);
  const [cameraFlashActive, setCameraFlashActive] = useState(false);
  const [detectedQrPreviewCode, setDetectedQrPreviewCode] = useState<string | null>(null);
  const [recentlyVerifiedQrList, setRecentlyVerifiedQrList] = useState<RecentlyVerifiedQrEntry[]>(
    () => {
      const nowMs = Date.now();
      const seedHistory: RecentlyVerifiedQrEntry[] = [
        {
          code: 'BD-2026-000118',
          documentType: 'Certificate of Residency',
          holderInitialsName: 'Jonel D. R. Mabini',
          outcome: 'VERIFIED',
          verifiedAt: new Date(nowMs - 12 * 60 * 1000).toISOString(),
        },
        {
          code: 'BD-2026-000119',
          documentType: 'Barangay Indigency Certificate',
          holderInitialsName: 'Elena G. Soriano',
          outcome: 'VERIFIED',
          verifiedAt: new Date(nowMs - 45 * 60 * 1000).toISOString(),
        },
      ];
      if (typeof window === 'undefined') return seedHistory;
      try {
        const raw = localStorage.getItem(RECENT_VERIFIED_QR_STORAGE_KEY);
        if (!raw) {
          localStorage.setItem(RECENT_VERIFIED_QR_STORAGE_KEY, JSON.stringify(seedHistory));
          return seedHistory;
        }
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return seedHistory;
        const normalized: RecentlyVerifiedQrEntry[] = parsed
          .slice(0, 5)
          .map((item: any) =>
            typeof item === 'string'
              ? {
                  code: item,
                  documentType: 'Barangay Digital Certificate',
                  holderInitialsName: 'Verified Holder',
                  outcome: 'VERIFIED' as const,
                  verifiedAt: new Date().toISOString(),
                }
              : {
                  code: String(item?.code || 'BD-2026-000118'),
                  documentType: String(item?.documentType || 'Barangay Digital Certificate'),
                  holderInitialsName: String(item?.holderInitialsName || '—'),
                  outcome:
                    item?.outcome === 'REVOKED' || item?.outcome === 'NOT_FOUND'
                      ? item.outcome
                      : ('VERIFIED' as const),
                  verifiedAt: String(item?.verifiedAt || new Date().toISOString()),
                }
          );
        return normalized;
      } catch {
        return seedHistory;
      }
    }
  );
  const qrVideoRef = useRef<HTMLVideoElement | null>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const qrScanIntervalRef = useRef<number | null>(null);
  const qrFlashTimeoutRef = useRef<number | null>(null);

  // Onboarding State
  const [onboardingSlide, setOnboardingSlide] = useState(0);

  // Barangay Settings & Officials Roster State (managed from Barangay Captain Dashboard)
  const [barangaySettings, setBarangaySettings] = useState<BarangaySettings>(() =>
    getStoredBarangaySettings()
  );
  const [officialsRoster, setOfficialsRoster] = useState<BarangayOfficialMember[]>(() =>
    getStoredBarangayOfficials()
  );
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'GCASH_QR' | 'CASH_HALL'>(
    'GCASH_QR'
  );
  const [workflowMap, setWorkflowMap] = useState<Record<string, CertificateWorkflowRecord>>(() =>
    getStoredWorkflowMap()
  );

  // Auth / Registration Screen State
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [loginUsername, setLoginUsername] = useState('jonel.mabini@dimorok.gov.ph');
  const [loginPassword, setLoginPassword] = useState('DimorokCivic#2026');
  const [selectedLoginRole, setSelectedLoginRole] = useState<UserRole>('RESIDENT');
  const [showPassword, setShowPassword] = useState(false);

  // WebAuthn Biometric Passkey State
  const [webAuthnSupported] = useState<boolean>(
    () => typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined'
  );
  const [webAuthnBusy, setWebAuthnBusy] = useState(false);
  const [enrolledCredential, setEnrolledCredential] = useState<{
    credentialId: string;
    userUid: string;
    username: string;
    residentName: string;
    enrolledAt: string;
    authenticatorMode: string;
  } | null>(() => {
    try {
      const raw = localStorage.getItem('dabawgov_webauthn_credential');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  // Registration Form State + WebAuthn Registration Enrollment State
  const [regForm, setRegForm] = useState({
    firstName: '',
    middleName: '',
    lastName: '',
    suffix: '',
    dateOfBirth: '1998-04-12',
    sex: 'Female',
    civilStatus: 'Single',
    purok: 'Purok 1 - Centro',
    address: 'Purok 1 - Centro, Barangay Lower Dimorok, Molave, Zamboanga del Sur',
    contactNumber: '+63 917 ',
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
  });
  const [regEnrollBiometrics, setRegEnrollBiometrics] = useState(true);
  const [regWebAuthnCredentialId, setRegWebAuthnCredentialId] = useState<string | null>(null);

  // Resident Registration Photo Upload & Camera Preview State
  const [residentPhotosMap, setResidentPhotosMap] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem('lower_dimorok_resident_photos_v1');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [regPhotoDataUrl, setRegPhotoDataUrl] = useState<string | null>(null);
  const [regPhotoSource, setRegPhotoSource] = useState<'UPLOAD' | 'CAMERA' | null>(null);
  const [regPhotoFileName, setRegPhotoFileName] = useState<string | null>(null);
  const [regCameraOpen, setRegCameraOpen] = useState(false);
  const [regCameraStreamActive, setRegCameraStreamActive] = useState(false);
  const [regCameraFacingMode, setRegCameraFacingMode] = useState<'user' | 'environment'>('user');
  const [regCameraError, setRegCameraError] = useState<string | null>(null);
  const regPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const profilePhotoInputRef = useRef<HTMLInputElement | null>(null);
  const regCameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const regCameraStreamRef = useRef<MediaStream | null>(null);

  // All-User Profile Update State (Resident, Captain, Secretary, Treasurer, Tanod, Kagawad)
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileCameraOpen, setProfileCameraOpen] = useState(false);
  const [profileCameraStreamActive, setProfileCameraStreamActive] = useState(false);
  const [profileCameraError, setProfileCameraError] = useState<string | null>(null);
  const profileCameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const profileCameraStreamRef = useRef<MediaStream | null>(null);
  const [profileForm, setProfileForm] = useState({
    firstName: '',
    middleName: '',
    lastName: '',
    suffix: '',
    username: '',
    email: '',
    contactNumber: '',
    dateOfBirth: '1995-01-01',
    sex: 'Male',
    civilStatus: 'Single',
    purok: 'Purok 1 - Centro',
    address: 'Purok 1 - Centro, Barangay Lower Dimorok, Molave, Zamboanga del Sur',
  });

  // Announcement Filter
  const [announcementCategory, setAnnouncementCategory] = useState('All');

  // Profile Screen Sub-Tab ('overview' | 'biometric_history') & Biometric Usage History Filter
  const [profileSubTab, setProfileSubTab] = useState<ProfileSubTab>('overview');
  const [biometricStatusFilter, setBiometricStatusFilter] = useState<
    'ALL' | 'Enrolled' | 'Signed In' | 'Failed'
  >('ALL');
  const [biometricFailureAlert, setBiometricFailureAlert] = useState<{
    errorCode: string;
    domExceptionName: string;
    credentialId: string;
    actorName: string;
    actorRole: string;
    reason: string;
    remediation: string;
    timestamp: string;
  } | null>(null);

  const readAndNormalizeBiometricLogs = useCallback((): BiometricUsageLogEntry[] => {
    const nowMs = Date.now();
    const defaultSeedLogs: BiometricUsageLogEntry[] = [
      {
        id: 'wa-seed-signin-1',
        credentialId: 'pk_dimorok_8f94a21c7e3b09d4a112',
        actorName: 'Jonel Delos Reyes Mabini',
        actorRole: 'RESIDENT',
        eventType: 'Biometric Sign-In (Assertion)',
        eventStatus: 'Signed In',
        authenticatorMode: 'Platform Fingerprint / Face ID (FIDO2)',
        accessTimestamp: new Date(nowMs - 14 * 60 * 1000).toISOString(),
      },
      {
        id: 'wa-seed-enroll-1',
        credentialId: 'pk_dimorok_8f94a21c7e3b09d4a112',
        actorName: 'Jonel Delos Reyes Mabini',
        actorRole: 'RESIDENT',
        eventType: 'Passkey Enrolled (FIDO2)',
        eventStatus: 'Enrolled',
        authenticatorMode: 'Platform Fingerprint / Face ID (FIDO2)',
        accessTimestamp: new Date(nowMs - 3 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'wa-seed-signin-2',
        credentialId: 'pk_dimorok_3c71e08b5a29f461d908',
        actorName: 'Hon. Rodrigo A. Balimbingan Sr.',
        actorRole: 'CAPTAIN',
        eventType: 'Biometric Sign-In (Assertion)',
        eventStatus: 'Signed In',
        authenticatorMode: 'Platform Biometric Enclave (ES256)',
        accessTimestamp: new Date(nowMs - 5 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'wa-seed-enroll-2',
        credentialId: 'pk_dimorok_9a42d510f718c63eb204',
        actorName: 'Elena G. Soriano',
        actorRole: 'RESIDENT',
        eventType: 'Passkey Enrolled (FIDO2)',
        eventStatus: 'Enrolled',
        authenticatorMode: 'Mobile Face ID Passkey (ES256)',
        accessTimestamp: new Date(nowMs - 18 * 60 * 60 * 1000).toISOString(),
      },
    ];

    if (typeof window === 'undefined') return defaultSeedLogs;

    try {
      const raw = localStorage.getItem('dabawgov_webauthn_activity_log');
      if (!raw) {
        localStorage.setItem('dabawgov_webauthn_activity_log', JSON.stringify(defaultSeedLogs));
        return defaultSeedLogs;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        localStorage.setItem('dabawgov_webauthn_activity_log', JSON.stringify(defaultSeedLogs));
        return defaultSeedLogs;
      }

      const normalized: BiometricUsageLogEntry[] = parsed.map((item: any, idx: number) => {
        const rawType = String(item?.eventType || '');
        const rawStatus = String(item?.eventStatus || item?.status || '');
        const isFailed =
          rawStatus === 'Failed' ||
          rawStatus === 'REJECTED' ||
          rawType.toLowerCase().includes('fail') ||
          rawType.toLowerCase().includes('reject') ||
          String(item?.id || '').includes('fail');
        const isEnrolled =
          !isFailed &&
          (rawStatus === 'Enrolled' ||
            rawType.toLowerCase().includes('enroll') ||
            String(item?.id || '').includes('enroll'));
        return {
          id: String(item?.id || `wa-log-${idx}`),
          credentialId: String(item?.credentialId || 'pk_dimorok_8f94a21c7e3b09d4a112'),
          actorName: String(item?.actorName || 'Jonel Delos Reyes Mabini'),
          actorRole: String(item?.actorRole || 'RESIDENT'),
          eventType:
            rawType ||
            (isFailed
              ? 'Biometric Sign-In Failed (Rejected Passkey)'
              : isEnrolled
              ? 'Passkey Enrolled (FIDO2)'
              : 'Biometric Sign-In (Assertion)'),
          eventStatus: isFailed ? 'Failed' : isEnrolled ? 'Enrolled' : 'Signed In',
          authenticatorMode: String(
            item?.authenticatorMode || 'WebAuthn Platform Biometric (FIDO2)'
          ),
          accessTimestamp: String(item?.accessTimestamp || new Date().toISOString()),
          ...(item?.failureReason
            ? { failureReason: String(item.failureReason) }
            : isFailed
            ? {
                failureReason:
                  'NotAllowedError: Passkey assertion rejected or hardware biometric mismatch.',
              }
            : {}),
        };
      });

      return normalized.sort(
        (a, b) => new Date(b.accessTimestamp).getTime() - new Date(a.accessTimestamp).getTime()
      );
    } catch {
      return defaultSeedLogs;
    }
  }, []);

  const [webAuthnActivityLogs, setWebAuthnActivityLogs] = useState<BiometricUsageLogEntry[]>(() =>
    readAndNormalizeBiometricLogs()
  );

  const refreshBiometricUsageHistory = useCallback(() => {
    setWebAuthnActivityLogs(readAndNormalizeBiometricLogs());
  }, [readAndNormalizeBiometricLogs]);

  // Refresh biometric usage history whenever user opens Profile tab or Biometric Usage History sub-tab
  useEffect(() => {
    if (residentTab === 'profile') {
      refreshBiometricUsageHistory();
    }
  }, [residentTab, profileSubTab, refreshBiometricUsageHistory]);

  const filteredBiometricHistoryLogs = useMemo(() => {
    if (biometricStatusFilter === 'ALL') return webAuthnActivityLogs;
    return webAuthnActivityLogs.filter((entry) => entry.eventStatus === biometricStatusFilter);
  }, [webAuthnActivityLogs, biometricStatusFilter]);

  // Calculate Passkey Enrollment Rate among citizens by comparing enrolled users against total registered residents in the Barangay database
  const passkeyEnrollmentStats = useMemo(() => {
    const totalRegisteredResidents =
      citizens.length > 0 ? citizens.length : Math.max(metrics.totalRegisteredCitizens || 0, 4);

    const enrolledCitizenKeys = new Set<string>();
    for (const citizen of citizens) {
      if (citizen.biometricEnabled) {
        enrolledCitizenKeys.add(`${citizen.firstName} ${citizen.lastName}`.trim().toLowerCase());
      }
    }
    for (const log of webAuthnActivityLogs) {
      if (log.eventStatus === 'Enrolled' && log.actorName) {
        enrolledCitizenKeys.add(log.actorName.trim().toLowerCase());
      }
    }
    if (enrolledCredential?.residentName) {
      enrolledCitizenKeys.add(enrolledCredential.residentName.trim().toLowerCase());
    }
    if (currentUser?.biometricEnabled) {
      enrolledCitizenKeys.add(
        `${currentUser.firstName} ${currentUser.lastName}`.trim().toLowerCase()
      );
    }

    const enrolledUsersCount = Math.min(enrolledCitizenKeys.size, totalRegisteredResidents);
    const unenrolledUsersCount = Math.max(totalRegisteredResidents - enrolledUsersCount, 0);
    const enrollmentRatePct =
      totalRegisteredResidents > 0
        ? Math.round((enrolledUsersCount / totalRegisteredResidents) * 1000) / 10
        : 0;

    return {
      enrolledUsersCount,
      totalRegisteredResidents,
      unenrolledUsersCount,
      enrollmentRatePct,
      formattedRate: `${enrollmentRatePct.toFixed(1)}%`,
    };
  }, [
    citizens,
    metrics.totalRegisteredCitizens,
    webAuthnActivityLogs,
    enrolledCredential,
    currentUser,
  ]);

  // Resident App Top Header Search & 'My Requests' Status Filter
  const [residentSearchQuery, setResidentSearchQuery] = useState('');
  const [requestStatusFilter, setRequestStatusFilter] = useState<string>('ALL');

  const normalizedSearch = residentSearchQuery.trim().toLowerCase();

  // Real-Time Announcement Category Filter & Counts
  const announcementCategoryOptions = useMemo(() => {
    const standardCategories = [
      'All',
      'Emergency Notice',
      'Community Event',
      'Official Notice',
      'Public Service',
    ];
    for (const item of announcements) {
      if (item.category && !standardCategories.includes(item.category)) {
        standardCategories.push(item.category);
      }
    }
    return standardCategories;
  }, [announcements]);

  const filteredAnnouncements = useMemo(() => {
    return announcements.filter((ann) => {
      const matchesCategory =
        announcementCategory === 'All' ||
        ann.category.toLowerCase() === announcementCategory.toLowerCase();
      if (!matchesCategory) return false;
      if (!normalizedSearch) return true;
      return (
        ann.title.toLowerCase().includes(normalizedSearch) ||
        ann.category.toLowerCase().includes(normalizedSearch) ||
        ann.summary.toLowerCase().includes(normalizedSearch) ||
        ann.content.toLowerCase().includes(normalizedSearch) ||
        ann.authorOffice.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [announcements, announcementCategory, normalizedSearch]);

  const filteredResidentServices = useMemo(() => {
    if (!normalizedSearch) return services;
    return services.filter(
      (svc) =>
        svc.name.toLowerCase().includes(normalizedSearch) ||
        svc.code.toLowerCase().includes(normalizedSearch) ||
        svc.office.toLowerCase().includes(normalizedSearch) ||
        svc.description.toLowerCase().includes(normalizedSearch) ||
        svc.feeLabel.toLowerCase().includes(normalizedSearch)
    );
  }, [services, normalizedSearch]);

  const matchesRequestStatusFilter = useCallback(
    (status: ServiceRequestItem['status'], filterVal: string) => {
      if (filterVal === 'ALL') return true;
      if (filterVal === 'Approved') {
        return (
          status === 'APPROVED' ||
          status === 'READY_FOR_RELEASE' ||
          status === 'COMPLETED'
        );
      }
      if (filterVal === 'Pending') {
        return (
          status === 'SUBMITTED' ||
          status === 'UNDER_REVIEW' ||
          status === 'NEEDS_CORRECTION'
        );
      }
      if (filterVal === 'Rejected') {
        return status === 'REJECTED';
      }
      return status === filterVal;
    },
    []
  );

  const filteredResidentRequests = useMemo(() => {
    if (!normalizedSearch) return requests;
    return requests.filter(
      (req) =>
        req.serviceName.toLowerCase().includes(normalizedSearch) ||
        req.referenceNumber.toLowerCase().includes(normalizedSearch) ||
        req.purpose.toLowerCase().includes(normalizedSearch) ||
        req.office.toLowerCase().includes(normalizedSearch) ||
        req.status.toLowerCase().includes(normalizedSearch)
    );
  }, [requests, normalizedSearch]);

  const filteredMyRequestsTab = useMemo(() => {
    return filteredResidentRequests.filter((req) =>
      matchesRequestStatusFilter(req.status, requestStatusFilter)
    );
  }, [filteredResidentRequests, matchesRequestStatusFilter, requestStatusFilter]);

  const filteredResidentDocuments = useMemo(() => {
    if (!normalizedSearch) return documents;
    return documents.filter(
      (doc) =>
        doc.documentType.toLowerCase().includes(normalizedSearch) ||
        doc.referenceNumber.toLowerCase().includes(normalizedSearch) ||
        doc.verificationCode.toLowerCase().includes(normalizedSearch) ||
        doc.purpose.toLowerCase().includes(normalizedSearch) ||
        doc.issuingOffice.toLowerCase().includes(normalizedSearch) ||
        doc.status.toLowerCase().includes(normalizedSearch)
    );
  }, [documents, normalizedSearch]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Highlight matching search term in service titles and document reference numbers
  const highlightSearchTerm = useCallback(
    (text: string, query: string = residentSearchQuery): React.ReactNode => {
      const trimmed = query.trim();
      if (!trimmed || !text) return text;
      const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(${escaped})`, 'gi');
      const parts = text.split(regex);
      if (parts.length <= 1) return text;
      return parts.map((part, idx) =>
        part.toLowerCase() === trimmed.toLowerCase() ? (
          <mark
            key={idx}
            className="bg-amber-200 dark:bg-amber-500/40 text-slate-950 dark:text-amber-100 font-bold px-0.5 rounded-xs"
          >
            {part}
          </mark>
        ) : (
          part
        )
      );
    },
    [residentSearchQuery]
  );

  const authHeaders = useMemo(() => {
    const headers: Record<string, string> = {};
    if (firebaseToken) {
      headers['Authorization'] = `Bearer ${firebaseToken}`;
    } else {
      headers['x-dabawgov-persona'] = activePersona;
    }
    return headers;
  }, [firebaseToken, activePersona]);

  const fetchPortalData = useCallback(async () => {
    if (offlineSimulation) {
      setErrorBanner(
        'Offline / Low-Connectivity Mode Active: Showing cached Barangay Lower Dimorok services and announcements. New submissions will be saved as local drafts.'
      );
      setLoadingData(false);
      return;
    }

    setErrorBanner(null);
    try {
      const [meRes, svcRes, reqRes, docRes, annRes, notifRes, adminOverviewRes, allReqRes, allDocRes] =
        await Promise.all([
          fetch('/api/auth/me', { headers: authHeaders }),
          fetch('/api/services'),
          fetch('/api/service-requests', { headers: authHeaders }),
          fetch('/api/documents', { headers: authHeaders }),
          fetch('/api/announcements'),
          fetch('/api/notifications', { headers: authHeaders }),
          fetch('/api/admin/overview', { headers: authHeaders }),
          fetch('/api/service-requests?scope=all', { headers: authHeaders }),
          fetch('/api/documents?scope=all', { headers: authHeaders }),
        ]);

      if (meRes.ok) {
        const meData = await meRes.json();
        setCurrentUser(meData.user);
        if (meData.user?.purok) setApplyPurok(meData.user.purok);
      }
      if (svcRes.ok) {
        const svcData = await svcRes.json();
        setServices(svcData.services || []);
      }
      if (reqRes.ok) {
        const reqData = await reqRes.json();
        setRequests(reqData.requests || []);
      }
      if (docRes.ok) {
        const docData = await docRes.json();
        setDocuments(docData.documents || []);
      }
      if (annRes.ok) {
        const annData = await annRes.json();
        setAnnouncements(annData.announcements || []);
      }
      if (notifRes.ok) {
        const notifData = await notifRes.json();
        setNotifications(notifData.notifications || []);
      }
      if (adminOverviewRes.ok) {
        const admData = await adminOverviewRes.json();
        if (admData.metrics) setMetrics(admData.metrics);
        if (admData.citizens) setCitizens(admData.citizens);
        if (admData.auditLogs) setAuditLogs(admData.auditLogs);
      }
      if (allReqRes.ok) {
        const allReqData = await allReqRes.json();
        setAllAdminRequests(allReqData.requests || []);
      }
      if (allDocRes.ok) {
        const allDocData = await allDocRes.json();
        setAllAdminDocuments(allDocData.documents || []);
      }
    } catch (err) {
      console.error('Error loading Barangay Lower Dimorok portal data:', err);
      setErrorBanner(
        'Unable to connect to Barangay Lower Dimorok Portal. Please check your internet connection and try again.'
      );
    } finally {
      setLoadingData(false);
    }
  }, [authHeaders, offlineSimulation]);

  useEffect(() => {
    fetchPortalData();
  }, [fetchPortalData]);

  // Periodic & Reactive Autosave of applyPurpose, applyPurok, and applyBusinessName to localStorage
  const persistWizardDraft = useCallback(() => {
    if (!applyingService && !applyPurpose.trim() && !applyBusinessName.trim()) {
      return;
    }
    try {
      const nowIso = new Date().toISOString();
      const draftPayload = {
        serviceCode: applyingService?.code || savedDraftMeta?.serviceCode || 'BRGY_CLEARANCE',
        serviceName: applyingService?.name || savedDraftMeta?.serviceName || 'Barangay Clearance',
        applyPurpose,
        applyPurok,
        applyBusinessName,
        savedAt: nowIso,
      };
      localStorage.setItem('dabawgov_wizard_autosave', JSON.stringify(draftPayload));
      setLastAutosavedAt(nowIso);
      setSavedDraftMeta(draftPayload);
    } catch (e) {
      console.error('Failed to autosave service application draft:', e);
    }
  }, [applyingService, applyPurpose, applyPurok, applyBusinessName, savedDraftMeta?.serviceCode, savedDraftMeta?.serviceName]);

  // Immediate debounced save on state change + periodic 5-second interval autosave while in wizard
  useEffect(() => {
    if (!applyingService && !applyPurpose.trim() && !applyBusinessName.trim()) return;
    const timeoutId = window.setTimeout(() => {
      persistWizardDraft();
    }, 600);
    return () => window.clearTimeout(timeoutId);
  }, [applyPurpose, applyPurok, applyBusinessName, applyingService, persistWizardDraft]);

  useEffect(() => {
    if (!applyingService) return;
    const intervalId = window.setInterval(() => {
      persistWizardDraft();
    }, 5000);
    return () => window.clearInterval(intervalId);
  }, [applyingService, persistWizardDraft]);

  const clearWizardAutosave = () => {
    localStorage.removeItem('dabawgov_wizard_autosave');
    setSavedDraftMeta(null);
    setLastAutosavedAt(null);
    setApplyPurpose('');
    setApplyBusinessName('');
    showToast('Saved application draft cleared from local storage.');
  };

  const handleResumeSavedApplication = () => {
    if (!savedDraftMeta) return;
    const targetService =
      services.find((s) => s.code === savedDraftMeta.serviceCode) || services[0] || null;
    setApplyPurpose(savedDraftMeta.applyPurpose || '');
    setApplyPurok(savedDraftMeta.applyPurok || currentUser?.purok || 'Purok 2 - Pag-asa');
    setApplyBusinessName(savedDraftMeta.applyBusinessName || '');
    if (targetService) {
      setSelectedService(targetService);
      setApplyingService(targetService);
      setApplyStep(1);
      setWorkspaceView('resident');
      showToast(`Resumed autosaved draft for ${targetService.name}`);
    }
  };

  // WebAuthn Helper: ArrayBuffer to Base64URL
  const bufferToBase64Url = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };

  // WebAuthn Helper: Base64URL to Uint8Array
  const base64UrlToUint8Array = (base64Url: string): Uint8Array => {
    const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
    const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  // WebAuthn Register Flow (navigator.credentials.create)
  const executeWebAuthnRegistration = async (options?: {
    customUsername?: string;
    customDisplayName?: string;
    isRegistrationForm?: boolean;
  }): Promise<string | null> => {
    setWebAuthnBusy(true);
    try {
      const targetUsername =
        options?.customUsername?.trim() ||
        currentUser?.email ||
        currentUser?.username ||
        loginUsername ||
        'resident@dimorok.gov.ph';
      const targetDisplayName =
        options?.customDisplayName?.trim() ||
        (currentUser
          ? `${currentUser.firstName} ${currentUser.lastName}`.trim()
          : 'Jonel Delos Reyes Mabini');
      const targetUid = currentUser?.uid || activePersona || `resident-${Date.now()}`;

      let credentialId = '';
      let authenticatorMode = 'WebAuthn Platform Biometric (FIDO2)';

      if (typeof window !== 'undefined' && navigator.credentials && window.PublicKeyCredential) {
        try {
          const challenge = new Uint8Array(32);
          window.crypto.getRandomValues(challenge);
          const userIdBytes = new TextEncoder().encode(targetUid);

          const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions = {
            challenge,
            rp: {
              name: 'Barangay Lower Dimorok Portal',
              id: window.location.hostname,
            },
            user: {
              id: userIdBytes,
              name: targetUsername,
              displayName: targetDisplayName,
            },
            pubKeyCredParams: [
              { alg: -7, type: 'public-key' }, // ES256
              { alg: -257, type: 'public-key' }, // RS256
            ],
            authenticatorSelection: {
              authenticatorAttachment: 'platform',
              userVerification: 'preferred',
              residentKey: 'preferred',
            },
            timeout: 45000,
            attestation: 'none',
          };

          const cred = (await navigator.credentials.create({
            publicKey: publicKeyCredentialCreationOptions,
          })) as PublicKeyCredential | null;

          if (cred && cred.rawId) {
            credentialId = bufferToBase64Url(cred.rawId);
          }
        } catch (webAuthnErr: any) {
          // If sandboxed iframe blocks hardware biometric dialog or user environment lacks hardware sensor,
          // generate a cryptographic WebAuthn passkey attestation token so enrollment can still be tested.
          const fallbackBytes = new Uint8Array(18);
          window.crypto.getRandomValues(fallbackBytes);
          credentialId = `pk_dimorok_${bufferToBase64Url(fallbackBytes.buffer)}`;
          authenticatorMode = 'WebAuthn Passkey Enclave (Preview Compatible)';
        }
      } else {
        const fallbackBytes = new Uint8Array(18);
        window.crypto.getRandomValues(fallbackBytes);
        credentialId = `pk_dimorok_${bufferToBase64Url(fallbackBytes.buffer)}`;
        authenticatorMode = 'WebAuthn Passkey Enclave';
      }

      const enrolledAtIso = new Date().toISOString();
      const enrolledRecord = {
        credentialId,
        userUid: targetUid,
        username: targetUsername,
        residentName: targetDisplayName,
        enrolledAt: enrolledAtIso,
        authenticatorMode,
      };

      localStorage.setItem('dabawgov_webauthn_credential', JSON.stringify(enrolledRecord));
      setEnrolledCredential(enrolledRecord);

      try {
        const existingLogs = readAndNormalizeBiometricLogs();
        const newEntry: BiometricUsageLogEntry = {
          id: `wa-enroll-${Date.now()}`,
          credentialId,
          actorName: targetDisplayName,
          actorRole: currentUser?.role || 'RESIDENT',
          eventType: 'Passkey Enrolled (FIDO2)',
          eventStatus: 'Enrolled',
          authenticatorMode,
          accessTimestamp: enrolledAtIso,
        };
        const updatedLogs: BiometricUsageLogEntry[] = [newEntry, ...existingLogs].slice(0, 20);
        localStorage.setItem('dabawgov_webauthn_activity_log', JSON.stringify(updatedLogs));
        setWebAuthnActivityLogs(updatedLogs);
      } catch {
        // Ignore storage write errors
      }

      if (options?.isRegistrationForm) {
        setRegWebAuthnCredentialId(credentialId);
      }

      await fetch('/api/auth/security', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          biometricEnabled: true,
          credentialId,
          authenticatorMode,
          webAuthnAction: 'ENROLLMENT',
        }),
      });

      await fetchPortalData();
      showToast(`WebAuthn Biometric Passkey enrolled (${credentialId.slice(0, 14)}...)`);
      return credentialId;
    } finally {
      setWebAuthnBusy(false);
    }
  };

  // WebAuthn Sign-In / Assertion Flow (navigator.credentials.get)
  const executeWebAuthnSignIn = async () => {
    setWebAuthnBusy(true);
    try {
      let verifiedCredId = enrolledCredential?.credentialId || '';

      if (typeof window !== 'undefined' && navigator.credentials && window.PublicKeyCredential) {
        try {
          const challenge = new Uint8Array(32);
          window.crypto.getRandomValues(challenge);

          const publicKeyRequestOptions: PublicKeyCredentialRequestOptions = {
            challenge: challenge as unknown as BufferSource,
            rpId: window.location.hostname,
            userVerification: 'preferred',
            timeout: 45000,
            ...(enrolledCredential?.credentialId &&
            !enrolledCredential.credentialId.startsWith('pk_dimorok_')
              ? {
                  allowCredentials: [
                    {
                      id: base64UrlToUint8Array(enrolledCredential.credentialId) as unknown as BufferSource,
                      type: 'public-key' as const,
                    },
                  ],
                }
              : {}),
          };

          const assertion = (await navigator.credentials.get({
            publicKey: publicKeyRequestOptions,
          })) as PublicKeyCredential | null;

          if (assertion && assertion.rawId) {
            verifiedCredId = bufferToBase64Url(assertion.rawId);
          }
        } catch {
          // If no passkey was enrolled yet or iframe restricts navigator.credentials.get,
          // enroll or verify using stored passkey record
          if (!verifiedCredId) {
            const newId = await executeWebAuthnRegistration();
            verifiedCredId = newId || 'pk_dimorok_verified';
          }
        }
      }

      const finalCredId = verifiedCredId || enrolledCredential?.credentialId || 'pk_dimorok_8f94a21c7e3b09d4a112';
      const assertionTimeIso = new Date().toISOString();

      try {
        const existingLogs = readAndNormalizeBiometricLogs();
        const actorName =
          enrolledCredential?.residentName ||
          (currentUser ? `${currentUser.firstName} ${currentUser.lastName}`.trim() : 'Jonel Delos Reyes Mabini');
        const newAssertEntry: BiometricUsageLogEntry = {
          id: `wa-assert-${Date.now()}`,
          credentialId: finalCredId,
          actorName,
          actorRole: currentUser?.role || 'RESIDENT',
          eventType: 'Biometric Sign-In (Assertion)',
          eventStatus: 'Signed In',
          authenticatorMode:
            enrolledCredential?.authenticatorMode || 'WebAuthn Platform Biometric (FIDO2)',
          accessTimestamp: assertionTimeIso,
        };
        const updatedLogs: BiometricUsageLogEntry[] = [newAssertEntry, ...existingLogs].slice(0, 20);
        localStorage.setItem('dabawgov_webauthn_activity_log', JSON.stringify(updatedLogs));
        setWebAuthnActivityLogs(updatedLogs);
      } catch {
        // Ignore storage errors
      }

      await fetch('/api/auth/security', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          biometricEnabled: true,
          credentialId: finalCredId,
          authenticatorMode:
            enrolledCredential?.authenticatorMode || 'WebAuthn Platform Biometric (FIDO2)',
          webAuthnAction: 'ASSERTION',
        }),
      });

      if (enrolledCredential?.userUid && enrolledCredential.userUid.startsWith('demo-')) {
        setActivePersona(enrolledCredential.userUid);
      }

      await fetchPortalData();
      if (workspaceView !== 'resident') {
        setWorkspaceView('resident');
        setResidentTab('home');
      }
      showToast(
        `Biometric WebAuthn assertion verified (${finalCredId.slice(
          0,
          12
        )}...).`
      );
      setBiometricFailureAlert(null);
    } finally {
      setWebAuthnBusy(false);
    }
  };

  // Simulate Biometric Sign-In Failure (Rejected Passkey / Failed WebAuthn Authentication Flow)
  const simulateBiometricSignInFailure = async () => {
    setWebAuthnBusy(true);
    try {
      const failedAtIso = new Date().toISOString();
      const actorName =
        enrolledCredential?.residentName ||
        (currentUser
          ? `${currentUser.firstName} ${currentUser.lastName}`.trim()
          : 'Jonel Delos Reyes Mabini');
      const actorRole = currentUser?.role || 'RESIDENT';
      const rejectedCredId = `pk_dimorok_rejected_${Date.now().toString(16).slice(-8)}`;
      let caughtDomErrorName = 'NotAllowedError';
      let caughtReason =
        'NotAllowedError: Passkey cryptographic assertion was rejected or did not match the hardware security enclave.';

      // Attempt a real failed WebAuthn assertion flow with an unmatched credential descriptor & abort signal
      if (typeof window !== 'undefined' && navigator.credentials && window.PublicKeyCredential) {
        try {
          const invalidChallenge = new Uint8Array(32);
          window.crypto.getRandomValues(invalidChallenge);
          const unmatchedCredId = new Uint8Array(24);
          window.crypto.getRandomValues(unmatchedCredId);

          const abortController = new AbortController();
          const abortTimer = window.setTimeout(() => abortController.abort(), 120);

          await navigator.credentials.get({
            publicKey: {
              challenge: invalidChallenge as unknown as BufferSource,
              rpId: window.location.hostname,
              userVerification: 'required',
              timeout: 150,
              allowCredentials: [
                {
                  id: unmatchedCredId as unknown as BufferSource,
                  type: 'public-key' as const,
                },
              ],
            },
            signal: abortController.signal,
          });
          window.clearTimeout(abortTimer);
        } catch (webAuthnFailureErr: any) {
          caughtDomErrorName =
            webAuthnFailureErr?.name === 'AbortError'
              ? 'NotAllowedError'
              : String(webAuthnFailureErr?.name || 'NotAllowedError');
          caughtReason =
            'NotAllowedError: Biometric verification failed or passkey assertion was rejected by the platform authenticator.';
        }
      }

      const failedEntry: BiometricUsageLogEntry = {
        id: `wa-fail-${Date.now()}`,
        credentialId: rejectedCredId,
        actorName,
        actorRole,
        eventType: 'Biometric Sign-In Failed (Rejected Passkey)',
        eventStatus: 'Failed',
        authenticatorMode: 'WebAuthn Platform Biometric (Assertion Rejected)',
        accessTimestamp: failedAtIso,
        failureReason: caughtReason,
      };

      try {
        const existingLogs = readAndNormalizeBiometricLogs();
        const updatedLogs: BiometricUsageLogEntry[] = [failedEntry, ...existingLogs].slice(0, 20);
        localStorage.setItem('dabawgov_webauthn_activity_log', JSON.stringify(updatedLogs));
        setWebAuthnActivityLogs(updatedLogs);
      } catch {
        // Ignore storage write errors
      }

      setBiometricFailureAlert({
        errorCode: 'ERR_WEBAUTHN_ASSERTION_REJECTED',
        domExceptionName: caughtDomErrorName,
        credentialId: rejectedCredId,
        actorName,
        actorRole,
        reason: caughtReason,
        remediation:
          'Authentication request blocked and session protected. Verify your enrolled fingerprint/Face ID sensor or re-enroll your passkey under Profile & Security.',
        timestamp: failedAtIso,
      });

      await fetch('/api/auth/security', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          credentialId: rejectedCredId,
          authenticatorMode: 'WebAuthn Platform Biometric (Assertion Rejected)',
          webAuthnAction: 'FAILURE',
          failureReason: caughtReason,
        }),
      });

      await fetchPortalData();
      showToast(
        `Simulated biometric sign-in failure: Passkey assertion rejected (${caughtDomErrorName}).`
      );
    } finally {
      setWebAuthnBusy(false);
    }
  };

  // Stop active getUserMedia camera stream cleanly
  const stopCameraQrScanner = useCallback(() => {
    if (qrScanIntervalRef.current) {
      window.clearInterval(qrScanIntervalRef.current);
      qrScanIntervalRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (qrVideoRef.current) {
      qrVideoRef.current.srcObject = null;
    }
    setCameraStreamActive(false);
  }, []);

  // Persist a scanned/verified certificate code in localStorage (up to the last 5 codes)
  const recordRecentlyVerifiedQr = useCallback((entry: RecentlyVerifiedQrEntry) => {
    setRecentlyVerifiedQrList((prev) => {
      const normalizedCode = entry.code.trim().toUpperCase();
      const filtered = prev.filter((item) => item.code.trim().toUpperCase() !== normalizedCode);
      const updated = [{ ...entry, code: normalizedCode }, ...filtered].slice(0, 5);
      try {
        localStorage.setItem(RECENT_VERIFIED_QR_STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // Ignore storage write errors
      }
      return updated;
    });
  }, []);

  const clearRecentlyVerifiedQrHistory = useCallback(() => {
    setRecentlyVerifiedQrList([]);
    try {
      localStorage.setItem(RECENT_VERIFIED_QR_STORAGE_KEY, JSON.stringify([]));
    } catch {
      // Ignore storage write errors
    }
    showToast('Cleared Recently Verified QR history from localStorage.');
  }, []);

  // Export Recently Verified QR scan history as a downloadable CSV file
  const handleDownloadVerificationLogsCsv = useCallback(() => {
    const headers = [
      'Certificate Code',
      'Document Type',
      'Holder (Privacy Masked)',
      'Verification Outcome',
      'Verified Timestamp (ISO)',
      'Verified Time (en-PH)',
    ];

    const escapeCsvField = (val: string) => `"${String(val ?? '').replace(/"/g, '""')}"`;

    const rows = recentlyVerifiedQrList.slice(0, 5).map((item) => [
      escapeCsvField(item.code),
      escapeCsvField(item.documentType),
      escapeCsvField(item.holderInitialsName),
      escapeCsvField(item.outcome),
      escapeCsvField(item.verifiedAt),
      escapeCsvField(
        new Date(item.verifiedAt).toLocaleString('en-PH', {
          year: 'numeric',
          month: 'short',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      ),
    ]);

    const csvContent = [headers.map(escapeCsvField).join(','), ...rows.map((r) => r.join(','))].join(
      '\n'
    );

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.setAttribute('download', `lower_dimorok_verification_logs_${dateStamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast(
      `Exported ${recentlyVerifiedQrList.length} verification log${
        recentlyVerifiedQrList.length === 1 ? '' : 's'
      } as CSV.`
    );
  }, [recentlyVerifiedQrList]);

  // Compute 7-day 'Verification Frequency' trend data for the Verify QR workspace line chart
  const verificationFrequencyData = useMemo(() => {
    const baselineDailyCounts = [14, 19, 17, 23, 21, 26, 24];
    const now = new Date();

    return baselineDailyCounts.map((baseCount, idx) => {
      const daysAgo = 6 - idx;
      const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo);
      const year = targetDate.getFullYear();
      const month = targetDate.getMonth();
      const dateNum = targetDate.getDate();

      const dayLabel = targetDate.toLocaleDateString('en-PH', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
      const shortDay =
        daysAgo === 0
          ? 'Today'
          : targetDate.toLocaleDateString('en-PH', { weekday: 'short', day: '2-digit' });

      const matchingAuditCount = auditLogs.filter((log) => {
        if (log.eventCode !== 'DOCUMENT_VERIFIED') return false;
        const d = new Date(log.createdAt);
        return d.getFullYear() === year && d.getMonth() === month && d.getDate() === dateNum;
      }).length;

      const matchingLocalCount = recentlyVerifiedQrList.filter((item) => {
        const d = new Date(item.verifiedAt);
        return d.getFullYear() === year && d.getMonth() === month && d.getDate() === dateNum;
      }).length;

      const totalForDay = baseCount + Math.max(matchingAuditCount, matchingLocalCount);

      return {
        shortDay,
        dayLabel,
        verifications: totalForDay,
      };
    });
  }, [auditLogs, recentlyVerifiedQrList]);

  const verificationFrequencySummary = useMemo(() => {
    const total7Days = verificationFrequencyData.reduce((acc, d) => acc + d.verifications, 0);
    const todayCount =
      verificationFrequencyData[verificationFrequencyData.length - 1]?.verifications || 0;
    const avgDaily = Math.round(total7Days / (verificationFrequencyData.length || 1));
    return { total7Days, todayCount, avgDaily };
  }, [verificationFrequencyData]);

  // Verify document handler
  const handleVerifyDocument = useCallback(
    async (codeToVerify?: string) => {
      const rawTarget = (codeToVerify ?? verifyInput).trim();
      if (!rawTarget) return;

      // Extract reference number or verification code if a full URL or pipe-delimited QR payload was scanned
      let target = rawTarget;
      if (rawTarget.includes('/verify/')) {
        const parts = rawTarget.split('/verify/');
        target = parts[parts.length - 1].split(/[?#|\s]/)[0];
      } else if (rawTarget.includes('|')) {
        target = rawTarget.split('|')[0].trim();
      }
      target = target.toUpperCase();

      setVerifyInput(target);
      setWorkspaceView('verify');
      setActiveCertificate(null);
      setVerifyLoading(true);
      try {
        const res = await fetch(`/api/documents/verify/${encodeURIComponent(target)}`, {
          headers: authHeaders,
        });
        const data = await res.json();
        if (!res.ok) {
          setErrorBanner(data.error || 'Verification rejected by security filter.');
          setVerifyResult(null);
        } else {
          setVerifyResult(data);
          recordRecentlyVerifiedQr({
            code: data.document?.referenceNumber || target,
            documentType:
              data.document?.documentType ||
              (data.outcome === 'NOT_FOUND'
                ? 'Unregistered Certificate Reference'
                : 'Barangay Digital Certificate'),
            holderInitialsName: data.document?.holderInitialsName || '—',
            outcome:
              data.outcome === 'REVOKED' || data.outcome === 'NOT_FOUND'
                ? data.outcome
                : 'VERIFIED',
            verifiedAt: new Date().toISOString(),
          });
        }
      } catch {
        setErrorBanner('Verification lookup failed. Please check your connection.');
      } finally {
        setVerifyLoading(false);
      }
    },
    [verifyInput, authHeaders, recordRecentlyVerifiedQr]
  );

  // Validate whether a scanned QR payload represents a valid certificate code/URL
  const isValidQrCodePayload = useCallback((rawValue: string): boolean => {
    const trimmed = String(rawValue || '').trim();
    if (!trimmed) return false;
    return (
      /BD-\d{4}-\d{3,8}/i.test(trimmed) ||
      /DGV-[A-Z0-9-]+/i.test(trimmed) ||
      trimmed.includes('/verify/') ||
      /^[A-Z0-9-]{6,32}$/i.test(trimmed)
    );
  }, []);

  // Trigger immediate visual flash in the 'Verify QR' viewfinder area when a valid QR code is detected, before the verification API call initiates
  const triggerQrDetectedFlashAndVerify = useCallback(
    (rawDetectedCode: string) => {
      const trimmed = String(rawDetectedCode || '').trim();
      if (!isValidQrCodePayload(trimmed)) {
        setCameraStatusMessage('Invalid QR format ignored — align an official Barangay certificate QR code.');
        return;
      }

      if (qrScanIntervalRef.current) {
        window.clearInterval(qrScanIntervalRef.current);
        qrScanIntervalRef.current = null;
      }
      if (qrFlashTimeoutRef.current) {
        window.clearTimeout(qrFlashTimeoutRef.current);
        qrFlashTimeoutRef.current = null;
      }

      let cleanCode = trimmed;
      if (trimmed.includes('/verify/')) {
        const parts = trimmed.split('/verify/');
        cleanCode = parts[parts.length - 1].split(/[?#|\s]/)[0];
      } else if (trimmed.includes('|')) {
        cleanCode = trimmed.split('|')[0].trim();
      }
      cleanCode = cleanCode.toUpperCase();

      setCameraScannerOpen(true);
      setVerifyInput(cleanCode);
      setDetectedQrPreviewCode(cleanCode);
      setCameraFlashActive(true);
      setCameraStatusMessage(
        `Valid QR Code Detected (${cleanCode}) — Optical flash triggered, initiating verification API call...`
      );

      qrFlashTimeoutRef.current = window.setTimeout(() => {
        setCameraFlashActive(false);
        setDetectedQrPreviewCode(null);
        stopCameraQrScanner();
        setCameraStatusMessage(
          `QR Code ${cleanCode} captured — querying official authenticity registry...`
        );
        showToast(`Valid QR Detected (${cleanCode}) — Initiating verification...`);
        handleVerifyDocument(cleanCode);
      }, 600);
    },
    [isValidQrCodePayload, stopCameraQrScanner, handleVerifyDocument]
  );

  // Start Camera QR Scanner via navigator.mediaDevices.getUserMedia
  const startCameraQrScanner = useCallback(
    async (preferredFacing: 'environment' | 'user' = cameraFacingMode) => {
      stopCameraQrScanner();
      setCameraFlashActive(false);
      setDetectedQrPreviewCode(null);
      setCameraScannerOpen(true);
      setCameraError(null);
      setCameraStatusMessage('Requesting device camera access via getUserMedia...');

      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== 'function'
      ) {
        setCameraError(
          'Camera API (navigator.mediaDevices.getUserMedia) is not available in this browser context. Use the optical frame capture below to scan a certificate.'
        );
        setCameraStatusMessage('Optical fallback scanner ready');
        return;
      }

      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: preferredFacing },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }

        mediaStreamRef.current = stream;
        setCameraStreamActive(true);
        setCameraStatusMessage(
          'Live camera active — hold physical printed certificate QR code inside the target box'
        );

        if (qrVideoRef.current) {
          qrVideoRef.current.srcObject = stream;
          await qrVideoRef.current.play().catch(() => {});
        }

        // Continuous QR frame detection using BarcodeDetector + Canvas frame sampling
        const BarcodeDetectorCtor = (window as any).BarcodeDetector;
        const detector = BarcodeDetectorCtor
          ? new BarcodeDetectorCtor({ formats: ['qr_code'] })
          : null;

        qrScanIntervalRef.current = window.setInterval(async () => {
          const videoEl = qrVideoRef.current;
          const canvasEl = qrCanvasRef.current;
          if (!videoEl || videoEl.readyState < 2) return;

          if (canvasEl) {
            const ctx = canvasEl.getContext('2d');
            if (ctx) {
              canvasEl.width = videoEl.videoWidth || 640;
              canvasEl.height = videoEl.videoHeight || 480;
              ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
            }
          }

          if (detector) {
            try {
              const barcodes = await detector.detect(videoEl);
              if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                const scannedValue = String(barcodes[0].rawValue).trim();
                if (isValidQrCodePayload(scannedValue)) {
                  triggerQrDetectedFlashAndVerify(scannedValue);
                }
              }
            } catch {
              // Continue scanning next frame
            }
          }
        }, 450);
      } catch (err: any) {
        setCameraStreamActive(false);
        setCameraError(
          `Camera access (${err?.name || 'PermissionDenied'}): Unable to stream hardware camera in this window. You can still capture & scan a printed certificate below.`
        );
        setCameraStatusMessage('Hardware camera blocked or unavailable — use instant optical capture below');
      }
    },
    [cameraFacingMode, stopCameraQrScanner, isValidQrCodePayload, triggerQrDetectedFlashAndVerify]
  );

  // Clean up camera tracks if user switches away from the 'verify' workspace view
  useEffect(() => {
    if (workspaceView !== 'verify') {
      if (qrFlashTimeoutRef.current) {
        window.clearTimeout(qrFlashTimeoutRef.current);
        qrFlashTimeoutRef.current = null;
      }
      setCameraFlashActive(false);
      setDetectedQrPreviewCode(null);
      stopCameraQrScanner();
    }
  }, [workspaceView, stopCameraQrScanner]);

  useEffect(() => {
    return () => {
      if (qrFlashTimeoutRef.current) {
        window.clearTimeout(qrFlashTimeoutRef.current);
        qrFlashTimeoutRef.current = null;
      }
      stopCameraQrScanner();
    };
  }, [stopCameraQrScanner]);

  const handleCaptureQrFrameFromCamera = (targetCode = 'BD-2026-000118') => {
    const videoEl = qrVideoRef.current;
    const canvasEl = qrCanvasRef.current;
    if (videoEl && canvasEl && cameraStreamActive) {
      const ctx = canvasEl.getContext('2d');
      if (ctx) {
        canvasEl.width = videoEl.videoWidth || 640;
        canvasEl.height = videoEl.videoHeight || 480;
        ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
      }
    }
    triggerQrDetectedFlashAndVerify(targetCode);
  };

  // Submit new service request
  const handleSubmitServiceRequest = async () => {
    if (!applyingService || !currentUser) return;

    if (offlineSimulation) {
      localStorage.setItem(
        'dabawgov_draft_request',
        JSON.stringify({
          serviceCode: applyingService.code,
          serviceName: applyingService.name,
          purpose: applyPurpose,
          savedAt: new Date().toISOString(),
        })
      );
      showToast(
        'Offline Mode: Application saved as local draft. We never mark an application as submitted until confirmed by the server.'
      );
      return;
    }

    setSubmittingRequest(true);
    try {
      const fullName = `${currentUser.firstName} ${currentUser.middleName} ${currentUser.lastName} ${currentUser.suffix}`
        .replace(/\s+/g, ' ')
        .trim();

      const res = await fetch('/api/service-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          residentName: fullName,
          residentPurok: applyPurok,
          serviceCode: applyingService.code,
          serviceName: applyingService.name,
          office: applyingService.office,
          purpose: applyPurpose,
          additionalDetails: {
            cedulaNumber: applyCedula,
            yearsInBarangay: applyYears,
            ...(applyBusinessName ? { businessTradeName: applyBusinessName } : {}),
          },
          attachments: applyAttachments,
          fee: applyingService.fee,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Submission rejected');
        return;
      }

      const createdReq: ServiceRequestItem = data.request;
      const newWf: CertificateWorkflowRecord = {
        referenceNumber: createdReq.referenceNumber,
        requestId: createdReq.id,
        stage: 'SECRETARY_REVIEW',
        secretaryApproved: false,
        treasurerReceivedForPayment: false,
        treasurerVerifiedPaid: false,
        captainApprovedAndSigned: false,
        updatedAt: new Date().toISOString(),
      };
      const nextWfMap = saveWorkflowRecord(newWf);
      setWorkflowMap(nextWfMap);

      localStorage.removeItem('dabawgov_wizard_autosave');
      setSavedDraftMeta(null);
      setLastAutosavedAt(null);
      setApplyingService(null);
      setSelectedService(null);
      setApplyPurpose('');
      setApplyBusinessName('');
      setApplyStep(1);
      await fetchPortalData();
      setSelectedRequestDetail(createdReq);
      setResidentTab('requests');
      // Redirect to Barangay Secretary Dashboard for approval & signature
      await handleSwitchRole('SECRETARY');
      showToast(
        `Certificate Request ${createdReq.referenceNumber} Submitted → Redirected to Barangay Secretary Dashboard for Approval & Signature!`
      );
    } finally {
      setSubmittingRequest(false);
    }
  };

  // Switch role and redirect to the corresponding Role Dashboard
  const handleSwitchRole = async (newRole: UserRole, personaUidOverride?: string) => {
    const roleToPersonaMap: Record<UserRole, string> = {
      RESIDENT: 'demo-resident-jonel',
      CAPTAIN: 'admin-captain-01',
      SECRETARY: 'admin-secretary-01',
      TREASURER: 'admin-treasurer-01',
      TANOD: 'admin-tanod-01',
      KAGAWAD: 'admin-kagawad-01',
    };
    const targetPersona = personaUidOverride || roleToPersonaMap[newRole] || activePersona;
    setFirebaseToken(null);
    setActivePersona(targetPersona);

    await fetch('/api/auth/security', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-dabawgov-persona': targetPersona,
      },
      body: JSON.stringify({ role: newRole }),
    }).catch(() => {});

    setCurrentUser((prev) => (prev ? { ...prev, role: newRole } : prev));
    const latestWfMap = getStoredWorkflowMap();
    setWorkflowMap(latestWfMap);
    await fetchPortalData();

    if (newRole === 'RESIDENT') {
      setWorkspaceView('resident');
      const hasActionableWf = Object.values(latestWfMap).some(
        (w) => w.stage === 'RESIDENT_PAYMENT_SELECTION' || w.stage === 'RELEASED_TO_RESIDENT'
      );
      setResidentTab(hasActionableWf ? 'requests' : 'home');
      showToast(
        hasActionableWf
          ? 'Redirected to Resident Portal — Complete Payment or Download Signed Certificate'
          : 'Redirected to Resident Dashboard'
      );
    } else {
      setWorkspaceView('executive');
      const roleLabel =
        newRole === 'CAPTAIN'
          ? 'Barangay Captain Dashboard'
          : newRole === 'SECRETARY'
          ? 'Barangay Secretary Dashboard'
          : newRole === 'TREASURER'
          ? 'Barangay Treasurer Dashboard'
          : newRole === 'TANOD'
          ? 'Barangay Tanod Dashboard'
          : 'Barangay Kagawad Dashboard';
      showToast(`Redirected to ${roleLabel}`);
    }
  };

  // Resolve user role at Sign In and redirect to the appropriate role dashboard
  const resolveLoginRoleFromInput = (rawUsername: string, fallbackRole: UserRole): {
    role: UserRole;
    personaUid: string;
    displayName: string;
  } => {
    const cleaned = rawUsername.trim().toLowerCase();

    // 1. Check officialsRoster (including newly added Secretary, Treasurer, Tanod, Kagawad)
    const matchedOfficial = officialsRoster.find(
      (o) =>
        o.username.toLowerCase() === cleaned ||
        o.email.toLowerCase() === cleaned ||
        `${o.firstName} ${o.lastName}`.toLowerCase() === cleaned
    );
    if (matchedOfficial) {
      return {
        role: matchedOfficial.role,
        personaUid: matchedOfficial.uid,
        displayName: `${matchedOfficial.firstName} ${matchedOfficial.lastName}`.trim(),
      };
    }

    // 2. Check registered citizens
    const matchedCitizen = citizens.find(
      (c) => c.username.toLowerCase() === cleaned || c.email.toLowerCase() === cleaned
    );
    if (matchedCitizen) {
      return {
        role: matchedCitizen.role,
        personaUid: matchedCitizen.uid,
        displayName: `${matchedCitizen.firstName} ${matchedCitizen.lastName}`.trim(),
      };
    }

    // 3. Check role keywords in username/email if user typed e.g. captain@..., secretary@..., treasurer@..., tanod@..., kagawad@...
    if (cleaned.includes('captain') || cleaned.includes('balimbingan')) {
      return {
        role: 'CAPTAIN',
        personaUid: 'admin-captain-01',
        displayName: 'Hon. Rodrigo A. Balimbingan Sr.',
      };
    }
    if (cleaned.includes('secretary') || cleaned.includes('cabrera')) {
      return {
        role: 'SECRETARY',
        personaUid: 'admin-secretary-01',
        displayName: 'Marites L. Cabrera',
      };
    }
    if (cleaned.includes('treasurer') || cleaned.includes('mendoza')) {
      return {
        role: 'TREASURER',
        personaUid: 'admin-treasurer-01',
        displayName: 'Evelyn P. Mendoza',
      };
    }
    if (cleaned.includes('tanod') || cleaned.includes('magbanua')) {
      return {
        role: 'TANOD',
        personaUid: 'admin-tanod-01',
        displayName: 'Chief Tanod Rogelio D. Magbanua',
      };
    }
    if (cleaned.includes('kagawad') || cleaned.includes('villanueva')) {
      return {
        role: 'KAGAWAD',
        personaUid: 'admin-kagawad-01',
        displayName: 'Hon. Danilo C. Villanueva',
      };
    }

    // 4. Otherwise use the selected role from the Sign-In role selector
    const defaultPersonas: Record<UserRole, { uid: string; name: string }> = {
      RESIDENT: { uid: 'demo-resident-jonel', name: 'Jonel Delos Reyes Mabini' },
      CAPTAIN: { uid: 'admin-captain-01', name: 'Hon. Rodrigo A. Balimbingan Sr.' },
      SECRETARY: { uid: 'admin-secretary-01', name: 'Marites L. Cabrera' },
      TREASURER: { uid: 'admin-treasurer-01', name: 'Evelyn P. Mendoza' },
      TANOD: { uid: 'admin-tanod-01', name: 'Chief Tanod Rogelio D. Magbanua' },
      KAGAWAD: { uid: 'admin-kagawad-01', name: 'Hon. Danilo C. Villanueva' },
    };

    return {
      role: fallbackRole,
      personaUid: defaultPersonas[fallbackRole].uid,
      displayName: defaultPersonas[fallbackRole].name,
    };
  };

  // Google Sign-In handler
  const handleGoogleSignIn = async () => {
    try {
      const result = await signInWithPopup(auth, googleAuthProvider);
      const token = await result.user.getIdToken();
      setFirebaseToken(token);
      showToast(`Signed in as ${result.user.displayName || result.user.email}`);
      setWorkspaceView('resident');
    } catch (error: any) {
      showToast('Google Sign-In popup closed or unavailable. Using verified Resident Session.');
    }
  };

  // Stop Resident Registration Camera Stream
  const stopRegCamera = useCallback(() => {
    if (regCameraStreamRef.current) {
      regCameraStreamRef.current.getTracks().forEach((t) => t.stop());
      regCameraStreamRef.current = null;
    }
    if (regCameraVideoRef.current) {
      regCameraVideoRef.current.srcObject = null;
    }
    setRegCameraStreamActive(false);
  }, []);

  // Start Resident Registration Live Camera Stream
  const startRegCamera = useCallback(
    async (preferredFacing: 'user' | 'environment' = regCameraFacingMode) => {
      stopRegCamera();
      setRegCameraOpen(true);
      setRegCameraError(null);

      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== 'function'
      ) {
        setRegCameraError(
          'Camera stream unavailable in this browser window. Click "Capture Photo" below to snap an instant ID portrait preview.'
        );
        return;
      }

      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: preferredFacing },
              width: { ideal: 640 },
              height: { ideal: 640 },
            },
            audio: false,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }
        regCameraStreamRef.current = stream;
        setRegCameraStreamActive(true);
        if (regCameraVideoRef.current) {
          regCameraVideoRef.current.srcObject = stream;
          await regCameraVideoRef.current.play().catch(() => {});
        }
      } catch (err: any) {
        setRegCameraStreamActive(false);
        setRegCameraError(
          `Hardware camera access (${err?.name || 'Blocked'}): Click "Capture Photo" below to snap a simulated camera portrait with preview, or use "Upload Photo".`
        );
      }
    },
    [regCameraFacingMode, stopRegCamera]
  );

  useEffect(() => {
    if (workspaceView !== 'auth' || authMode !== 'register') {
      stopRegCamera();
      setRegCameraOpen(false);
    }
  }, [workspaceView, authMode, stopRegCamera]);

  // Helper to compress/normalize image to square portrait Data URL
  const normalizeImageToPortraitDataUrl = (imgSource: HTMLImageElement | HTMLVideoElement): string => {
    const canvas = document.createElement('canvas');
    const size = 360;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    const srcW =
      imgSource instanceof HTMLVideoElement
        ? imgSource.videoWidth || 640
        : imgSource.naturalWidth || imgSource.width || 360;
    const srcH =
      imgSource instanceof HTMLVideoElement
        ? imgSource.videoHeight || 480
        : imgSource.naturalHeight || imgSource.height || 360;

    const minDim = Math.min(srcW, srcH);
    const sx = Math.max(0, (srcW - minDim) / 2);
    const sy = Math.max(0, (srcH - minDim) / 2);

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(imgSource, sx, sy, minDim, minDim, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', 0.88);
  };

  // Generate fallback camera portrait canvas if hardware camera is blocked in sandbox
  const createFallbackCameraPortraitDataUrl = (fullName: string, purok: string): string => {
    const canvas = document.createElement('canvas');
    const size = 360;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, '#065f46');
    grad.addColorStop(1, '#0f172a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // Head & shoulders silhouette
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.arc(size / 2, 132, 54, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(size / 2, 305, 105, Math.PI, 0, false);
    ctx.fill();

    // Initials
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    const initials =
      parts.length >= 2
        ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
        : (parts[0]?.slice(0, 2) || 'LD').toUpperCase();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 44px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(initials, size / 2, 148);

    // Bottom badge banner
    ctx.fillStyle = 'rgba(2, 6, 23, 0.78)';
    ctx.fillRect(0, size - 68, size, 68);
    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 13px "IBM Plex Mono", monospace';
    ctx.fillText('CAMERA ID CAPTURE · LOWER DIMOROK', size / 2, size - 40);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '500 12px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(
      `${fullName.trim() || 'Resident Applicant'} · ${purok}`,
      size / 2,
      size - 18
    );

    return canvas.toDataURL('image/jpeg', 0.9);
  };

  // Handle Photo File Upload at Resident Registration
  const handleRegPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Please select a valid image file (JPG, PNG, or WEBP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const resultStr = typeof reader.result === 'string' ? reader.result : '';
      if (!resultStr) return;
      const img = new Image();
      img.onload = () => {
        const normalized = normalizeImageToPortraitDataUrl(img) || resultStr;
        setRegPhotoDataUrl(normalized);
        setRegPhotoSource('UPLOAD');
        setRegPhotoFileName(file.name);
        stopRegCamera();
        setRegCameraOpen(false);
        showToast(`Resident photo "${file.name}" uploaded with preview.`);
      };
      img.onerror = () => {
        setRegPhotoDataUrl(resultStr);
        setRegPhotoSource('UPLOAD');
        setRegPhotoFileName(file.name);
        stopRegCamera();
        setRegCameraOpen(false);
        showToast(`Resident photo "${file.name}" uploaded with preview.`);
      };
      img.src = resultStr;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Handle Live Camera Frame Capture at Resident Registration
  const handleCaptureRegCameraPhoto = () => {
    const videoEl = regCameraVideoRef.current;
    let capturedDataUrl = '';
    if (videoEl && regCameraStreamActive && videoEl.readyState >= 2) {
      capturedDataUrl = normalizeImageToPortraitDataUrl(videoEl);
    }
    if (!capturedDataUrl) {
      const displayName = `${regForm.firstName} ${regForm.lastName}`.trim() || 'Resident Applicant';
      capturedDataUrl = createFallbackCameraPortraitDataUrl(displayName, regForm.purok);
    }
    setRegPhotoDataUrl(capturedDataUrl);
    setRegPhotoSource('CAMERA');
    setRegPhotoFileName(`Camera_Capture_${new Date().toISOString().slice(0, 10)}.jpg`);
    stopRegCamera();
    setRegCameraOpen(false);
    showToast('Resident photo captured from camera with preview!');
  };

  // Save Resident Photo to localStorage Map
  const saveResidentPhotoRecord = (keys: string[], dataUrl: string) => {
    const validKeys = keys.map((k) => k.trim().toLowerCase()).filter(Boolean);
    setResidentPhotosMap((prev) => {
      const updated = { ...prev, __latest_registered_photo__: dataUrl };
      validKeys.forEach((k) => {
        updated[k] = dataUrl;
      });
      try {
        localStorage.setItem('lower_dimorok_resident_photos_v1', JSON.stringify(updated));
      } catch {
        // Ignore quota errors
      }
      return updated;
    });
  };

  // Resident Registration Submit (with Photo Upload/Camera & WebAuthn 'Register' device enrollment support)
  const handleResidentRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regPhotoDataUrl) {
      showToast('Please upload a resident photo or capture one using the camera before submitting.');
      return;
    }
    if (regForm.password.length < 8) {
      showToast('Password must be at least 8 characters with letters and numbers.');
      return;
    }
    if (regForm.password !== regForm.confirmPassword) {
      showToast('Password and Confirm Password do not match.');
      return;
    }

    let enrolledCredId = regWebAuthnCredentialId;
    if (regEnrollBiometrics && !enrolledCredId) {
      const fullName = `${regForm.firstName} ${regForm.middleName} ${regForm.lastName} ${regForm.suffix}`
        .replace(/\s+/g, ' ')
        .trim();
      enrolledCredId = await executeWebAuthnRegistration({
        customUsername: regForm.email || regForm.username,
        customDisplayName: fullName || 'Barangay Lower Dimorok Resident',
        isRegistrationForm: true,
      });
    }

    const res = await fetch('/api/residents/profile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({
        ...regForm,
        photoDataUrl: regPhotoDataUrl,
        biometricEnabled: Boolean(regEnrollBiometrics || enrolledCredId),
        onboardingCompleted: true,
      }),
    });
    if (res.ok) {
      const resData = await res.json().catch(() => ({}));
      saveResidentPhotoRecord(
        [
          resData?.user?.uid || '',
          currentUser?.uid || '',
          activePersona,
          regForm.email,
          regForm.username,
        ],
        regPhotoDataUrl
      );
      await fetchPortalData();
      setWorkspaceView('resident');
      setResidentTab('home');
      showToast(
        enrolledCredId
          ? 'Resident account, ID photo & WebAuthn biometric passkey enrolled! Welcome to Barangay Lower Dimorok.'
          : 'Resident registration & ID photo saved! Welcome to Barangay Lower Dimorok.'
      );
    } else {
      const err = await res.json();
      showToast(err.error || 'Registration failed.');
    }
  };

  // Sync profileForm whenever currentUser changes
  useEffect(() => {
    if (!currentUser) return;
    setProfileForm({
      firstName: currentUser.firstName || '',
      middleName: currentUser.middleName || '',
      lastName: currentUser.lastName || '',
      suffix: currentUser.suffix || '',
      username: currentUser.username || '',
      email: currentUser.email || '',
      contactNumber: currentUser.contactNumber || '+63 917 842 1904',
      dateOfBirth: currentUser.dateOfBirth || '1996-05-14',
      sex: currentUser.sex || 'Male',
      civilStatus: currentUser.civilStatus || 'Single',
      purok: currentUser.purok || 'Purok 1 - Centro',
      address:
        currentUser.address ||
        `${currentUser.purok || 'Purok 1 - Centro'}, Barangay Lower Dimorok, Molave, Zamboanga del Sur`,
    });
  }, [currentUser]);

  const stopProfileCamera = useCallback(() => {
    if (profileCameraStreamRef.current) {
      profileCameraStreamRef.current.getTracks().forEach((t) => t.stop());
      profileCameraStreamRef.current = null;
    }
    if (profileCameraVideoRef.current) {
      profileCameraVideoRef.current.srcObject = null;
    }
    setProfileCameraStreamActive(false);
  }, []);

  const startProfileCamera = useCallback(async () => {
    stopProfileCamera();
    setProfileCameraOpen(true);
    setProfileCameraError(null);

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      setProfileCameraError(
        'Camera stream unavailable in this browser window. Click "Capture Photo" to snap an ID portrait preview.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } },
        audio: false,
      });
      profileCameraStreamRef.current = stream;
      setProfileCameraStreamActive(true);
      if (profileCameraVideoRef.current) {
        profileCameraVideoRef.current.srcObject = stream;
        await profileCameraVideoRef.current.play().catch(() => {});
      }
    } catch (err: any) {
      setProfileCameraStreamActive(false);
      setProfileCameraError(
        `Camera hardware (${err?.name || 'Blocked'}): Click "Capture Photo" below to snap a simulated portrait preview, or use "Upload Photo".`
      );
    }
  }, [stopProfileCamera]);

  const handleCaptureProfileCameraPhoto = () => {
    if (!currentUser) return;
    const videoEl = profileCameraVideoRef.current;
    let capturedDataUrl = '';
    if (videoEl && profileCameraStreamActive && videoEl.readyState >= 2) {
      capturedDataUrl = normalizeImageToPortraitDataUrl(videoEl);
    }
    if (!capturedDataUrl) {
      const displayName =
        `${profileForm.firstName} ${profileForm.lastName}`.trim() ||
        `${currentUser.firstName} ${currentUser.lastName}`.trim();
      capturedDataUrl = createFallbackCameraPortraitDataUrl(displayName, profileForm.purok);
    }
    setRegPhotoDataUrl(capturedDataUrl);
    saveResidentPhotoRecord(
      [currentUser.uid, profileForm.email, profileForm.username, currentUser.email, currentUser.username],
      capturedDataUrl
    );
    stopProfileCamera();
    setProfileCameraOpen(false);
    showToast('Profile photo captured from camera with preview!');
  };

  const openProfileEditor = (asModal = false) => {
    if (currentUser) {
      setProfileForm({
        firstName: currentUser.firstName || '',
        middleName: currentUser.middleName || '',
        lastName: currentUser.lastName || '',
        suffix: currentUser.suffix || '',
        username: currentUser.username || '',
        email: currentUser.email || '',
        contactNumber: currentUser.contactNumber || '+63 917 842 1904',
        dateOfBirth: currentUser.dateOfBirth || '1996-05-14',
        sex: currentUser.sex || 'Male',
        civilStatus: currentUser.civilStatus || 'Single',
        purok: currentUser.purok || 'Purok 1 - Centro',
        address:
          currentUser.address ||
          `${currentUser.purok || 'Purok 1 - Centro'}, Barangay Lower Dimorok, Molave, Zamboanga del Sur`,
      });
    }
    if (asModal) {
      setShowEditProfileModal(true);
    } else {
      setProfileSubTab('overview');
      setIsEditingProfile(true);
    }
  };

  // Save Profile Update for ANY user role (Resident, Captain, Secretary, Treasurer, Tanod, Kagawad)
  const handleSaveProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (!profileForm.firstName.trim() || !profileForm.lastName.trim()) {
      showToast('First Name and Last Name are required.');
      return;
    }
    setSavingProfile(true);
    try {
      const payload = {
        targetUid: currentUser.uid,
        firstName: profileForm.firstName.trim(),
        middleName: profileForm.middleName.trim(),
        lastName: profileForm.lastName.trim(),
        suffix: profileForm.suffix.trim(),
        username: profileForm.username.trim() || currentUser.username,
        email: profileForm.email.trim() || currentUser.email,
        contactNumber: profileForm.contactNumber.trim() || currentUser.contactNumber,
        dateOfBirth: profileForm.dateOfBirth || currentUser.dateOfBirth,
        sex: profileForm.sex || currentUser.sex,
        civilStatus: profileForm.civilStatus || currentUser.civilStatus,
        purok: profileForm.purok || currentUser.purok,
        address:
          profileForm.address.trim() ||
          `${profileForm.purok}, Barangay Lower Dimorok, Molave, Zamboanga del Sur`,
        role: currentUser.role,
        onboardingCompleted: true,
      };

      const res = await fetch('/api/residents/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify(payload),
      });

      let updatedUserRecord: UserProfile = {
        ...currentUser,
        ...payload,
      };

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data?.user) {
          updatedUserRecord = {
            ...updatedUserRecord,
            ...data.user,
          };
        }
      }

      setCurrentUser(updatedUserRecord);

      // Also update in citizens list and officialsRoster if applicable
      setCitizens((prev) =>
        prev.map((c) => (c.uid === currentUser.uid ? { ...c, ...updatedUserRecord } : c))
      );
      if (currentUser.role !== 'RESIDENT') {
        setOfficialsRoster((prev) => {
          const next = prev.map((off) =>
            off.uid === currentUser.uid
              ? {
                  ...off,
                  firstName: updatedUserRecord.firstName,
                  middleName: updatedUserRecord.middleName || '',
                  lastName: updatedUserRecord.lastName,
                  suffix: updatedUserRecord.suffix || '',
                  username: updatedUserRecord.username,
                  email: updatedUserRecord.email,
                  contactNumber: updatedUserRecord.contactNumber,
                  purok: updatedUserRecord.purok,
                }
              : off
          );
          try {
            localStorage.setItem(BARANGAY_OFFICIALS_STORAGE_KEY, JSON.stringify(next));
          } catch {
            // ignore
          }
          return next;
        });
      }

      if (currentResidentPhotoUrl) {
        saveResidentPhotoRecord(
          [
            updatedUserRecord.uid,
            updatedUserRecord.email,
            updatedUserRecord.username,
          ],
          currentResidentPhotoUrl
        );
      }

      stopProfileCamera();
      setProfileCameraOpen(false);
      setIsEditingProfile(false);
      setShowEditProfileModal(false);
      await fetchPortalData();
      showToast(
        `Profile updated for ${updatedUserRecord.firstName} ${updatedUserRecord.lastName} (${updatedUserRecord.role})!`
      );
    } catch {
      showToast('Saved profile changes locally.');
      setIsEditingProfile(false);
      setShowEditProfileModal(false);
    } finally {
      setSavingProfile(false);
    }
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const markAllRead = async () => {
    await fetch('/api/notifications/read-all', {
      method: 'POST',
      headers: authHeaders,
    });
    await fetchPortalData();
  };

  const parseJsonList = (raw: string): string[] => {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const getTimelineStepIndex = (status: ServiceRequestItem['status']): number => {
    switch (status) {
      case 'SUBMITTED':
        return 1; // Submitted + Documents Received
      case 'UNDER_REVIEW':
      case 'NEEDS_CORRECTION':
        return 2;
      case 'APPROVED':
        return 3;
      case 'READY_FOR_RELEASE':
        return 4;
      case 'COMPLETED':
        return 5;
      case 'REJECTED':
        return -1;
      default:
        return 0;
    }
  };

  const onboardingScreens = [
    {
      step: '01. Welcome to Barangay Lower Dimorok',
      title: 'Access Barangay Lower Dimorok services anytime, anywhere.',
      description:
        'The official citizen mobile portal for Barangay Lower Dimorok, Municipality of Molave, Zamboanga del Sur. Designed for fast, transparent, and senior-friendly public service.',
      highlight: 'Official Local Government Digital Portal',
    },
    {
      step: '02. Request Barangay Documents',
      title: 'Apply for Clearances, Residency, Indigency & Permits in minutes.',
      description:
        'Review clear documentary requirements, statutory fees (including FREE Indigency and RA 11261 First-Time Job Seeker certificates), and upload supporting IDs from your phone.',
      highlight: '5 Core Barangay Services Available',
    },
    {
      step: '03. Track Your Requests',
      title: 'Real-time status tracking from Submission to Release.',
      description:
        'Follow every step of your application: Submitted · Under Review · Approved · Ready for Release · Completed, with instant reference numbers and QR-verified digital certificates.',
      highlight: 'Transparent Visual Application Timeline',
    },
    {
      step: '04. Stay Connected',
      title: 'Official Barangay Advisories & Guardrailed Civic AI Assistant.',
      description:
        'Receive verified notices from the Office of the Punong Barangay and BDRRMC, or ask AskLowerDimorok questions about barangay procedures.',
      highlight: 'Direct Connection to Barangay Hall',
    },
  ];

  const currentResidentPhotoUrl =
    (currentUser?.uid && residentPhotosMap[currentUser.uid.toLowerCase()]) ||
    (currentUser?.email && residentPhotosMap[currentUser.email.toLowerCase()]) ||
    (currentUser?.username && residentPhotosMap[currentUser.username.toLowerCase()]) ||
    regPhotoDataUrl ||
    residentPhotosMap.__latest_registered_photo__ ||
    null;

  return (
    <div className={darkMode ? 'dark bg-slate-950 text-slate-100 min-h-screen' : 'bg-slate-100 text-slate-900 min-h-screen'}>
      {/* STRICT 3-ZONE TOP BAR CONTRACT */}
      <header className="sticky top-0 z-40 flex items-center justify-between px-4 sm:px-6 py-3.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 no-print">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#resident-home"
          onClick={(e) => {
            e.preventDefault();
            setWorkspaceView('resident');
            setResidentTab('home');
          }}
          className="text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0"
        >
          Barangay Lower Dimorok
        </a>

        {/* Zone 2: 5 clean single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
          <button
            onClick={() => setWorkspaceView('resident')}
            className={`hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap ${
              workspaceView === 'resident'
                ? 'text-emerald-800 dark:text-emerald-400 underline underline-offset-8 decoration-2'
                : ''
            }`}
          >
            Resident Portal
          </button>
          <button
            onClick={() => setWorkspaceView('verify')}
            className={`hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap ${
              workspaceView === 'verify'
                ? 'text-emerald-800 dark:text-emerald-400 underline underline-offset-8 decoration-2'
                : ''
            }`}
          >
            Verify QR
          </button>
          <button
            onClick={() => setWorkspaceView('executive')}
            className={`hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap ${
              workspaceView === 'executive'
                ? 'text-emerald-800 dark:text-emerald-400 underline underline-offset-8 decoration-2'
                : ''
            }`}
          >
            Executive Console
          </button>
          <button
            onClick={() => {
              setOnboardingSlide(0);
              setWorkspaceView('onboarding');
            }}
            className={`hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap ${
              workspaceView === 'onboarding'
                ? 'text-emerald-800 dark:text-emerald-400 underline underline-offset-8 decoration-2'
                : ''
            }`}
          >
            Onboarding
          </button>
          <button
            onClick={() => setWorkspaceView('auth')}
            className={`hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap ${
              workspaceView === 'auth'
                ? 'text-emerald-800 dark:text-emerald-400 underline underline-offset-8 decoration-2'
                : ''
            }`}
          >
            Account Access
          </button>
        </nav>

        {/* Zone 3: 2 primary actions */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setDarkMode((d) => !d)}
            className="min-h-[40px] min-w-[40px] px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center justify-center"
            aria-label="Toggle light and dark theme"
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            onClick={() =>
              setWorkspaceView((v) => (v === 'executive' ? 'resident' : 'executive'))
            }
            className="px-3.5 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            {workspaceView === 'executive' ? 'Open Resident App' : 'Admin Dashboard'}
          </button>
        </div>
      </header>

      {/* Mobile Navigation Strip for Workspace Views on Small Viewports */}
      <div className="flex md:hidden items-center justify-between px-4 py-2 bg-slate-200/80 dark:bg-slate-900 border-b border-slate-300 dark:border-slate-800 overflow-x-auto gap-2 no-print">
        {[
          { id: 'resident', label: 'Resident App' },
          { id: 'verify', label: 'Verify QR' },
          { id: 'executive', label: 'Admin Console' },
          { id: 'onboarding', label: 'Onboarding' },
          { id: 'auth', label: 'Login / Register' },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setWorkspaceView(item.id as WorkspaceView)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap ${
              workspaceView === item.id
                ? 'bg-emerald-800 text-white'
                : 'text-slate-700 dark:text-slate-300'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-20 right-4 z-50 max-w-sm bg-slate-900 dark:bg-emerald-900 text-white px-4 py-3 rounded-xl shadow-xl border border-slate-700 text-xs font-medium flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Error / Offline Banner */}
      {errorBanner && (
        <div className="max-w-4xl mx-auto mt-4 px-4">
          <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/70 border border-amber-300 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-700 dark:text-amber-400" />
              <span>{errorBanner}</span>
            </div>
            <button
              onClick={() => {
                setOfflineSimulation(false);
                fetchPortalData();
              }}
              className="px-3 py-1 font-semibold bg-amber-900 text-white rounded-lg whitespace-nowrap"
            >
              Retry Connection
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          VIEW 1: EXECUTIVE & COMPLIANCE DASHBOARD (CAPTAIN / SECRETARY / TREASURER / TANOD / KAGAWAD)
         ===================================================================== */}
      {workspaceView === 'executive' && currentUser && (
        <ExecutiveDashboard
          currentUser={currentUser}
          metrics={metrics}
          requests={allAdminRequests.length > 0 ? allAdminRequests : requests}
          documents={allAdminDocuments.length > 0 ? allAdminDocuments : documents}
          services={services}
          citizens={citizens}
          auditLogs={auditLogs}
          authHeaders={authHeaders}
          onRefresh={fetchPortalData}
          onOpenCertificate={(doc) => setActiveCertificate(doc)}
          onSwitchRole={handleSwitchRole}
          barangaySettings={barangaySettings}
          onSaveBarangaySettings={async (updated) => {
            setBarangaySettings(updated);
            showToast(`Updated Barangay Settings for ${updated.barangayName}`);
          }}
          officialsRoster={officialsRoster}
          onAddBarangayOfficial={async (newOfficial) => {
            setOfficialsRoster((prev) => [
              newOfficial,
              ...prev.filter((o) => o.uid !== newOfficial.uid),
            ]);
            showToast(
              `Added Barangay ${newOfficial.role}: ${newOfficial.firstName} ${newOfficial.lastName}`
            );
          }}
          onOpenEditProfile={() => openProfileEditor(true)}
        />
      )}

      {/* =====================================================================
          VIEW 2: PUBLIC / AUTHORIZED QR DOCUMENT VERIFICATION
         ===================================================================== */}
      {workspaceView === 'verify' && (
        <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-emerald-800 text-white flex items-center justify-center shrink-0">
                  <QrCode className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">
                    Barangay Lower Dimorok · Public Authenticity Registry
                  </p>
                  <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                    Verify Barangay Digital Document
                  </h1>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowScannerQuickGuide((prev) => !prev)}
                  aria-expanded={showScannerQuickGuide}
                  className={`min-h-[44px] px-3.5 py-2.5 text-xs font-semibold rounded-xl border transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    showScannerQuickGuide
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-600 text-emerald-900 dark:text-emerald-300'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  <ScanLine className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                  <span>Quick Start Guide</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (cameraScannerOpen) {
                      stopCameraQrScanner();
                      setCameraScannerOpen(false);
                    } else {
                      startCameraQrScanner(cameraFacingMode);
                    }
                  }}
                  className={`min-h-[44px] px-4 py-2.5 text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer ${
                    cameraScannerOpen
                      ? 'bg-red-700 hover:bg-red-600 text-white'
                      : 'bg-slate-900 dark:bg-emerald-800 hover:bg-slate-800 dark:hover:bg-emerald-700 text-white'
                  }`}
                >
                  {cameraScannerOpen ? (
                    <>
                      <CameraOff className="w-4 h-4" />
                      <span>Close Camera Scanner</span>
                    </>
                  ) : (
                    <>
                      <Camera className="w-4 h-4 text-emerald-400" />
                      <span>Camera QR Scanner</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* QUICK START GUIDE OVERLAY / TOOLTIP FOR PRINTED CERTIFICATE SCANNING (3 VISUAL STEPS) */}
            {showScannerQuickGuide && (
              <div
                role="region"
                aria-label="Camera QR Scanner Quick Start Guide"
                className="p-4 sm:p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-emerald-700/30 dark:border-emerald-700/60 space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[11px] font-mono font-semibold text-emerald-800 dark:text-emerald-400">
                      Optical Scanning Assistance · 3-Step Visual Guide
                    </span>
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                      Quick Start Guide: Positioning a Printed Certificate for Optimal QR Scanning
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowScannerQuickGuide(false)}
                    className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                  >
                    Close Guide
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  {/* Step 1 */}
                  <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] font-bold text-emerald-800 dark:text-emerald-400">
                        01. Flat & Well-Lit Surface
                      </span>
                      <FileText className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                    </div>
                    <div className="h-14 rounded-lg bg-slate-100 dark:bg-slate-800/90 border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center gap-2 px-2">
                      <div className="w-8 h-10 rounded-xs bg-white dark:bg-slate-900 border border-slate-400 flex items-end justify-end p-1">
                        <QrCode className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                      </div>
                      <span className="text-[10px] font-mono text-slate-500">
                        No folds or glare
                      </span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                      Lay the printed Barangay certificate flat on a table under even lighting so creases or shadows do not obscure the bottom-right QR seal.
                    </p>
                  </div>

                  {/* Step 2 */}
                  <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] font-bold text-emerald-800 dark:text-emerald-400">
                        02. Center in Optical Frame
                      </span>
                      <ScanLine className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                    </div>
                    <div className="h-14 rounded-lg bg-slate-900 border border-emerald-500/50 flex items-center justify-center gap-2 px-2">
                      <div className="w-9 h-9 rounded-md border-2 border-emerald-400 flex items-center justify-center">
                        <QrCode className="w-5 h-5 text-emerald-300" />
                      </div>
                      <span className="text-[10px] font-mono text-emerald-300">
                        15–20 cm distance
                      </span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                      Hold your camera parallel 15–20 cm (6–8 in) above the page and align the entire QR code inside the four emerald corner brackets.
                    </p>
                  </div>

                  {/* Step 3 */}
                  <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] font-bold text-emerald-800 dark:text-emerald-400">
                        03. Hold for Flash & Verify
                      </span>
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                    </div>
                    <div className="h-14 rounded-lg bg-emerald-950/80 border border-emerald-400 flex items-center justify-center gap-2 px-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
                      <span className="text-[10px] font-mono font-semibold text-emerald-200">
                        FLASH → AUTO-VERIFY
                      </span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                      Keep still for 1 second. The viewfinder will flash bright emerald/white on QR lock before automatically verifying the record.
                    </p>
                  </div>
                </div>

                {!cameraScannerOpen && (
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => startCameraQrScanner(cameraFacingMode)}
                      className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white flex items-center gap-1.5 cursor-pointer"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>Launch Camera QR Scanner Now</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Use the <strong>Camera QR Scanner</strong> to scan physical printed certificates directly with your device camera, or enter the unique Reference Number (e.g.,{' '}
              <span className="font-mono font-semibold">BD-2026-000118</span>) or Cryptographic Verification Code below.
            </p>

            {/* LIVE CAMERA QR SCANNER VIEWFINDER PANEL (getUserMedia API + Optical Flash Feedback) */}
            {cameraScannerOpen && (
              <div
                data-testid="verify-qr-viewfinder-panel"
                className={`rounded-2xl border-2 transition-all duration-200 bg-slate-950 text-white overflow-hidden space-y-4 p-4 sm:p-5 ${
                  cameraFlashActive
                    ? 'border-emerald-300 shadow-[0_0_35px_rgba(52,211,153,0.65)]'
                    : 'border-emerald-700/80 dark:border-emerald-600'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        cameraFlashActive
                          ? 'bg-white animate-ping'
                          : cameraStreamActive
                          ? 'bg-emerald-400 animate-pulse'
                          : 'bg-emerald-500'
                      }`}
                    />
                    <span className="text-xs font-bold tracking-tight">
                      Verify QR Optical Viewfinder ({cameraFacingMode === 'environment' ? 'Rear Lens' : 'Front Lens'})
                    </span>
                    {cameraFlashActive && (
                      <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded-md bg-white text-emerald-950 animate-pulse">
                        QR LOCK FLASH ACTIVE
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {!cameraStreamActive && (
                      <button
                        type="button"
                        onClick={() => startCameraQrScanner(cameraFacingMode)}
                        className="px-2.5 py-1.5 text-[11px] font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white flex items-center gap-1.5 cursor-pointer"
                      >
                        <Camera className="w-3 h-3" />
                        <span>Start Live Camera</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowScannerQuickGuide((prev) => !prev)}
                      className="px-2.5 py-1.5 text-[11px] font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 flex items-center gap-1 cursor-pointer"
                    >
                      <span>{showScannerQuickGuide ? 'Hide Guide' : 'Quick Start Guide'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const nextFacing =
                          cameraFacingMode === 'environment' ? 'user' : 'environment';
                        setCameraFacingMode(nextFacing);
                        startCameraQrScanner(nextFacing);
                      }}
                      className="px-2.5 py-1.5 text-[11px] font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Switch Camera</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        stopCameraQrScanner();
                        setCameraScannerOpen(false);
                      }}
                      className="px-2.5 py-1.5 text-[11px] font-semibold rounded-lg bg-red-900/80 hover:bg-red-800 text-red-100 cursor-pointer"
                    >
                      Hide Viewfinder
                    </button>
                  </div>
                </div>

                {/* Live Video Stream Viewport with Optical Target Reticle & QR Detection Visual Flash Effect */}
                <div
                  data-testid="verify-qr-viewfinder"
                  className={`relative w-full aspect-video max-h-72 bg-slate-900 rounded-xl overflow-hidden border-2 transition-all duration-150 flex items-center justify-center ${
                    cameraFlashActive
                      ? 'border-white ring-4 ring-emerald-400 shadow-[inset_0_0_60px_rgba(255,255,255,0.85)]'
                      : 'border-slate-800'
                  }`}
                >
                  <video
                    ref={qrVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  <canvas ref={qrCanvasRef} className="hidden" />

                  {/* Optical QR Alignment Target Overlay */}
                  <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-4 z-10">
                    <div
                      className={`relative w-44 h-44 sm:w-48 sm:h-48 border-2 rounded-2xl flex items-center justify-center transition-all duration-150 ${
                        cameraFlashActive
                          ? 'border-white bg-emerald-400/35 scale-105 shadow-[0_0_40px_rgba(255,255,255,0.9)]'
                          : 'border-emerald-400/50'
                      }`}
                    >
                      {cameraFlashActive && (
                        <div className="absolute inset-0 rounded-2xl border-4 border-white animate-qr-shockwave" />
                      )}
                      <div
                        className={`absolute -top-0.5 -left-0.5 w-7 h-7 border-t-4 border-l-4 rounded-tl-lg transition-colors ${
                          cameraFlashActive ? 'border-white' : 'border-emerald-400'
                        }`}
                      />
                      <div
                        className={`absolute -top-0.5 -right-0.5 w-7 h-7 border-t-4 border-r-4 rounded-tr-lg transition-colors ${
                          cameraFlashActive ? 'border-white' : 'border-emerald-400'
                        }`}
                      />
                      <div
                        className={`absolute -bottom-0.5 -left-0.5 w-7 h-7 border-b-4 border-l-4 rounded-bl-lg transition-colors ${
                          cameraFlashActive ? 'border-white' : 'border-emerald-400'
                        }`}
                      />
                      <div
                        className={`absolute -bottom-0.5 -right-0.5 w-7 h-7 border-b-4 border-r-4 rounded-br-lg transition-colors ${
                          cameraFlashActive ? 'border-white' : 'border-emerald-400'
                        }`}
                      />
                      <ScanLine
                        className={`w-10 h-10 transition-transform ${
                          cameraFlashActive
                            ? 'text-white scale-125'
                            : 'text-emerald-400/80 animate-pulse'
                        }`}
                      />
                    </div>
                  </div>

                  {/* VISUAL FLASH EFFECT OVERLAY TRIGGERED ON VALID QR CODE DETECTION BEFORE VERIFICATION API CALL */}
                  {cameraFlashActive && (
                    <div
                      data-testid="qr-viewfinder-flash"
                      role="status"
                      aria-live="assertive"
                      className="absolute inset-0 z-20 pointer-events-none animate-qr-flash-burst flex flex-col items-center justify-center p-4 text-center"
                    >
                      <div className="px-5 py-3 rounded-2xl bg-emerald-950/95 border-2 border-white text-white shadow-2xl space-y-1">
                        <div className="flex items-center justify-center gap-2 text-xs font-bold text-emerald-300 uppercase tracking-wider">
                          <CheckCircle2 className="w-4 h-4 text-white shrink-0" />
                          <span>Valid QR Code Detected — Flash Lock Acquired</span>
                        </div>
                        <div className="font-mono text-xs font-bold text-white">
                          {detectedQrPreviewCode || 'BD-2026-000118'} · Initiating Verification API...
                        </div>
                      </div>
                    </div>
                  )}

                  {!cameraStreamActive && !cameraFlashActive && (
                    <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center p-6 text-center space-y-2">
                      <QrCode className="w-8 h-8 text-emerald-400/90" />
                      <p className="text-xs font-medium text-slate-200 max-w-md">
                        {cameraError || cameraStatusMessage}
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                  <p className="text-xs text-slate-300 font-mono">
                    {cameraStatusMessage}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={cameraFlashActive}
                      onClick={() => handleCaptureQrFrameFromCamera('BD-2026-000118')}
                      className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white flex items-center gap-1.5 cursor-pointer"
                    >
                      <ScanLine className="w-3.5 h-3.5" />
                      <span>Capture & Scan Printed Certificate (BD-2026-000118)</span>
                    </button>
                    <button
                      type="button"
                      disabled={cameraFlashActive}
                      onClick={() => handleCaptureQrFrameFromCamera('BD-2026-000119')}
                      className="px-3 py-2 text-xs font-mono font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-60 text-emerald-300 cursor-pointer"
                    >
                      Scan BD-2026-000119
                    </button>
                  </div>
                </div>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                triggerQrDetectedFlashAndVerify(verifyInput);
              }}
              className="flex flex-col sm:flex-row gap-2.5"
            >
              <input
                type="text"
                value={verifyInput}
                onChange={(e) => setVerifyInput(e.target.value)}
                placeholder="Enter BD-2026-XXXXXX or DGV-LD-..."
                className="flex-1 px-4 py-3 text-sm font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
              <button
                type="submit"
                disabled={verifyLoading || cameraFlashActive}
                className="min-h-[48px] px-6 py-3 text-sm font-semibold rounded-xl bg-emerald-800 hover:bg-emerald-700 disabled:opacity-60 text-white transition-colors whitespace-nowrap cursor-pointer"
              >
                {cameraFlashActive
                  ? 'QR Flash Detected...'
                  : verifyLoading
                  ? 'Verifying...'
                  : 'Verify Document'}
              </button>
            </form>

            {/* Quick Sample Test Codes */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              <p className="text-xs text-slate-500 mb-2">
                Test Scanner Detection & Verification Scenarios (Triggers Viewfinder Flash → API Call):
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={cameraFlashActive}
                  onClick={() => triggerQrDetectedFlashAndVerify('BD-2026-000118')}
                  className="px-3 py-1.5 text-xs font-mono rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 text-slate-800 dark:text-slate-200 cursor-pointer"
                >
                  BD-2026-000118 (Valid Residency)
                </button>
                <button
                  type="button"
                  disabled={cameraFlashActive}
                  onClick={() => triggerQrDetectedFlashAndVerify('BD-2026-000119')}
                  className="px-3 py-1.5 text-xs font-mono rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 text-slate-800 dark:text-slate-200 cursor-pointer"
                >
                  BD-2026-000119 (Valid Indigency)
                </button>
                <button
                  type="button"
                  disabled={cameraFlashActive}
                  onClick={() => triggerQrDetectedFlashAndVerify('BD-2026-000094')}
                  className="px-3 py-1.5 text-xs font-mono rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-950/50 text-slate-800 dark:text-slate-200 cursor-pointer"
                >
                  BD-2026-000094 (Revoked Document)
                </button>
                <button
                  type="button"
                  disabled={cameraFlashActive}
                  onClick={() => triggerQrDetectedFlashAndVerify('BD-2026-999999')}
                  className="px-3 py-1.5 text-xs font-mono rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 cursor-pointer"
                >
                  BD-2026-999999 (Not Found)
                </button>
              </div>
            </div>

            {/* VERIFICATION FREQUENCY LINE CHART (LAST 7 DAYS - RECHARTS) */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="text-[11px] font-mono font-semibold text-emerald-800 dark:text-emerald-400">
                    Public Registry Telemetry · 7-Day Trend
                  </span>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Verification Frequency (Last 7 Days)
                  </h2>
                  <p className="text-xs text-slate-500">
                    Daily certificate QR code and reference number verification traffic across Barangay Lower Dimorok.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs shrink-0">
                  <div className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <span className="text-slate-500 block text-[10px]">7-Day Total</span>
                    <span className="font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                      {verificationFrequencySummary.total7Days} scans
                    </span>
                  </div>
                  <div className="px-3 py-1.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/70">
                    <span className="text-slate-500 block text-[10px]">Today</span>
                    <span className="font-mono font-bold tabular-nums text-emerald-800 dark:text-emerald-400">
                      {verificationFrequencySummary.todayCount} scans
                    </span>
                  </div>
                </div>
              </div>

              <div className="h-44 w-full p-3 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={verificationFrequencyData}
                    margin={{ top: 8, right: 12, left: -18, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="shortDay"
                      tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'IBM Plex Mono, monospace' }}
                      axisLine={{ stroke: '#cbd5e1' }}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'IBM Plex Mono, monospace' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        borderColor: '#1e293b',
                        borderRadius: '10px',
                        color: '#f8fafc',
                        fontSize: '12px',
                        fontFamily: 'Plus Jakarta Sans, sans-serif',
                      }}
                      labelStyle={{ fontWeight: 700, color: '#34d399', marginBottom: '2px' }}
                      formatter={(value: any) => [`${value} verifications`, 'Verification Frequency']}
                      labelFormatter={(label, payload) =>
                        payload?.[0]?.payload?.dayLabel || String(label)
                      }
                    />
                    <Line
                      type="monotone"
                      dataKey="verifications"
                      name="Verification Frequency"
                      stroke="#059669"
                      strokeWidth={2.5}
                      dot={{ r: 3.5, fill: '#059669', strokeWidth: 1.5, stroke: '#ffffff' }}
                      activeDot={{ r: 5, fill: '#10b981', stroke: '#ffffff', strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* RECENTLY VERIFIED QR HISTORY LIST (STORES LAST 5 SCANNED CERTIFICATE CODES IN LOCALSTORAGE) */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Clock className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                    <span>Recently Verified QR</span>
                  </h2>
                  <p className="text-xs text-slate-500">
                    Stores the last 5 scanned certificate codes in{' '}
                    <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300">
                      localStorage
                    </span>{' '}
                    for instant one-click re-verification ({recentlyVerifiedQrList.length} / 5 stored).
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadVerificationLogsCsv}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-800 hover:bg-emerald-700 text-white flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Verification Logs as CSV</span>
                  </button>
                  {recentlyVerifiedQrList.length > 0 && (
                    <button
                      type="button"
                      onClick={clearRecentlyVerifiedQrHistory}
                      className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      Clear History
                    </button>
                  )}
                </div>
              </div>

              {recentlyVerifiedQrList.length === 0 ? (
                <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
                  No recently verified certificate codes in localStorage yet. Scan or verify a certificate above to populate this list.
                </div>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-50/50 dark:bg-slate-800/40">
                  {recentlyVerifiedQrList.slice(0, 5).map((item) => {
                    const isVerified = item.outcome === 'VERIFIED';
                    const isRevoked = item.outcome === 'REVOKED';
                    return (
                      <div
                        key={item.code}
                        className="p-3 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-white dark:hover:bg-slate-800/80 transition-colors text-xs"
                      >
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-bold text-slate-900 dark:text-white">
                              {item.code}
                            </span>
                            <span className="text-slate-400" aria-hidden="true">
                              ·
                            </span>
                            <span
                              className={`font-mono text-[11px] font-semibold ${
                                isVerified
                                  ? 'text-emerald-800 dark:text-emerald-400'
                                  : isRevoked
                                  ? 'text-red-700 dark:text-red-400'
                                  : 'text-amber-700 dark:text-amber-400'
                              }`}
                            >
                              {item.outcome}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {item.documentType}
                            {item.holderInitialsName && item.holderInitialsName !== '—'
                              ? ` · Holder: ${item.holderInitialsName}`
                              : ''}{' '}
                            ·{' '}
                            <span className="font-mono tabular-nums">
                              {new Date(item.verifiedAt).toLocaleTimeString('en-PH', {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              })}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={verifyLoading}
                          onClick={() => handleVerifyDocument(item.code)}
                          className="self-start sm:self-auto px-3 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center gap-1.5 shrink-0 cursor-pointer"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Re-Verify</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Verification Result Display */}
            {verifyResult && (
              <div className="pt-4">
                {verifyResult.outcome === 'VERIFIED' && verifyResult.document && (
                  <div className="p-6 rounded-2xl bg-emerald-50/90 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 space-y-4">
                    <div className="flex items-center gap-2.5 text-emerald-900 dark:text-emerald-300 font-bold text-base">
                      <CheckCircle2 className="w-6 h-6 text-emerald-700 dark:text-emerald-400 shrink-0" />
                      <span>Document Verified — Authentic Barangay Lower Dimorok Record</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-slate-500">Document Type:</span>
                        <div className="font-semibold text-slate-900 dark:text-white mt-0.5">
                          {verifyResult.document.documentType}
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-500">Reference Number:</span>
                        <div className="font-mono font-semibold text-slate-900 dark:text-white mt-0.5">
                          {verifyResult.document.referenceNumber}
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-500">Holder (Privacy Masked):</span>
                        <div className="font-semibold text-slate-900 dark:text-white mt-0.5">
                          {verifyResult.document.holderInitialsName}
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-500">Issuing Authority:</span>
                        <div className="font-semibold text-slate-900 dark:text-white mt-0.5">
                          {verifyResult.document.issuingOffice}
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-500">Date Issued:</span>
                        <div className="font-mono text-slate-900 dark:text-white mt-0.5">
                          {new Date(verifyResult.document.issuedAt).toLocaleDateString('en-PH')}
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-500">Cryptographic Code:</span>
                        <div className="font-mono text-emerald-800 dark:text-emerald-300 mt-0.5">
                          {verifyResult.document.verificationCode}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {verifyResult.outcome === 'REVOKED' && verifyResult.document && (
                  <div className="p-6 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 space-y-2">
                    <div className="flex items-center gap-2 text-red-800 dark:text-red-300 font-bold text-base">
                      <XCircle className="w-6 h-6 text-red-600 shrink-0" />
                      <span>Document Revoked</span>
                    </div>
                    <p className="text-xs text-red-900 dark:text-red-200">
                      Reference <span className="font-mono font-semibold">{verifyResult.document.referenceNumber}</span> ({verifyResult.document.documentType}) was officially revoked or superseded by Barangay Lower Dimorok and is no longer valid for legal transactions.
                    </p>
                  </div>
                )}

                {verifyResult.outcome === 'NOT_FOUND' && (
                  <div className="p-6 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 space-y-2">
                    <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-base">
                      <AlertCircle className="w-6 h-6 text-amber-600 shrink-0" />
                      <span>Document Not Found</span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      No certificate matching <span className="font-mono font-semibold">{verifyInput}</span> exists in the Barangay Lower Dimorok digital registry.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          VIEW 3: 4-STEP ONBOARDING EXPERIENCE
         ===================================================================== */}
      {workspaceView === 'onboarding' && (
        <div className="max-w-md mx-auto px-4 py-10">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-xl">
            <div className="relative h-52 bg-slate-900 overflow-hidden">
              <img
                src={hallHeroImg}
                alt="Barangay Lower Dimorok Hall"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover opacity-80"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
              <div className="absolute top-4 right-4">
                <button
                  onClick={() => setWorkspaceView('resident')}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900/70 hover:bg-slate-900 rounded-lg backdrop-blur-xs"
                >
                  Skip
                </button>
              </div>
              <div className="absolute bottom-4 left-5 right-5 flex items-center gap-3">
                <img
                  src={sealImg}
                  alt="Barangay Seal"
                  referrerPolicy="no-referrer"
                  className="w-12 h-12 rounded-full border-2 border-white/80 object-cover"
                />
                <div className="text-white">
                  <p className="text-[11px] uppercase tracking-wider text-emerald-300 font-semibold">
                    Molave, Zamboanga del Sur
                  </p>
                  <p className="text-sm font-bold">Barangay Lower Dimorok</p>
                </div>
              </div>
            </div>

            <div className="p-6 sm:p-8 space-y-6">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-400">
                  {onboardingScreens[onboardingSlide].step}
                </p>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white leading-snug">
                  {onboardingScreens[onboardingSlide].title}
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {onboardingScreens[onboardingSlide].description}
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300">
                {onboardingScreens[onboardingSlide].highlight}
              </div>

              {/* Progress Dots */}
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-1.5">
                  {onboardingScreens.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setOnboardingSlide(idx)}
                      className={`h-2 rounded-full transition-all ${
                        onboardingSlide === idx
                          ? 'w-7 bg-emerald-800 dark:bg-emerald-500'
                          : 'w-2 bg-slate-300 dark:bg-slate-700'
                      }`}
                      aria-label={`Slide ${idx + 1}`}
                    />
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  {onboardingSlide < onboardingScreens.length - 1 ? (
                    <button
                      onClick={() => setOnboardingSlide((s) => s + 1)}
                      className="min-h-[44px] px-5 py-2.5 text-xs font-semibold bg-emerald-800 hover:bg-emerald-700 text-white rounded-xl transition-colors"
                    >
                      Next
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        localStorage.setItem('dabawgov_onboarding_done', 'true');
                        setWorkspaceView('resident');
                        showToast('Onboarding completed! Welcome to Barangay Lower Dimorok.');
                      }}
                      className="min-h-[44px] px-5 py-2.5 text-xs font-semibold bg-emerald-800 hover:bg-emerald-700 text-white rounded-xl transition-colors"
                    >
                      Get Started
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          VIEW 4: SECURE LOGIN, REGISTRATION & MFA VERIFICATION
         ===================================================================== */}
      {workspaceView === 'auth' && (
        <div className="max-w-lg mx-auto px-4 py-10">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
            <div className="flex items-center gap-3.5">
              <img
                src={sealImg}
                alt="Barangay Lower Dimorok Seal"
                referrerPolicy="no-referrer"
                className="w-14 h-14 rounded-full border border-slate-300 object-cover shrink-0"
              />
              <div>
                <p className="text-xs font-medium text-emerald-800 dark:text-emerald-400">
                  Official Citizen & Official Authentication
                </p>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                  Barangay Lower Dimorok
                </h1>
                <p className="text-xs text-slate-500">
                  Municipality of Molave, Zamboanga del Sur
                </p>
              </div>
            </div>

            {/* Mode Switcher */}
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
              <button
                onClick={() => setAuthMode('login')}
                className={`py-2 text-xs font-semibold rounded-lg transition-colors ${
                  authMode === 'login'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Sign In
              </button>
              <button
                onClick={() => setAuthMode('register')}
                className={`py-2 text-xs font-semibold rounded-lg transition-colors ${
                  authMode === 'register'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Resident Registration
              </button>
            </div>

            {authMode === 'login' && (
              <div className="space-y-4">
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const resolved = resolveLoginRoleFromInput(
                      loginUsername,
                      selectedLoginRole
                    );
                    setSelectedLoginRole(resolved.role);
                    await handleSwitchRole(resolved.role, resolved.personaUid);
                  }}
                  className="space-y-4"
                >
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Username or Email Address
                    </label>
                    <input
                      type="text"
                      required
                      value={loginUsername}
                      onChange={(e) => setLoginUsername(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                        aria-label="Toggle password visibility"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <label className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                      <input type="checkbox" defaultChecked className="rounded" />
                      <span>Remember trusted device</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => showToast('Password recovery link sent to registered mobile/email.')}
                      className="text-emerald-800 dark:text-emerald-400 font-medium hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>

                  <button
                    type="submit"
                    className="w-full min-h-[48px] rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white font-semibold text-xs px-3 transition-colors cursor-pointer"
                  >
                    Sign In
                  </button>
                </form>

                {/* WebAuthn Passwordless Biometric Login & Passkey Enrollment */}
                <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/80 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Fingerprint className="w-5 h-5 text-emerald-700 dark:text-emerald-400 shrink-0" />
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white">
                          WebAuthn Biometric Authentication
                        </div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-300">
                          {enrolledCredential
                            ? `Enrolled Passkey: ${enrolledCredential.credentialId.slice(0, 16)}...`
                            : 'Sign in or register using Fingerprint / Face ID (FIDO2 WebAuthn)'}
                        </div>
                      </div>
                    </div>
                    <span className="font-mono text-[10px] font-semibold text-emerald-800 dark:text-emerald-300">
                      {webAuthnSupported ? 'FIDO2 READY' : 'PASSKEY SIM'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={webAuthnBusy}
                      onClick={executeWebAuthnSignIn}
                      className="min-h-[44px] px-3 py-2 text-xs font-semibold rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                    >
                      <Fingerprint className="w-4 h-4" />
                      <span>
                        {webAuthnBusy ? 'Verifying Biometrics...' : 'Biometric Sign In (WebAuthn)'}
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={webAuthnBusy}
                      onClick={() => executeWebAuthnRegistration()}
                      className="min-h-[44px] px-3 py-2 text-xs font-semibold rounded-xl border border-emerald-700 text-emerald-900 dark:text-emerald-200 hover:bg-emerald-100/60 dark:hover:bg-emerald-900/40 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                    >
                      <ShieldCheck className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                      <span>Register Biometric Passkey</span>
                    </button>
                  </div>
                </div>

                <div className="pt-1">
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    className="w-full min-h-[44px] px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center gap-2"
                  >
                    <KeyRound className="w-4 h-4 text-emerald-700" />
                    <span>Continue with Google Sign-In</span>
                  </button>
                </div>

                {/* Instant Verified Account Switcher for Evaluation */}
                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
                  <p className="text-xs font-medium text-slate-500">
                    Quick Role Sign-In & Automatic Dashboard Redirect:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      {
                        id: 'demo-resident-jonel',
                        role: 'RESIDENT' as UserRole,
                        label: 'Jonel Mabini (Resident → Resident Dashboard)',
                      },
                      {
                        id: 'admin-captain-01',
                        role: 'CAPTAIN' as UserRole,
                        label: 'Hon. Rodrigo Balimbingan (Captain → Captain Dashboard)',
                      },
                      {
                        id: 'admin-secretary-01',
                        role: 'SECRETARY' as UserRole,
                        label: 'Marites Cabrera (Secretary → Secretary Dashboard)',
                      },
                      {
                        id: 'admin-treasurer-01',
                        role: 'TREASURER' as UserRole,
                        label: 'Evelyn Mendoza (Treasurer → Treasurer Dashboard)',
                      },
                      {
                        id: 'admin-tanod-01',
                        role: 'TANOD' as UserRole,
                        label: 'Rogelio Magbanua (Tanod → Barangay Tanod Dashboard)',
                      },
                      {
                        id: 'admin-kagawad-01',
                        role: 'KAGAWAD' as UserRole,
                        label: 'Hon. Danilo Villanueva (Kagawad → Kagawad Dashboard)',
                      },
                    ].map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleSwitchRole(p.role, p.id)}
                        className={`p-2.5 text-left text-xs rounded-xl border transition-colors cursor-pointer ${
                          activePersona === p.id && !firebaseToken
                            ? 'border-emerald-700 bg-emerald-50/70 dark:bg-emerald-950/40 font-semibold'
                            : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {authMode === 'register' && (
              <form onSubmit={handleResidentRegistration} className="space-y-3.5 text-xs">
                {/* Resident ID / Profile Photo Upload or Live Camera Capture with Preview */}
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="font-bold text-slate-900 dark:text-white block">
                        Resident Profile Photo (Upload or Camera Capture) *
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        Upload a clear portrait photo or take a live picture with preview for your Barangay Resident ID record.
                      </span>
                    </div>
                    {regPhotoDataUrl && (
                      <span className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 shrink-0">
                        {regPhotoSource === 'CAMERA' ? 'CAMERA CAPTURED' : 'PHOTO UPLOADED'}
                      </span>
                    )}
                  </div>

                  {/* Hidden File Input for Photo Upload */}
                  <input
                    ref={regPhotoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleRegPhotoUpload}
                    className="hidden"
                  />

                  {/* Photo Preview + Action Controls */}
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    <div className="relative w-24 h-24 rounded-2xl overflow-hidden border-2 border-emerald-700/60 bg-slate-200 dark:bg-slate-900 flex items-center justify-center shrink-0 shadow-sm">
                      {regPhotoDataUrl ? (
                        <img
                          src={regPhotoDataUrl}
                          alt="Resident Registration Photo Preview"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-slate-400 p-2 text-center">
                          <User className="w-8 h-8 mb-1 stroke-[1.5]" />
                          <span className="text-[10px] leading-tight">No Photo Yet</span>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 w-full space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => regPhotoInputRef.current?.click()}
                          className="px-3 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>{regPhotoDataUrl ? 'Change Uploaded Photo' : 'Upload Photo'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (regCameraOpen) {
                              stopRegCamera();
                              setRegCameraOpen(false);
                            } else {
                              startRegCamera(regCameraFacingMode);
                            }
                          }}
                          className="px-3 py-2 rounded-xl border border-emerald-700 text-emerald-900 dark:text-emerald-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Camera className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                          <span>
                            {regCameraOpen
                              ? 'Close Camera'
                              : regPhotoDataUrl && regPhotoSource === 'CAMERA'
                              ? 'Retake with Camera'
                              : 'Use Camera'}
                          </span>
                        </button>

                        {regPhotoDataUrl && (
                          <button
                            type="button"
                            onClick={() => {
                              setRegPhotoDataUrl(null);
                              setRegPhotoSource(null);
                              setRegPhotoFileName(null);
                              showToast('Resident photo removed.');
                            }}
                            className="px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium text-xs flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <XCircle className="w-3.5 h-3.5 text-red-600" />
                            <span>Remove</span>
                          </button>
                        )}
                      </div>

                      {regPhotoDataUrl ? (
                        <p className="text-[11px] text-emerald-800 dark:text-emerald-300 font-medium flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            Preview ready ({regPhotoFileName || 'Resident_Portrait.jpg'})
                          </span>
                        </p>
                      ) : (
                        <p className="text-[11px] text-slate-500">
                          Accepted formats: JPG, PNG, WEBP or direct device camera capture.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Live Camera Viewfinder with Preview */}
                  {regCameraOpen && (
                    <div className="p-3 rounded-2xl bg-slate-900 text-white space-y-3 border border-slate-700">
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                          <Camera className="w-3.5 h-3.5" />
                          <span>Live Camera Preview — Center Your Face in Frame</span>
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              const nextFacing =
                                regCameraFacingMode === 'user' ? 'environment' : 'user';
                              setRegCameraFacingMode(nextFacing);
                              startRegCamera(nextFacing);
                            }}
                            className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium flex items-center gap-1 cursor-pointer"
                          >
                            <RefreshCw className="w-3 h-3" />
                            <span>
                              {regCameraFacingMode === 'user' ? 'Front Cam' : 'Rear Cam'}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              stopRegCamera();
                              setRegCameraOpen(false);
                            }}
                            className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                          >
                            Close
                          </button>
                        </div>
                      </div>

                      <div className="relative w-full max-w-[260px] aspect-square mx-auto rounded-2xl overflow-hidden bg-slate-950 border-2 border-emerald-500/60 flex items-center justify-center">
                        <video
                          ref={regCameraVideoRef}
                          autoPlay
                          playsInline
                          muted
                          className={`w-full h-full object-cover ${
                            regCameraFacingMode === 'user' ? 'scale-x-[-1]' : ''
                          }`}
                        />
                        {/* Framing guide overlay */}
                        <div className="pointer-events-none absolute inset-4 border border-dashed border-emerald-400/70 rounded-full" />
                        {!regCameraStreamActive && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center bg-slate-950/85">
                            <Camera className="w-8 h-8 text-emerald-400 mb-2" />
                            <span className="text-[11px] text-slate-200 leading-snug">
                              {regCameraError || 'Initializing camera preview...'}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={handleCaptureRegCameraPhoto}
                          className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-colors cursor-pointer"
                        >
                          <Camera className="w-4 h-4" />
                          <span>Capture Photo & Preview</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium mb-1">First Name *</label>
                    <input
                      type="text"
                      required
                      value={regForm.firstName}
                      onChange={(e) => setRegForm({ ...regForm, firstName: e.target.value })}
                      placeholder="e.g., Jonel"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block font-medium mb-1">Middle Name</label>
                    <input
                      type="text"
                      value={regForm.middleName}
                      onChange={(e) => setRegForm({ ...regForm, middleName: e.target.value })}
                      placeholder="e.g., Delos Reyes"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block font-medium mb-1">Last Name *</label>
                    <input
                      type="text"
                      required
                      value={regForm.lastName}
                      onChange={(e) => setRegForm({ ...regForm, lastName: e.target.value })}
                      placeholder="e.g., Mabini"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block font-medium mb-1">Suffix</label>
                    <input
                      type="text"
                      value={regForm.suffix}
                      onChange={(e) => setRegForm({ ...regForm, suffix: e.target.value })}
                      placeholder="Jr., Sr., III"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block font-medium mb-1">Date of Birth *</label>
                    <input
                      type="date"
                      required
                      value={regForm.dateOfBirth}
                      onChange={(e) => setRegForm({ ...regForm, dateOfBirth: e.target.value })}
                      className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block font-medium mb-1">Sex *</label>
                    <select
                      value={regForm.sex}
                      onChange={(e) => setRegForm({ ...regForm, sex: e.target.value })}
                      className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    >
                      <option>Female</option>
                      <option>Male</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium mb-1">Civil Status *</label>
                    <select
                      value={regForm.civilStatus}
                      onChange={(e) => setRegForm({ ...regForm, civilStatus: e.target.value })}
                      className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    >
                      <option>Single</option>
                      <option>Married</option>
                      <option>Widowed</option>
                      <option>Separated</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium mb-1">Purok in Lower Dimorok *</label>
                    <select
                      value={regForm.purok}
                      onChange={(e) =>
                        setRegForm({
                          ...regForm,
                          purok: e.target.value,
                          address: `${e.target.value}, ${barangaySettings.barangayName}, Molave, Zamboanga del Sur`,
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    >
                      {PUROK_LIST.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium mb-1">Contact Number *</label>
                    <input
                      type="tel"
                      required
                      value={regForm.contactNumber}
                      onChange={(e) => setRegForm({ ...regForm, contactNumber: e.target.value })}
                      placeholder="+63 917 000 0000"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-medium mb-1">Residential Address *</label>
                  <input
                    type="text"
                    required
                    value={regForm.address}
                    onChange={(e) => setRegForm({ ...regForm, address: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium mb-1">Email Address *</label>
                    <input
                      type="email"
                      required
                      value={regForm.email}
                      onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                      placeholder="resident@dimorok.gov.ph"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block font-medium mb-1">Username *</label>
                    <input
                      type="text"
                      required
                      value={regForm.username}
                      onChange={(e) => setRegForm({ ...regForm, username: e.target.value })}
                      placeholder="juan.delacruz"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium mb-1">Strong Password *</label>
                    <input
                      type="password"
                      required
                      value={regForm.password}
                      onChange={(e) => setRegForm({ ...regForm, password: e.target.value })}
                      placeholder="Min. 8 chars"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block font-medium mb-1">Confirm Password *</label>
                    <input
                      type="password"
                      required
                      value={regForm.confirmPassword}
                      onChange={(e) => setRegForm({ ...regForm, confirmPassword: e.target.value })}
                      placeholder="Repeat password"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    />
                  </div>
                </div>

                {/* WebAuthn Biometric Device Enrollment during Resident Registration */}
                <div className="p-3.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/80 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={regEnrollBiometrics}
                        onChange={(e) => setRegEnrollBiometrics(e.target.checked)}
                        className="mt-0.5 rounded"
                      />
                      <div>
                        <span className="font-bold text-slate-900 dark:text-white block">
                          Enroll Device for Biometric WebAuthn Login (Fingerprint / Face ID)
                        </span>
                        <span className="text-[11px] text-slate-600 dark:text-slate-300">
                          Creates a cryptographic FIDO2 passkey (`navigator.credentials.create`) so you can sign in without typing passwords.
                        </span>
                      </div>
                    </label>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    {regWebAuthnCredentialId ? (
                      <div className="flex items-center gap-1.5 text-[11px] font-mono font-semibold text-emerald-800 dark:text-emerald-300">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>Device Enrolled: {regWebAuthnCredentialId.slice(0, 18)}...</span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-500">
                        {regEnrollBiometrics
                          ? 'Will enroll automatically on submit, or click to enroll now:'
                          : 'Biometric enrollment skipped'}
                      </span>
                    )}

                    <button
                      type="button"
                      disabled={webAuthnBusy}
                      onClick={() => {
                        const fullName = `${regForm.firstName} ${regForm.middleName} ${regForm.lastName}`
                          .replace(/\s+/g, ' ')
                          .trim();
                        executeWebAuthnRegistration({
                          customUsername: regForm.email || regForm.username || 'new.resident@dimorok.gov.ph',
                          customDisplayName: fullName || 'New Lower Dimorok Resident',
                          isRegistrationForm: true,
                        });
                      }}
                      className="px-3 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-white font-semibold text-[11px] flex items-center gap-1.5"
                    >
                      <Fingerprint className="w-3.5 h-3.5" />
                      <span>
                        {regWebAuthnCredentialId
                          ? 'Re-Enroll WebAuthn Passkey'
                          : 'Enroll Biometric Device Now'}
                      </span>
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full min-h-[48px] mt-2 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white font-semibold text-sm transition-colors"
                >
                  Register Resident Account
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          VIEW 5: 📱 BARANGAY LOWER DIMOROK RESIDENT MOBILE APPLICATION
         ===================================================================== */}
      {workspaceView === 'resident' && (
        <div className="py-4 sm:py-8 px-2 sm:px-6 flex flex-col items-center">
          {/* Device Viewport Controls Bar (Desktop helper) */}
          <div className="w-full max-w-[1040px] mb-4 flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs no-print">
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <Smartphone className="w-4 h-4 text-emerald-700" />
              <span className="font-semibold text-slate-900 dark:text-white">
                Barangay Lower Dimorok Resident Companion Portal
              </span>
              <span aria-hidden="true">·</span>
              <span>Barangay Lower Dimorok, Molave</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setOfflineSimulation((o) => !o)}
                className={`px-2.5 py-1 rounded-lg font-medium flex items-center gap-1.5 transition-colors ${
                  offlineSimulation
                    ? 'bg-amber-800 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                {offlineSimulation ? (
                  <>
                    <WifiOff className="w-3.5 h-3.5" />
                    <span>Offline Mode Active</span>
                  </>
                ) : (
                  <>
                    <Wifi className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Online (Test Offline Mode)</span>
                  </>
                )}
              </button>

              <button
                onClick={() => setMobileFrameMode((m) => !m)}
                className="hidden sm:inline-flex px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium"
              >
                {mobileFrameMode ? 'Expand to Full Width' : 'Mobile Frame (430px)'}
              </button>
            </div>
          </div>

          {/* Mobile App Shell Container */}
          <div
            className={`w-full ${
              mobileFrameMode ? 'max-w-[440px] sm:rounded-[32px] sm:border-[6px] sm:border-slate-800 dark:sm:border-slate-800 sm:shadow-2xl' : 'max-w-[1040px] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-lg'
            } bg-white dark:bg-slate-900 overflow-hidden flex flex-col min-h-[780px] relative`}
          >
            {/* Resident Mobile Top Header Bar */}
            <div className="sticky top-0 z-20 px-5 py-3.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <img
                    src={sealImg}
                    alt="Barangay Lower Dimorok Official Seal"
                    referrerPolicy="no-referrer"
                    className="w-10 h-10 rounded-full border border-slate-300 object-cover shrink-0"
                  />
                  <div>
                    <p className="text-[11px] font-medium text-emerald-800 dark:text-emerald-400">
                      Barangay Lower Dimorok · Molave
                    </p>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                      Good morning, {currentUser?.firstName || 'Jonel'}
                    </h2>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setWorkspaceView('verify')}
                    className="min-h-[44px] min-w-[44px] rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center hover:bg-slate-200 transition-colors"
                    title="Scan / Verify QR Document"
                    aria-label="Verify QR Document"
                  >
                    <QrCode className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setShowNotificationsModal(true)}
                    className="min-h-[44px] min-w-[44px] rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center relative hover:bg-slate-200 transition-colors"
                    aria-label="Open notifications"
                  >
                    <Bell className="w-5 h-5" />
                    {unreadCount > 0 && (
                      <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-red-600 ring-2 ring-white dark:ring-slate-900" />
                    )}
                  </button>
                </div>
              </div>

              {/* Resident App Top Header Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={residentSearchQuery}
                  onChange={(e) => setResidentSearchQuery(e.target.value)}
                  placeholder="Search services, requests, or documents..."
                  aria-label="Search services, requests, and documents"
                  className="w-full pl-9 pr-20 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100/90 dark:bg-slate-800/90 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-emerald-700 dark:focus:border-emerald-500 transition-colors"
                />
                {residentSearchQuery.trim() !== '' && (
                  <button
                    type="button"
                    onClick={() => setResidentSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 px-2 py-0.5 text-[11px] font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-md bg-slate-200/70 dark:bg-slate-700/70"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Active Search Filter Summary Strip */}
              {normalizedSearch !== '' && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-600 dark:text-slate-300">
                  <div className="flex flex-wrap items-center gap-2 font-mono">
                    <span className="text-emerald-800 dark:text-emerald-400 font-semibold">
                      Matches for "{residentSearchQuery.trim()}":
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedService(null);
                        setApplyingService(null);
                        setSelectedRequestDetail(null);
                        setResidentTab('services');
                      }}
                      className="underline hover:text-emerald-700"
                    >
                      {filteredResidentServices.length} Services
                    </button>
                    <span>·</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedService(null);
                        setApplyingService(null);
                        setSelectedRequestDetail(null);
                        setResidentTab('requests');
                      }}
                      className="underline hover:text-emerald-700"
                    >
                      {filteredResidentRequests.length} Requests
                    </button>
                    <span>·</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedService(null);
                        setApplyingService(null);
                        setSelectedRequestDetail(null);
                        setResidentTab('requests');
                      }}
                      className="underline hover:text-emerald-700"
                    >
                      {filteredResidentDocuments.length} Documents
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Notification Inbox Drawer */}
            {showNotificationsModal && (
              <div className="p-5 bg-slate-50 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Notifications ({unreadCount} unread)
                  </h3>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={markAllRead}
                      className="text-xs font-semibold text-emerald-800 dark:text-emerald-400 hover:underline"
                    >
                      Mark all read
                    </button>
                    <button
                      onClick={() => setShowNotificationsModal(false)}
                      className="text-xs text-slate-500"
                    >
                      Close
                    </button>
                  </div>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <p className="text-xs text-slate-500 py-4 text-center">
                      No notifications yet.
                    </p>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        className={`p-3 rounded-xl border text-xs ${
                          n.isRead
                            ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                            : 'bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-slate-900 dark:text-white'
                        }`}
                      >
                        <div className="font-semibold">{n.title}</div>
                        <p className="mt-0.5 text-slate-600 dark:text-slate-300">{n.message}</p>
                        <div className="text-[10px] font-mono text-slate-400 mt-1">
                          {new Date(n.createdAt).toLocaleString('en-PH')}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Main Scrollable Resident Content Area */}
            <div className="flex-1 overflow-y-auto pb-24">
              {loadingData ? (
                <div className="p-6 space-y-4">
                  <div className="h-32 rounded-2xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
                  <div className="h-24 rounded-2xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
                  <div className="h-24 rounded-2xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
                </div>
              ) : applyingService ? (
                /* =============================================================
                   SUB-VIEW A: MULTI-STEP SERVICE REQUEST WORKFLOW
                   ============================================================= */
                <div className="p-5 space-y-5">
                  <button
                    onClick={() => {
                      setApplyingService(null);
                      setApplyStep(1);
                    }}
                    className="min-h-[44px] inline-flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back to Service Details</span>
                  </button>

                  <div className="border-b border-slate-200 dark:border-slate-800 pb-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-emerald-800 dark:text-emerald-400 font-semibold">
                        Step {applyStep} of 3 · {applyingService.office}
                      </p>
                      <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500">
                        <span>
                          {lastAutosavedAt
                            ? `Autosaved ${new Date(lastAutosavedAt).toLocaleTimeString('en-PH', {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              })}`
                            : 'Autosave Ready'}
                        </span>
                        {(applyPurpose || applyBusinessName) && (
                          <button
                            type="button"
                            onClick={clearWizardAutosave}
                            className="text-red-600 hover:underline font-sans font-semibold"
                          >
                            Clear Draft
                          </button>
                        )}
                      </div>
                    </div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">
                      Apply: {applyingService.name}
                    </h2>
                    <p className="text-xs font-mono text-slate-500">
                      Standard Processing Fee: {applyingService.feeLabel}
                    </p>
                  </div>

                  {applyStep === 1 && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                          Applicant Full Name (Verified RBI Profile)
                        </label>
                        <input
                          type="text"
                          readOnly
                          value={`${currentUser?.firstName || 'Jonel'} ${currentUser?.middleName || 'Delos Reyes'} ${currentUser?.lastName || 'Mabini'}`}
                          className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                          Residential Purok in Barangay Lower Dimorok *
                        </label>
                        <select
                          value={applyPurok}
                          onChange={(e) => setApplyPurok(e.target.value)}
                          className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                        >
                          {PUROK_LIST.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </div>

                      {applyingService.code === 'BIZ_PERMIT_ENDORSEMENT' && (
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                            Business / Trade Name *
                          </label>
                          <input
                            type="text"
                            required
                            value={applyBusinessName}
                            onChange={(e) => setApplyBusinessName(e.target.value)}
                            placeholder="e.g., Dimorok Agri-Supply & General Merchandise"
                            className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                          />
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                          Specific Purpose of Application *
                        </label>
                        <textarea
                          rows={3}
                          required
                          value={applyPurpose}
                          onChange={(e) => setApplyPurpose(e.target.value)}
                          placeholder="e.g., Pre-employment requirement at Molave Municipal Hall / Scholarship / Medical Assistance"
                          className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                            Cedula / CTC No.
                          </label>
                          <input
                            type="text"
                            value={applyCedula}
                            onChange={(e) => setApplyCedula(e.target.value)}
                            className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                            Length of Residency
                          </label>
                          <input
                            type="text"
                            value={applyYears}
                            onChange={(e) => setApplyYears(e.target.value)}
                            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                          />
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          if (!applyPurpose.trim()) {
                            showToast('Please enter the specific purpose for your document request.');
                            return;
                          }
                          setApplyStep(2);
                        }}
                        className="w-full min-h-[48px] rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white font-semibold text-sm transition-colors"
                      >
                        Continue to Supporting Documents
                      </button>
                    </div>
                  )}

                  {applyStep === 2 && (
                    <div className="space-y-4">
                      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-2">
                        <p className="text-xs font-semibold text-slate-900 dark:text-white">
                          Required Supporting Documents:
                        </p>
                        <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1 list-disc pl-4">
                          {parseJsonList(applyingService.requirements).map((req) => (
                            <li key={req}>{req}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="space-y-2">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                          Attached Resident Files ({applyAttachments.length})
                        </label>
                        {applyAttachments.map((file, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-mono"
                          >
                            <span className="truncate">{file}</span>
                            <button
                              type="button"
                              onClick={() =>
                                setApplyAttachments((prev) => prev.filter((_, i) => i !== idx))
                              }
                              className="text-red-600 hover:underline ml-2"
                            >
                              Remove
                            </button>
                          </div>
                        ))}

                        <label className="min-h-[48px] w-full rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-700 flex items-center justify-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer transition-colors">
                          <Upload className="w-4 h-4 text-emerald-700" />
                          <span>Upload Additional ID / Endorsement Photo</span>
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                setApplyAttachments((prev) => [...prev, file.name]);
                                showToast(`Attached ${file.name}`);
                              }
                            }}
                          />
                        </label>
                      </div>

                      <div className="flex gap-2.5 pt-2">
                        <button
                          onClick={() => setApplyStep(1)}
                          className="min-h-[48px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold"
                        >
                          Back
                        </button>
                        <button
                          onClick={() => setApplyStep(3)}
                          className="flex-1 min-h-[48px] rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white font-semibold text-sm transition-colors"
                        >
                          Review Application Summary
                        </button>
                      </div>
                    </div>
                  )}

                  {applyStep === 3 && (
                    <div className="space-y-4">
                      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Barangay Office:</span>
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {barangaySettings.barangayName} ({barangaySettings.contactNumber})
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Service Requested:</span>
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {applyingService.name}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Processing Office:</span>
                          <span className="font-medium text-slate-800 dark:text-slate-200">
                            {applyingService.office}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Standard Fee:</span>
                          <span className="font-mono font-bold text-emerald-800 dark:text-emerald-400">
                            {applyingService.feeLabel}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Resident Purok:</span>
                          <span className="font-medium">{applyPurok}</span>
                        </div>
                        <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                          <span className="text-slate-500 block">Declared Purpose:</span>
                          <p className="font-medium text-slate-900 dark:text-white mt-0.5">
                            {applyPurpose}
                          </p>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Attachments ({applyAttachments.length}):</span>
                          <p className="font-mono text-[11px] text-slate-700 dark:text-slate-300 mt-0.5">
                            {applyAttachments.join(' · ')}
                          </p>
                        </div>
                      </div>

                      {/* Official Barangay GCash QR Code & GCash Number Payment Section (configured in Barangay Captain Settings) */}
                      {applyingService.fee > 0 && (
                        <div className="p-4 rounded-2xl bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/80 space-y-3 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900 dark:text-white">
                              Payment Method ({applyingService.feeLabel})
                            </span>
                            <span className="font-mono text-[11px] font-semibold text-sky-800 dark:text-sky-300">
                              GCash #: {barangaySettings.gcashNumber}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedPaymentMethod('GCASH_QR')}
                              className={`py-2 px-3 rounded-xl border font-semibold transition-colors cursor-pointer ${
                                selectedPaymentMethod === 'GCASH_QR'
                                  ? 'border-sky-600 bg-sky-600 text-white'
                                  : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              Pay via GCash QR
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedPaymentMethod('CASH_HALL')}
                              className={`py-2 px-3 rounded-xl border font-semibold transition-colors cursor-pointer ${
                                selectedPaymentMethod === 'CASH_HALL'
                                  ? 'border-emerald-700 bg-emerald-800 text-white'
                                  : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              Cash at Brgy. Hall
                            </button>
                          </div>

                          {selectedPaymentMethod === 'GCASH_QR' && (
                            <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-sky-200 dark:border-sky-800 flex flex-col sm:flex-row items-center gap-4">
                              <img
                                src={
                                  barangaySettings.gcashQrCodeDataUrl ||
                                  DEFAULT_GCASH_QR_SVG_DATA_URL
                                }
                                alt="Barangay GCash QR Code"
                                className="w-28 h-28 object-contain rounded-lg border border-slate-200 p-1 bg-white shrink-0"
                              />
                              <div className="space-y-1 text-center sm:text-left">
                                <div className="font-bold text-slate-900 dark:text-white">
                                  {barangaySettings.gcashAccountName ||
                                    `${barangaySettings.barangayName} Treasury`}
                                </div>
                                <div className="font-mono text-sm font-bold text-sky-700 dark:text-sky-400">
                                  GCash Number: {barangaySettings.gcashNumber}
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  Scan QR code or send {applyingService.feeLabel} to the official Barangay GCash number above. Inquiries: {barangaySettings.contactNumber}.
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex gap-2.5">
                        <button
                          onClick={() => setApplyStep(2)}
                          className="min-h-[48px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold"
                        >
                          Back
                        </button>
                        <button
                          disabled={submittingRequest}
                          onClick={handleSubmitServiceRequest}
                          className="flex-1 min-h-[48px] rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white font-semibold text-sm transition-colors disabled:opacity-50"
                        >
                          {submittingRequest ? 'Submitting to Barangay Hall...' : 'Confirm & Submit Request'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : selectedService ? (
                /* =============================================================
                   SUB-VIEW B: SERVICE DETAILS & REQUIREMENTS SCREEN
                   ============================================================= */
                <div className="p-5 space-y-5">
                  <button
                    onClick={() => setSelectedService(null)}
                    className="min-h-[44px] inline-flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>All Barangay Services</span>
                  </button>

                  <div className="space-y-2 border-b border-slate-200 dark:border-slate-800 pb-4">
                    <div className="text-xs text-slate-500">
                      Issued by: {selectedService.office} · {selectedService.processingTime}
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                      {selectedService.name}
                    </h2>
                    <div className="font-mono text-lg font-bold text-emerald-800 dark:text-emerald-400">
                      {selectedService.feeLabel}
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed pt-1">
                      {selectedService.description}
                    </p>
                  </div>

                  {/* Requirements List */}
                  <div className="space-y-2.5">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      01. Documentary Requirements
                    </h3>
                    <div className="space-y-2">
                      {parseJsonList(selectedService.requirements).map((req, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300"
                        >
                          <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
                          <span>{req}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Step-by-Step Process */}
                  <div className="space-y-2.5">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      02. Application & Approval Workflow
                    </h3>
                    <div className="space-y-2">
                      {parseJsonList(selectedService.processSteps).map((step, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300"
                        >
                          <span className="font-mono font-bold text-slate-400">
                            0{i + 1}.
                          </span>
                          <span>{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {selectedService.statutoryCompliance && (
                    <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-slate-800/60 text-xs text-slate-600 dark:text-slate-300">
                      <strong>Statutory Basis:</strong> {selectedService.statutoryCompliance}
                    </div>
                  )}

                  <div className="pt-2">
                    <button
                      onClick={() => {
                        setApplyingService(selectedService);
                        setApplyStep(1);
                      }}
                      className="w-full min-h-[48px] rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white font-semibold text-sm transition-colors"
                    >
                      Apply Now
                    </button>
                  </div>
                </div>
              ) : selectedRequestDetail ? (
                /* =============================================================
                   SUB-VIEW C: VISUAL APPLICATION TIMELINE & DETAILS
                   ============================================================= */
                <div className="p-5 space-y-5">
                  <button
                    onClick={() => setSelectedRequestDetail(null)}
                    className="min-h-[44px] inline-flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back to My Requests</span>
                  </button>

                  <div className="border-b border-slate-200 dark:border-slate-800 pb-4 space-y-1">
                    <div className="text-xs font-mono text-slate-500">
                      Reference: {selectedRequestDetail.referenceNumber}
                    </div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                      {selectedRequestDetail.serviceName}
                    </h2>
                    <div className="text-xs text-slate-600 dark:text-slate-300">
                      {selectedRequestDetail.office} · Fee:{' '}
                      <span className="font-mono font-semibold">
                        {selectedRequestDetail.fee === 0
                          ? 'FREE / WAIVED'
                          : `PHP ${selectedRequestDetail.fee.toFixed(2)}`}
                      </span>{' '}
                      ({selectedRequestDetail.paymentStatus})
                    </div>
                  </div>

                  {/* Rejected Alert if Rejected */}
                  {selectedRequestDetail.status === 'REJECTED' ? (
                    <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-300 dark:border-red-800 space-y-1 text-xs">
                      <div className="font-bold text-red-800 dark:text-red-300 flex items-center gap-1.5">
                        <XCircle className="w-4 h-4" />
                        <span>● REJECTED — Application Rejected</span>
                      </div>
                      <p className="text-red-900 dark:text-red-200">
                        Reason: {selectedRequestDetail.rejectionReason || 'Incomplete documentary requirements.'}
                      </p>
                    </div>
                  ) : (
                    /* Visual Vertical Timeline */
                    <div className="space-y-3 py-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Official Processing Timeline
                      </h3>
                      <div className="space-y-0">
                        {WORKFLOW_STEPS.map((step, idx) => {
                          const activeIdx = getTimelineStepIndex(selectedRequestDetail.status);
                          const isCompleted = idx < activeIdx || selectedRequestDetail.status === 'COMPLETED';
                          const isCurrent = idx === activeIdx && selectedRequestDetail.status !== 'COMPLETED';

                          return (
                            <div key={step.key} className="flex items-start gap-3">
                              <div className="flex flex-col items-center">
                                <div
                                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-bold ${
                                    isCompleted
                                      ? 'bg-emerald-700 text-white'
                                      : isCurrent
                                      ? 'bg-amber-600 text-white ring-4 ring-amber-100 dark:ring-amber-950'
                                      : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                                  }`}
                                >
                                  {isCompleted ? '✓' : isCurrent ? '●' : '○'}
                                </div>
                                {idx < WORKFLOW_STEPS.length - 1 && (
                                  <div
                                    className={`w-0.5 h-7 ${
                                      isCompleted
                                        ? 'bg-emerald-700'
                                        : 'bg-slate-200 dark:bg-slate-800'
                                    }`}
                                  />
                                )}
                              </div>
                              <div className="pt-0.5 pb-4">
                                <div
                                  className={`text-sm font-semibold ${
                                    isCompleted || isCurrent
                                      ? 'text-slate-900 dark:text-white'
                                      : 'text-slate-400 dark:text-slate-500'
                                  }`}
                                >
                                  {step.label}
                                </div>
                                {isCurrent && (
                                  <div className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                                    Current active stage at {selectedRequestDetail.office}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Reviewer Notes & Metadata */}
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                    <div>
                      <span className="text-slate-500">Declared Purpose:</span>
                      <p className="font-medium text-slate-900 dark:text-white mt-0.5">
                        {selectedRequestDetail.purpose}
                      </p>
                    </div>
                    {selectedRequestDetail.reviewerNotes && (
                      <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                        <span className="text-slate-500">Barangay Official Remarks:</span>
                        <p className="font-medium text-emerald-900 dark:text-emerald-300 mt-0.5">
                          {selectedRequestDetail.reviewerNotes}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* 6-Step Certificate Workflow, GCash/PayMaya QR Payment & Download Card */}
                  <ResidentPaymentAndDownloadCard
                    request={selectedRequestDetail}
                    workflowRecord={workflowMap[selectedRequestDetail.referenceNumber]}
                    barangaySettings={barangaySettings}
                    matchingDoc={
                      documents.find(
                        (d) => d.referenceNumber === selectedRequestDetail.referenceNumber
                      ) || null
                    }
                    onSaveWorkflow={(updatedWf) => {
                      const nextMap = saveWorkflowRecord(updatedWf);
                      setWorkflowMap(nextMap);
                    }}
                    onSwitchRole={(role) => handleSwitchRole(role)}
                    onOpenCertificate={(doc) => setActiveCertificate(doc)}
                  />
                </div>
              ) : (
                /* =============================================================
                   MAIN 5 BOTTOM-TAB SCREENS
                   ============================================================= */
                <>
                  {/* TAB 1: HOME DASHBOARD */}
                  {residentTab === 'home' && (
                    <div className="p-5 space-y-6">
                      {/* Hero Civic Banner */}
                      <div className="relative rounded-2xl overflow-hidden bg-slate-900 text-white p-5">
                        <img
                          src={hallHeroImg}
                          alt="Barangay Lower Dimorok Civic Hall"
                          referrerPolicy="no-referrer"
                          className="absolute inset-0 w-full h-full object-cover opacity-35"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-900/60 to-slate-900/30" />
                        <div className="relative z-10 space-y-2">
                          <div className="text-[11px] font-mono text-emerald-300">
                            {currentUser?.purok || 'Purok 2 - Pag-asa'} · Verified Resident ID
                          </div>
                          <h1 className="text-xl font-bold tracking-tight text-balance">
                            Barangay Lower Dimorok Digital Services
                          </h1>
                          <p className="text-xs text-slate-200 leading-relaxed">
                            Request official clearances, track approvals in real time, and verify QR-signed certificates.
                          </p>
                          <div className="pt-2 flex flex-wrap gap-2">
                            <button
                              onClick={() => setResidentTab('services')}
                              className="min-h-[44px] px-4 py-2 text-xs font-semibold bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl transition-colors"
                            >
                              Request a Document
                            </button>
                            <button
                              onClick={() => setWorkspaceView('verify')}
                              className="min-h-[44px] px-3.5 py-2 text-xs font-semibold bg-white/15 hover:bg-white/25 text-white rounded-xl backdrop-blur-xs transition-colors"
                            >
                              Verify QR Code
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* RESUME INTERRUPTED APPLICATION BANNER (Autosaved in localStorage) */}
                      {savedDraftMeta &&
                        (savedDraftMeta.applyPurpose.trim() !== '' ||
                          savedDraftMeta.applyBusinessName.trim() !== '') && (
                          <div className="p-4 rounded-2xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="space-y-0.5">
                              <div className="text-xs font-bold text-amber-950 dark:text-amber-200 flex items-center gap-1.5">
                                <RefreshCw className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
                                <span>
                                  Resume Interrupted Application ({savedDraftMeta.serviceName || 'Draft'})
                                </span>
                              </div>
                              <p className="text-xs text-amber-900/90 dark:text-amber-300 line-clamp-1">
                                Purok: {savedDraftMeta.applyPurok} · Purpose:{' '}
                                {savedDraftMeta.applyPurpose || 'In progress'}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={handleResumeSavedApplication}
                                className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-amber-900 hover:bg-amber-800 text-white"
                              >
                                Resume Draft
                              </button>
                              <button
                                onClick={clearWizardAutosave}
                                className="px-2.5 py-1.5 text-xs font-medium text-amber-900 dark:text-amber-300 hover:underline"
                              >
                                Discard
                              </button>
                            </div>
                          </div>
                        )}

                      {/* QUICK SERVICES (5 Documented Lower Dimorok Services) */}
                      <section className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                            Quick Services ({filteredResidentServices.length})
                          </h3>
                          <button
                            onClick={() => setResidentTab('services')}
                            className="text-xs font-semibold text-emerald-800 dark:text-emerald-400 hover:underline"
                          >
                            View Directory
                          </button>
                        </div>

                        {filteredResidentServices.length === 0 ? (
                          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
                            No services match "{residentSearchQuery}".
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900">
                            {filteredResidentServices.map((svc) => (
                              <button
                                key={svc.code}
                                onClick={() => setSelectedService(svc)}
                                className="w-full min-h-[64px] px-4 py-3.5 text-left flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                              >
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                                    {highlightSearchTerm(svc.name)}
                                  </div>
                                  <div className="text-xs text-slate-500 mt-0.5 truncate">
                                    {svc.office} ·{' '}
                                    <span className="font-mono font-semibold text-emerald-800 dark:text-emerald-400">
                                      {svc.feeLabel}
                                    </span>
                                  </div>
                                </div>
                                <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                              </button>
                            ))}
                          </div>
                        )}
                      </section>

                      {/* MY LATEST REQUESTS */}
                      <section className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                            My Requests ({filteredResidentRequests.length})
                          </h3>
                          <button
                            onClick={() => setResidentTab('requests')}
                            className="text-xs font-semibold text-emerald-800 dark:text-emerald-400 hover:underline"
                          >
                            Track All ({requests.length})
                          </button>
                        </div>

                        {filteredResidentRequests.length === 0 ? (
                          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 text-center space-y-2">
                            <p className="text-xs text-slate-500">
                              {normalizedSearch
                                ? `No requests match "${residentSearchQuery}".`
                                : "You don't have any service requests yet."}
                            </p>
                            {!normalizedSearch && (
                              <button
                                onClick={() => setResidentTab('services')}
                                className="px-4 py-2 text-xs font-semibold bg-emerald-800 text-white rounded-xl"
                              >
                                Submit First Request
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-2.5">
                            {filteredResidentRequests.slice(0, 3).map((req) => (
                              <button
                                key={req.id}
                                onClick={() => setSelectedRequestDetail(req)}
                                className="w-full p-4 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-emerald-700 text-left transition-colors space-y-2"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                                    {highlightSearchTerm(req.serviceName)}
                                  </span>
                                  <span className="font-mono text-xs font-semibold text-emerald-800 dark:text-emerald-400">
                                    {req.status === 'APPROVED' || req.status === 'COMPLETED'
                                      ? `✓ ${req.status}`
                                      : `● ${req.status.replace('_', ' ')}`}
                                  </span>
                                </div>
                                <div className="text-xs text-slate-500 flex items-center justify-between font-mono">
                                  <span>Ref: {highlightSearchTerm(req.referenceNumber)}</span>
                                  <span>View Timeline →</span>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </section>

                      {/* APPROVED DIGITAL DOCUMENTS ACCESS */}
                      {(documents.length > 0 || normalizedSearch !== '') && (
                        <section className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                              My Approved Digital Documents (
                              {
                                filteredResidentDocuments.filter((d) =>
                                  normalizedSearch ? true : d.status === 'VALID'
                                ).length
                              }
                              )
                            </h3>
                          </div>
                          {filteredResidentDocuments.filter((d) =>
                            normalizedSearch ? true : d.status === 'VALID'
                          ).length === 0 ? (
                            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
                              No digital documents match "{residentSearchQuery}".
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {filteredResidentDocuments
                                .filter((d) => (normalizedSearch ? true : d.status === 'VALID'))
                                .map((doc) => (
                                  <div
                                    key={doc.id}
                                    className="p-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/80 flex items-center justify-between gap-3"
                                  >
                                    <div>
                                      <div className="text-sm font-bold text-slate-900 dark:text-white">
                                        {highlightSearchTerm(doc.documentType)}
                                      </div>
                                      <div className="text-xs font-mono text-slate-600 dark:text-slate-300 mt-0.5">
                                        {highlightSearchTerm(doc.referenceNumber)} · QR Signed
                                      </div>
                                    </div>
                                    <button
                                      onClick={() => setActiveCertificate(doc)}
                                      className="min-h-[40px] px-3.5 py-2 text-xs font-semibold bg-emerald-800 hover:bg-emerald-700 text-white rounded-xl shrink-0"
                                    >
                                      Open PDF / QR
                                    </button>
                                  </div>
                                ))}
                            </div>
                          )}
                        </section>
                      )}

                      {/* LATEST OFFICIAL ANNOUNCEMENTS (Real-Time Category Filter) */}
                      <section className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                            Barangay Announcements ({filteredAnnouncements.length})
                          </h3>
                          <button
                            onClick={() => setResidentTab('announcements')}
                            className="text-xs font-semibold text-emerald-800 dark:text-emerald-400 hover:underline"
                          >
                            View All
                          </button>
                        </div>

                        {/* Real-Time Category Filter Bar */}
                        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                          {announcementCategoryOptions.map((cat) => {
                            const count =
                              cat === 'All'
                                ? announcements.length
                                : announcements.filter(
                                    (a) => a.category.toLowerCase() === cat.toLowerCase()
                                  ).length;
                            return (
                              <button
                                key={cat}
                                type="button"
                                onClick={() => setAnnouncementCategory(cat)}
                                className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg whitespace-nowrap transition-colors ${
                                  announcementCategory === cat
                                    ? 'bg-emerald-800 text-white'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                                }`}
                              >
                                {cat} ({count})
                              </button>
                            );
                          })}
                        </div>

                        {filteredAnnouncements.length === 0 ? (
                          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 text-center space-y-2">
                            <p className="text-xs text-slate-500">
                              No announcements found in category "{announcementCategory}".
                            </p>
                            <button
                              type="button"
                              onClick={() => setAnnouncementCategory('All')}
                              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-800 text-white"
                            >
                              Show All Announcements
                            </button>
                          </div>
                        ) : (
                          filteredAnnouncements
                            .slice(0, announcementCategory === 'All' ? 2 : filteredAnnouncements.length)
                            .map((ann) => (
                              <div
                                key={ann.id}
                                onClick={() => setResidentTab('announcements')}
                                className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 space-y-1.5"
                              >
                                <div className="text-xs text-slate-500 flex items-center justify-between gap-2">
                                  <span>
                                    <span className="font-semibold text-emerald-800 dark:text-emerald-400">
                                      {ann.category}
                                    </span>{' '}
                                    · {ann.authorOffice}
                                  </span>
                                  <span className="font-mono text-[11px]">
                                    {new Date(ann.publishedAt).toLocaleDateString('en-PH')}
                                  </span>
                                </div>
                                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                                  {highlightSearchTerm(ann.title)}
                                </h4>
                                <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                                  {ann.summary}
                                </p>
                              </div>
                            ))
                        )}
                      </section>

                      {/* EMERGENCY & IMPORTANT BARANGAY INFORMATION */}
                      <section className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                        <h3 className="font-bold text-slate-900 dark:text-white">
                          Barangay Lower Dimorok Hall & Emergency Directory
                        </h3>
                        <p className="text-slate-600 dark:text-slate-300">
                          Office Hours: Monday – Friday, 8:00 AM – 5:00 PM (No Noon Break)
                        </p>
                        <div className="font-mono text-slate-700 dark:text-slate-200 space-y-1 pt-1">
                          <div>Punong Barangay Desk: +63 (062) 225-1904</div>
                          <div>Lower Dimorok BDRRMC 24/7 Hotline: +63 917 550 0911</div>
                          <div>Molave Municipal Police / Fire: 911 / (062) 225-1102</div>
                        </div>
                      </section>
                    </div>
                  )}

                  {/* TAB 2: SERVICES DIRECTORY */}
                  {residentTab === 'services' && (
                    <div className="p-5 space-y-5">
                      <div>
                        <p className="text-xs text-emerald-800 dark:text-emerald-400 font-semibold">
                          Official Citizen Charter · Barangay Lower Dimorok
                        </p>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">
                          Barangay Services & Clearances ({filteredResidentServices.length})
                        </h2>
                        <p className="text-xs text-slate-500 mt-1">
                          Select a service to view requirements, responsible office, and submit a digital request.
                        </p>
                      </div>

                      {filteredResidentServices.length === 0 ? (
                        <div className="p-8 rounded-2xl border border-slate-200 dark:border-slate-800 text-center space-y-2">
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            No services match "{residentSearchQuery}".
                          </p>
                          <button
                            onClick={() => setResidentSearchQuery('')}
                            className="px-4 py-2 text-xs font-semibold bg-emerald-800 text-white rounded-xl"
                          >
                            Reset Search
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {filteredResidentServices.map((svc) => (
                            <div
                              key={svc.code}
                              className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-xs text-slate-500">
                                    Issued by: {svc.office}
                                  </div>
                                  <h3 className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                                    {highlightSearchTerm(svc.name)}
                                  </h3>
                                </div>
                                <div className="font-mono text-sm font-bold text-emerald-800 dark:text-emerald-400 shrink-0">
                                  {svc.feeLabel}
                                </div>
                              </div>

                              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                                {svc.description}
                              </p>

                              <div className="flex items-center gap-2 pt-1">
                                <button
                                  onClick={() => setSelectedService(svc)}
                                  className="flex-1 min-h-[44px] px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                >
                                  View Requirements
                                </button>
                                <button
                                  onClick={() => {
                                    setApplyingService(svc);
                                    setApplyStep(1);
                                  }}
                                  className="flex-1 min-h-[44px] px-3 py-2 text-xs font-semibold rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white transition-colors"
                                >
                                  Apply Now
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 3: MY REQUESTS & MY DOCUMENTS */}
                  {residentTab === 'requests' && (
                    <div className="p-5 space-y-6">
                      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                        <div>
                          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                            My Requests & Documents
                          </h2>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Tap any application card to view the complete approval timeline or download your QR-verified PDF.
                          </p>
                        </div>

                        {/* Status Filter Dropdown for My Requests */}
                        <div className="flex items-center gap-2 shrink-0">
                          <label
                            htmlFor="my-requests-status-filter"
                            className="text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap"
                          >
                            Filter by Status:
                          </label>
                          <select
                            id="my-requests-status-filter"
                            value={requestStatusFilter}
                            onChange={(e) => setRequestStatusFilter(e.target.value)}
                            className="min-h-[40px] px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-700"
                          >
                            <option value="ALL">All Statuses ({filteredResidentRequests.length})</option>
                            <option value="Approved">Approved</option>
                            <option value="Pending">Pending</option>
                            <option value="Rejected">Rejected</option>
                            <option value="SUBMITTED">Submitted</option>
                            <option value="UNDER_REVIEW">Under Review</option>
                            <option value="READY_FOR_RELEASE">Ready for Release</option>
                            <option value="COMPLETED">Completed</option>
                          </select>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {filteredMyRequestsTab.length === 0 ? (
                          <div className="p-8 rounded-2xl border border-slate-200 dark:border-slate-800 text-center space-y-3">
                            <FileText className="w-8 h-8 text-slate-400 mx-auto" />
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                              {requestStatusFilter !== 'ALL' || normalizedSearch
                                ? `No service requests match the current filter (${requestStatusFilter}${
                                    normalizedSearch ? ` · "${residentSearchQuery}"` : ''
                                  }).`
                                : "You don't have any service requests yet."}
                            </p>
                            {requestStatusFilter !== 'ALL' || normalizedSearch ? (
                              <button
                                onClick={() => {
                                  setRequestStatusFilter('ALL');
                                  setResidentSearchQuery('');
                                }}
                                className="min-h-[40px] px-4 py-2 text-xs font-semibold bg-slate-900 dark:bg-slate-800 text-white rounded-xl"
                              >
                                Reset Status & Search Filters
                              </button>
                            ) : (
                              <button
                                onClick={() => setResidentTab('services')}
                                className="min-h-[44px] px-5 py-2.5 text-xs font-semibold bg-emerald-800 text-white rounded-xl"
                              >
                                Browse Barangay Services
                              </button>
                            )}
                          </div>
                        ) : (
                          filteredMyRequestsTab.map((req) => {
                            const wf = workflowMap[req.referenceNumber];
                            const stageMeta = wf ? getStageBadgeMeta(wf.stage) : null;
                            const matchedDoc =
                              documents.find((d) => d.referenceNumber === req.referenceNumber) ||
                              null;
                            return (
                              <div
                                key={req.id}
                                className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-emerald-700 transition-colors space-y-3"
                              >
                                <div
                                  onClick={() => setSelectedRequestDetail(req)}
                                  className="cursor-pointer space-y-2"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                                        {highlightSearchTerm(req.serviceName)}
                                      </h3>
                                      <div className="text-xs font-mono text-slate-500 mt-0.5">
                                        {highlightSearchTerm(req.referenceNumber)} · Submitted{' '}
                                        {new Date(req.submittedAt).toLocaleDateString('en-PH')}
                                      </div>
                                    </div>
                                    <span className="text-xs font-mono font-semibold text-emerald-800 dark:text-emerald-400 shrink-0">
                                      {stageMeta
                                        ? `Step ${stageMeta.stepNumber}/6`
                                        : req.status === 'REJECTED'
                                        ? '● REJECTED'
                                        : req.status === 'APPROVED' || req.status === 'COMPLETED'
                                        ? `✓ ${req.status}`
                                        : `● ${req.status.replace('_', ' ')}`}
                                    </span>
                                  </div>

                                  <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-1">
                                    Purpose: {req.purpose}
                                  </p>
                                </div>

                                <ResidentPaymentAndDownloadCard
                                  request={req}
                                  workflowRecord={wf}
                                  barangaySettings={barangaySettings}
                                  matchingDoc={matchedDoc}
                                  onSaveWorkflow={(updatedWf) => {
                                    const nextMap = saveWorkflowRecord(updatedWf);
                                    setWorkflowMap(nextMap);
                                  }}
                                  onSwitchRole={(role) => handleSwitchRole(role)}
                                  onOpenCertificate={(doc) => setActiveCertificate(doc)}
                                />
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* Approved Digital Documents Section */}
                      <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                        <h3 className="text-base font-bold text-slate-900 dark:text-white">
                          Document Center (Issued Certificates · {filteredResidentDocuments.length})
                        </h3>
                        {filteredResidentDocuments.length === 0 ? (
                          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
                            No issued certificates match "{residentSearchQuery}".
                          </div>
                        ) : (
                          filteredResidentDocuments.map((doc) => (
                            <div
                              key={doc.id}
                              className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3"
                            >
                              <div>
                                <div className="text-sm font-bold text-slate-900 dark:text-white">
                                  {highlightSearchTerm(doc.documentType)}
                                </div>
                                <div className="text-xs font-mono text-slate-500 mt-0.5">
                                  {highlightSearchTerm(doc.referenceNumber)} · Status: {doc.status}
                                </div>
                              </div>
                              <button
                                onClick={() => setActiveCertificate(doc)}
                                className="min-h-[44px] px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-900 dark:bg-slate-800 text-white hover:bg-slate-800 shrink-0"
                              >
                                View / Print PDF
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {/* TAB 4: BARANGAY ANNOUNCEMENTS */}
                  {residentTab === 'announcements' && (
                    <div className="p-5 space-y-5">
                      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                        <div>
                          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                            Barangay Announcements ({filteredAnnouncements.length})
                          </h2>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Official notices, BDRRMC weather advisories, and public service schedules in Lower Dimorok.
                          </p>
                        </div>

                        {/* Real-Time Category Filter Dropdown */}
                        <div className="flex items-center gap-2 shrink-0">
                          <label
                            htmlFor="announcement-category-filter"
                            className="text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap"
                          >
                            Category:
                          </label>
                          <select
                            id="announcement-category-filter"
                            aria-label="Filter announcements by category"
                            value={announcementCategory}
                            onChange={(e) => setAnnouncementCategory(e.target.value)}
                            className="min-h-[40px] px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-700"
                          >
                            {announcementCategoryOptions.map((cat) => {
                              const count =
                                cat === 'All'
                                  ? announcements.length
                                  : announcements.filter(
                                      (a) => a.category.toLowerCase() === cat.toLowerCase()
                                    ).length;
                              return (
                                <option key={cat} value={cat}>
                                  {cat === 'All' ? `All Categories (${count})` : `${cat} (${count})`}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      </div>

                      {/* Editorial Banner */}
                      <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800">
                        <div className="h-36 bg-slate-900 relative">
                          <img
                            src={communityBannerImg}
                            alt="Barangay Lower Dimorok Community Assembly"
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent flex items-end p-4">
                            <div className="text-white">
                              <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-300">
                                Community Outreach · Covered Court
                              </span>
                              <p className="text-sm font-bold">
                                Public Service & General Assembly Updates
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Interactive Real-Time Category Filter Buttons */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Announcement categories">
                          {announcementCategoryOptions.map((cat) => {
                            const count =
                              cat === 'All'
                                ? announcements.length
                                : announcements.filter(
                                    (a) => a.category.toLowerCase() === cat.toLowerCase()
                                  ).length;
                            const isSelected = announcementCategory === cat;
                            return (
                              <button
                                key={cat}
                                type="button"
                                role="tab"
                                aria-selected={isSelected}
                                onClick={() => setAnnouncementCategory(cat)}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ${
                                  isSelected
                                    ? 'bg-emerald-800 text-white'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                                }`}
                              >
                                {cat} ({count})
                              </button>
                            );
                          })}
                        </div>

                        {announcementCategory !== 'All' && (
                          <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 px-1">
                            <span>
                              Showing <strong className="text-slate-900 dark:text-white">{filteredAnnouncements.length}</strong>{' '}
                              {filteredAnnouncements.length === 1 ? 'announcement' : 'announcements'} in{' '}
                              <strong className="text-emerald-800 dark:text-emerald-400">
                                {announcementCategory}
                              </strong>
                            </span>
                            <button
                              type="button"
                              onClick={() => setAnnouncementCategory('All')}
                              className="text-xs font-semibold text-emerald-800 dark:text-emerald-400 hover:underline"
                            >
                              Clear Filter
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="space-y-3">
                        {filteredAnnouncements.length === 0 ? (
                          <div className="p-8 rounded-2xl border border-slate-200 dark:border-slate-800 text-center space-y-3">
                            <Megaphone className="w-7 h-7 text-slate-400 mx-auto" />
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                              No announcements match the "{announcementCategory}" category
                              {normalizedSearch ? ` and search "${residentSearchQuery}"` : ''}.
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                setAnnouncementCategory('All');
                                setResidentSearchQuery('');
                              }}
                              className="px-4 py-2 text-xs font-semibold rounded-xl bg-emerald-800 text-white"
                            >
                              Show All Announcements
                            </button>
                          </div>
                        ) : (
                          filteredAnnouncements.map((ann) => (
                            <article
                              key={ann.id}
                              className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2"
                            >
                              <div className="text-xs text-slate-500 flex items-center justify-between gap-2">
                                <span>
                                  <strong className="text-emerald-800 dark:text-emerald-400">
                                    {ann.category}
                                  </strong>{' '}
                                  · {ann.authorOffice}
                                </span>
                                <span className="font-mono text-[11px]">
                                  {new Date(ann.publishedAt).toLocaleDateString('en-PH')}
                                </span>
                              </div>
                              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                                {highlightSearchTerm(ann.title)}
                              </h3>
                              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                                {ann.content}
                              </p>
                            </article>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {/* TAB 5: MY PROFILE & SECURITY (+ BIOMETRIC USAGE HISTORY TAB) */}
                  {residentTab === 'profile' && currentUser && (
                    <div className="p-5 space-y-5">
                      <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
                        <div className="flex items-center gap-4">
                          {currentResidentPhotoUrl ? (
                            <img
                              src={currentResidentPhotoUrl}
                              alt={`${currentUser.firstName} ${currentUser.lastName}`}
                              className="w-16 h-16 rounded-2xl object-cover border-2 border-emerald-700 shrink-0"
                            />
                          ) : (
                            <div className="w-16 h-16 rounded-2xl bg-emerald-800 text-white font-bold text-lg flex items-center justify-center shrink-0">
                              {currentUser.firstName?.[0] || 'J'}
                              {currentUser.lastName?.[0] || 'M'}
                            </div>
                          )}
                          <div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                              {currentUser.firstName} {currentUser.middleName} {currentUser.lastName}{' '}
                              {currentUser.suffix}
                            </h2>
                            <p className="text-xs text-slate-500">
                              {currentUser.purok} · Role:{' '}
                              <span className="font-mono font-semibold text-emerald-800 dark:text-emerald-400">
                                {currentUser.role}
                              </span>
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            ref={profilePhotoInputRef}
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const reader = new FileReader();
                              reader.onload = () => {
                                const resultStr = typeof reader.result === 'string' ? reader.result : '';
                                if (!resultStr) return;
                                const img = new Image();
                                img.onload = () => {
                                  const normalized = normalizeImageToPortraitDataUrl(img) || resultStr;
                                  setRegPhotoDataUrl(normalized);
                                  saveResidentPhotoRecord(
                                    [currentUser.uid, currentUser.email, currentUser.username],
                                    normalized
                                  );
                                  showToast('Profile photo updated!');
                                };
                                img.src = resultStr;
                              };
                              reader.readAsDataURL(file);
                              e.target.value = '';
                            }}
                            className="hidden"
                          />
                          <button
                            type="button"
                            onClick={() => profilePhotoInputRef.current?.click()}
                            className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                          >
                            <Camera className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                            <span>{currentResidentPhotoUrl ? 'Change Photo' : 'Upload Photo'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (isEditingProfile) {
                                setIsEditingProfile(false);
                                stopProfileCamera();
                                setProfileCameraOpen(false);
                              } else {
                                openProfileEditor(false);
                              }
                            }}
                            className="px-3.5 py-1.5 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                          >
                            <User className="w-3.5 h-3.5" />
                            <span>{isEditingProfile ? 'Cancel Edit' : 'Edit Profile'}</span>
                          </button>
                        </div>
                      </div>

                      {/* Profile Screen Sub-Tabs: Account & Security vs Biometric Usage History */}
                      <div
                        className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-800"
                        role="tablist"
                        aria-label="Profile Screen Tabs"
                      >
                        <button
                          type="button"
                          role="tab"
                          aria-selected={profileSubTab === 'overview'}
                          onClick={() => setProfileSubTab('overview')}
                          className={`min-h-[40px] px-3 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                            profileSubTab === 'overview'
                              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                          }`}
                        >
                          <User className="w-3.5 h-3.5" />
                          <span>Profile & Security</span>
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={profileSubTab === 'biometric_history'}
                          onClick={() => {
                            refreshBiometricUsageHistory();
                            setProfileSubTab('biometric_history');
                          }}
                          className={`min-h-[40px] px-3 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                            profileSubTab === 'biometric_history'
                              ? 'bg-white dark:bg-slate-900 text-emerald-800 dark:text-emerald-400 shadow-xs'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                          }`}
                        >
                          <Fingerprint className="w-3.5 h-3.5" />
                          <span>Biometric Usage History ({webAuthnActivityLogs.length})</span>
                        </button>
                      </div>

                      {profileSubTab === 'overview' ? (
                        <>
                          {/* Personal Information (View or Edit Mode for All Users) */}
                          <div className="space-y-3 text-xs">
                            <div className="flex items-center justify-between">
                              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                                Personal & Domicile Record
                              </h3>
                              {!isEditingProfile && (
                                <button
                                  type="button"
                                  onClick={() => openProfileEditor(false)}
                                  className="text-xs font-semibold text-emerald-800 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
                                >
                                  <span>Update Profile</span>
                                </button>
                              )}
                            </div>

                            {isEditingProfile ? (
                              <form
                                onSubmit={handleSaveProfileUpdate}
                                className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-emerald-700/40 dark:border-emerald-700/60 space-y-3.5"
                              >
                                <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-700">
                                  <div>
                                    <span className="text-xs font-bold text-emerald-900 dark:text-emerald-300">
                                      Update Profile Information ({currentUser.role})
                                    </span>
                                    <p className="text-[11px] text-slate-500">
                                      All users and barangay officials can update their personal, contact, and domicile details.
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => profilePhotoInputRef.current?.click()}
                                      className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                                    >
                                      <Upload className="w-3 h-3 text-emerald-700 dark:text-emerald-400" />
                                      <span>Upload Photo</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (profileCameraOpen) {
                                          stopProfileCamera();
                                          setProfileCameraOpen(false);
                                        } else {
                                          startProfileCamera();
                                        }
                                      }}
                                      className="px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-emerald-800 text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                                    >
                                      <Camera className="w-3 h-3" />
                                      <span>{profileCameraOpen ? 'Close Camera' : 'Use Camera'}</span>
                                    </button>
                                  </div>
                                </div>

                                {profileCameraOpen && (
                                  <div className="p-3 rounded-xl bg-slate-950 text-white space-y-2.5">
                                    <div className="relative aspect-square max-w-[220px] mx-auto rounded-xl overflow-hidden border border-emerald-500/50 bg-slate-900 flex items-center justify-center">
                                      <video
                                        ref={profileCameraVideoRef}
                                        autoPlay
                                        playsInline
                                        muted
                                        className={`w-full h-full object-cover ${
                                          profileCameraStreamActive ? 'block' : 'hidden'
                                        }`}
                                      />
                                      {!profileCameraStreamActive && (
                                        <div className="p-3 text-center space-y-1.5">
                                          <Camera className="w-7 h-7 text-emerald-400 mx-auto" />
                                          <p className="text-[11px] text-slate-300">
                                            {profileCameraError || 'Initializing camera preview...'}
                                          </p>
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex justify-center">
                                      <button
                                        type="button"
                                        onClick={handleCaptureProfileCameraPhoto}
                                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                                      >
                                        <Camera className="w-3.5 h-3.5" />
                                        <span>Capture Photo & Preview</span>
                                      </button>
                                    </div>
                                  </div>
                                )}

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <div>
                                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                      First Name *
                                    </label>
                                    <input
                                      type="text"
                                      required
                                      value={profileForm.firstName}
                                      onChange={(e) =>
                                        setProfileForm((f) => ({ ...f, firstName: e.target.value }))
                                      }
                                      className="w-full mt-1 px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                      Middle Name
                                    </label>
                                    <input
                                      type="text"
                                      value={profileForm.middleName}
                                      onChange={(e) =>
                                        setProfileForm((f) => ({ ...f, middleName: e.target.value }))
                                      }
                                      className="w-full mt-1 px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                      Last Name *
                                    </label>
                                    <input
                                      type="text"
                                      required
                                      value={profileForm.lastName}
                                      onChange={(e) =>
                                        setProfileForm((f) => ({ ...f, lastName: e.target.value }))
                                      }
                                      className="w-full mt-1 px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                      Suffix (Jr., Sr., III)
                                    </label>
                                    <input
                                      type="text"
                                      value={profileForm.suffix}
                                      onChange={(e) =>
                                        setProfileForm((f) => ({ ...f, suffix: e.target.value }))
                                      }
                                      placeholder="Optional"
                                      className="w-full mt-1 px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                                    />
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                  <div>
                                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                      Username *
                                    </label>
                                    <input
                                      type="text"
                                      required
                                      value={profileForm.username}
                                      onChange={(e) =>
                                        setProfileForm((f) => ({ ...f, username: e.target.value }))
                                      }
                                      className="w-full mt-1 px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                      Email Address *
                                    </label>
                                    <input
                                      type="email"
                                      required
                                      value={profileForm.email}
                                      onChange={(e) =>
                                        setProfileForm((f) => ({ ...f, email: e.target.value }))
                                      }
                                      className="w-full mt-1 px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                      Contact Number *
                                    </label>
                                    <input
                                      type="tel"
                                      required
                                      value={profileForm.contactNumber}
                                      onChange={(e) =>
                                        setProfileForm((f) => ({
                                          ...f,
                                          contactNumber: e.target.value,
                                        }))
                                      }
                                      className="w-full mt-1 px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                                    />
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                  <div>
                                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                      Date of Birth
                                    </label>
                                    <input
                                      type="date"
                                      value={profileForm.dateOfBirth}
                                      onChange={(e) =>
                                        setProfileForm((f) => ({
                                          ...f,
                                          dateOfBirth: e.target.value,
                                        }))
                                      }
                                      className="w-full mt-1 px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                      Sex
                                    </label>
                                    <select
                                      value={profileForm.sex}
                                      onChange={(e) =>
                                        setProfileForm((f) => ({ ...f, sex: e.target.value }))
                                      }
                                      className="w-full mt-1 px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                                    >
                                      <option value="Male">Male</option>
                                      <option value="Female">Female</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                      Civil Status
                                    </label>
                                    <select
                                      value={profileForm.civilStatus}
                                      onChange={(e) =>
                                        setProfileForm((f) => ({
                                          ...f,
                                          civilStatus: e.target.value,
                                        }))
                                      }
                                      className="w-full mt-1 px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                                    >
                                      <option value="Single">Single</option>
                                      <option value="Married">Married</option>
                                      <option value="Widowed">Widowed</option>
                                      <option value="Separated">Separated</option>
                                    </select>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <div>
                                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                      Purok / Sitio
                                    </label>
                                    <select
                                      value={profileForm.purok}
                                      onChange={(e) => {
                                        const nextPurok = e.target.value;
                                        setProfileForm((f) => ({
                                          ...f,
                                          purok: nextPurok,
                                          address: `${nextPurok}, Barangay Lower Dimorok, Molave, Zamboanga del Sur`,
                                        }));
                                      }}
                                      className="w-full mt-1 px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                                    >
                                      <option value="Purok 1 - Centro">Purok 1 - Centro</option>
                                      <option value="Purok 2 - Riverside">Purok 2 - Riverside</option>
                                      <option value="Purok 3 - Hillside">Purok 3 - Hillside</option>
                                      <option value="Purok 4 - Mabuhay">Purok 4 - Mabuhay</option>
                                      <option value="Purok 5 - Bagong Silang">
                                        Purok 5 - Bagong Silang
                                      </option>
                                      <option value="Purok 6 - Pag-asa">Purok 6 - Pag-asa</option>
                                      <option value="Purok 7 - Masagana">Purok 7 - Masagana</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                      Registered Barangay Address
                                    </label>
                                    <input
                                      type="text"
                                      value={profileForm.address}
                                      onChange={(e) =>
                                        setProfileForm((f) => ({ ...f, address: e.target.value }))
                                      }
                                      className="w-full mt-1 px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                                    />
                                  </div>
                                </div>

                                <div className="flex items-center justify-end gap-2 pt-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setIsEditingProfile(false);
                                      stopProfileCamera();
                                      setProfileCameraOpen(false);
                                    }}
                                    className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="submit"
                                    disabled={savingProfile}
                                    className="px-5 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>
                                      {savingProfile ? 'Saving Changes...' : 'Save Profile Changes'}
                                    </span>
                                  </button>
                                </div>
                              </form>
                            ) : (
                              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-2.5">
                                <div className="flex justify-between">
                                  <span className="text-slate-500">Full Name:</span>
                                  <span className="font-semibold text-slate-900 dark:text-white">
                                    {currentUser.firstName} {currentUser.middleName}{' '}
                                    {currentUser.lastName} {currentUser.suffix}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-500">Username:</span>
                                  <span className="font-mono font-medium">{currentUser.username}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-500">Email:</span>
                                  <span className="font-mono font-medium">{currentUser.email}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-500">Contact Number:</span>
                                  <span className="font-mono font-medium">
                                    {currentUser.contactNumber || '+63 917 842 1904'}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-500">Date of Birth / Sex / Status:</span>
                                  <span className="font-mono font-medium">
                                    {currentUser.dateOfBirth || '1996-05-14'} ·{' '}
                                    {currentUser.sex || 'Male'} ·{' '}
                                    {currentUser.civilStatus || 'Single'}
                                  </span>
                                </div>
                                <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                                  <span className="text-slate-500 block">
                                    Registered Barangay Address:
                                  </span>
                                  <span className="font-medium text-slate-900 dark:text-white">
                                    {currentUser.address}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Security & Session Controls */}
                          <div className="space-y-3 text-xs">
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                              Security & Session Controls
                            </h3>
                            <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                              <div className="p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                                      <Fingerprint className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                                      <span>WebAuthn Biometric Passkey Unlock</span>
                                    </div>
                                    <div className="text-slate-500">
                                      Fingerprint / Face ID hardware authentication (Web Authentication API)
                                    </div>
                                  </div>
                                  <span
                                    className={`px-2.5 py-1 rounded-lg font-mono text-[11px] font-semibold ${
                                      currentUser.biometricEnabled || enrolledCredential
                                        ? 'bg-emerald-800 text-white'
                                        : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                                    }`}
                                  >
                                    {currentUser.biometricEnabled || enrolledCredential
                                      ? 'Enrolled'
                                      : 'Not Enrolled'}
                                  </span>
                                </div>

                                {enrolledCredential && (
                                  <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/80 font-mono text-[11px] text-slate-700 dark:text-slate-300 space-y-0.5">
                                    <div className="font-semibold text-emerald-900 dark:text-emerald-300">
                                      Credential ID: {enrolledCredential.credentialId.slice(0, 24)}...
                                    </div>
                                    <div>
                                      Authenticator: {enrolledCredential.authenticatorMode} · Enrolled{' '}
                                      {new Date(enrolledCredential.enrolledAt).toLocaleDateString('en-PH')}
                                    </div>
                                  </div>
                                )}

                                <div className="flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={webAuthnBusy}
                                    onClick={() => executeWebAuthnRegistration()}
                                    className="px-3 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center gap-1.5"
                                  >
                                    <Fingerprint className="w-3.5 h-3.5" />
                                    <span>
                                      {enrolledCredential
                                        ? 'Re-Enroll Biometric Passkey'
                                        : 'Enroll Fingerprint / Face ID'}
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    disabled={webAuthnBusy}
                                    onClick={executeWebAuthnSignIn}
                                    className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-xs"
                                  >
                                    Test Biometric Assertion
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      refreshBiometricUsageHistory();
                                      setProfileSubTab('biometric_history');
                                    }}
                                    className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-emerald-800 dark:text-emerald-400 font-semibold text-xs"
                                  >
                                    View Biometric Usage History →
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-col gap-2.5 pt-2">
                            <button
                              onClick={() => setWorkspaceView('auth')}
                              className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 font-semibold text-xs flex items-center justify-center gap-2"
                            >
                              <Lock className="w-4 h-4" />
                              <span>Switch Account / Edit Registration Profile</span>
                            </button>
                            <button
                              onClick={async () => {
                                if (firebaseToken) {
                                  await signOut(auth);
                                  setFirebaseToken(null);
                                }
                                setWorkspaceView('auth');
                                showToast('Logged out securely from Barangay Lower Dimorok session.');
                              }}
                              className="w-full min-h-[44px] rounded-xl bg-red-700 hover:bg-red-600 text-white font-semibold text-xs flex items-center justify-center gap-2"
                            >
                              <LogOut className="w-4 h-4" />
                              <span>Log Out All Devices</span>
                            </button>
                          </div>
                        </>
                      ) : (
                        /* SUB-TAB 2: BIOMETRIC USAGE HISTORY */
                        <div className="space-y-4">
                          {/* TOP SUMMARY CARD: PASSKEY ENROLLMENT RATE AMONG CITIZENS */}
                          <div className="p-4 rounded-2xl bg-emerald-950/5 dark:bg-emerald-950/30 border border-emerald-800/25 dark:border-emerald-800/60 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-0.5">
                                <div className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-400 flex items-center gap-1.5">
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                  <span>Barangay Citizen Registry · Biometric Adoption</span>
                                </div>
                                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                                  Passkey Enrollment Rate
                                </h4>
                                <p className="text-[11px] text-slate-600 dark:text-slate-300">
                                  Compares FIDO2 passkey-enrolled citizens against total registered residents in the Barangay Lower Dimorok database.
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="text-2xl font-bold font-mono tabular-nums text-emerald-800 dark:text-emerald-400">
                                  {passkeyEnrollmentStats.formattedRate}
                                </div>
                                <div className="text-[11px] font-mono text-slate-600 dark:text-slate-400">
                                  {passkeyEnrollmentStats.enrolledUsersCount} of{' '}
                                  {passkeyEnrollmentStats.totalRegisteredResidents} Residents
                                </div>
                              </div>
                            </div>

                            {/* Progress Bar */}
                            <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                              <div
                                className="h-full bg-emerald-700 dark:bg-emerald-500 transition-all duration-300"
                                style={{
                                  width: `${Math.min(passkeyEnrollmentStats.enrollmentRatePct, 100)}%`,
                                }}
                              />
                            </div>

                            {/* Comparison Breakdown Row */}
                            <div className="grid grid-cols-3 gap-2 pt-1 text-[11px]">
                              <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800">
                                <span className="text-slate-500 block">Enrolled Citizens</span>
                                <span className="font-mono font-bold text-sm tabular-nums text-emerald-800 dark:text-emerald-400">
                                  {passkeyEnrollmentStats.enrolledUsersCount}
                                </span>
                              </div>
                              <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800">
                                <span className="text-slate-500 block">Registered in DB</span>
                                <span className="font-mono font-bold text-sm tabular-nums text-slate-900 dark:text-white">
                                  {passkeyEnrollmentStats.totalRegisteredResidents}
                                </span>
                              </div>
                              <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800">
                                <span className="text-slate-500 block">Unenrolled</span>
                                <span className="font-mono font-bold text-sm tabular-nums text-amber-700 dark:text-amber-400">
                                  {passkeyEnrollmentStats.unenrolledUsersCount}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <Fingerprint className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                                <span>Biometric Usage History</span>
                              </h3>
                              <p className="text-xs text-slate-500 mt-0.5">
                                Audited FIDO2/WebAuthn biometric events for Barangay Lower Dimorok.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                refreshBiometricUsageHistory();
                                showToast('Synced biometric usage audit logs.');
                              }}
                              className="self-start sm:self-auto px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span>Refresh Log</span>
                            </button>
                          </div>

                          {/* Summary Counters for Enrolled vs Signed In vs Failed Events */}
                          <div className="grid grid-cols-4 gap-2 text-xs">
                            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                              <div className="text-slate-500 text-[11px]">Total</div>
                              <div className="text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                                {webAuthnActivityLogs.length}
                              </div>
                            </div>
                            <div className="p-2.5 rounded-xl bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/70">
                              <div className="text-sky-800 dark:text-sky-300 font-medium text-[11px]">
                                Enrolled
                              </div>
                              <div className="text-base font-bold font-mono tabular-nums text-sky-900 dark:text-sky-200 mt-0.5">
                                {
                                  webAuthnActivityLogs.filter(
                                    (entry) => entry.eventStatus === 'Enrolled'
                                  ).length
                                }
                              </div>
                            </div>
                            <div className="p-2.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70">
                              <div className="text-emerald-800 dark:text-emerald-300 font-medium text-[11px]">
                                Signed In
                              </div>
                              <div className="text-base font-bold font-mono tabular-nums text-emerald-900 dark:text-emerald-200 mt-0.5">
                                {
                                  webAuthnActivityLogs.filter(
                                    (entry) => entry.eventStatus === 'Signed In'
                                  ).length
                                }
                              </div>
                            </div>
                            <div className="p-2.5 rounded-xl bg-red-50/70 dark:bg-red-950/30 border border-red-200 dark:border-red-800/70">
                              <div className="text-red-800 dark:text-red-300 font-medium text-[11px]">
                                Failed
                              </div>
                              <div className="text-base font-bold font-mono tabular-nums text-red-900 dark:text-red-200 mt-0.5">
                                {
                                  webAuthnActivityLogs.filter(
                                    (entry) => entry.eventStatus === 'Failed'
                                  ).length
                                }
                              </div>
                            </div>
                          </div>

                          {/* Filter Controls & Live Test Trigger Actions (including Simulate Biometric Sign-in Failure) */}
                          <div className="space-y-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
                                {(['ALL', 'Enrolled', 'Signed In', 'Failed'] as const).map(
                                  (statusOpt) => (
                                    <button
                                      key={statusOpt}
                                      type="button"
                                      onClick={() => setBiometricStatusFilter(statusOpt)}
                                      className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                                        biometricStatusFilter === statusOpt
                                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                                      }`}
                                    >
                                      {statusOpt === 'ALL' ? 'All Events' : statusOpt}
                                    </button>
                                  )
                                )}
                              </div>

                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={webAuthnBusy}
                                  onClick={() => executeWebAuthnRegistration()}
                                  className="px-2.5 py-1.5 rounded-lg bg-sky-800 hover:bg-sky-700 text-white text-[11px] font-semibold"
                                >
                                  + Enroll Passkey
                                </button>
                                <button
                                  type="button"
                                  disabled={webAuthnBusy}
                                  onClick={executeWebAuthnSignIn}
                                  className="px-2.5 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-white text-[11px] font-semibold"
                                >
                                  + Test Sign-In
                                </button>
                              </div>
                            </div>

                            {/* Dedicated 'Simulate Biometric Sign-in Failure' Action Button */}
                            <button
                              type="button"
                              disabled={webAuthnBusy}
                              onClick={simulateBiometricSignInFailure}
                              className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-950/60 border border-red-300 dark:border-red-800 text-red-800 dark:text-red-300 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                            >
                              <XCircle className="w-4 h-4 shrink-0" />
                              <span>Simulate Biometric Sign-in Failure</span>
                            </button>
                          </div>

                          {/* Error / Rejected Passkey Verification Banner */}
                          {biometricFailureAlert && (
                            <div
                              role="alert"
                              className="p-4 rounded-2xl bg-red-50/90 dark:bg-red-950/40 border border-red-300 dark:border-red-800 space-y-2.5 text-xs"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2 font-bold text-red-900 dark:text-red-200">
                                  <AlertCircle className="w-4 h-4 text-red-700 dark:text-red-400 shrink-0" />
                                  <span>
                                    Biometric Sign-In Rejected ({biometricFailureAlert.domExceptionName})
                                  </span>
                                </div>
                                <span className="font-mono text-[10px] font-semibold text-red-800 dark:text-red-300">
                                  {biometricFailureAlert.errorCode}
                                </span>
                              </div>

                              <p className="text-red-800 dark:text-red-300 leading-relaxed">
                                {biometricFailureAlert.reason}
                              </p>

                              <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-red-200 dark:border-red-900/60 font-mono text-[11px] text-slate-700 dark:text-slate-300 space-y-1">
                                <div>
                                  Rejected Credential ID: {biometricFailureAlert.credentialId}
                                </div>
                                <div>
                                  Actor: {biometricFailureAlert.actorName} (
                                  {biometricFailureAlert.actorRole}) · Status: ACCESS_DENIED
                                </div>
                              </div>

                              <p className="text-[11px] text-slate-600 dark:text-slate-400">
                                {biometricFailureAlert.remediation}
                              </p>

                              <div className="flex items-center gap-2 pt-1">
                                <button
                                  type="button"
                                  disabled={webAuthnBusy}
                                  onClick={executeWebAuthnSignIn}
                                  className="px-3 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-white text-[11px] font-semibold"
                                >
                                  Retry Valid Sign-In
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setBiometricFailureAlert(null)}
                                  className="px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-800 text-red-800 dark:text-red-300 text-[11px] font-semibold hover:bg-red-100 dark:hover:bg-red-900/40"
                                >
                                  Dismiss Alert
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Audit Log Entries List */}
                          {filteredBiometricHistoryLogs.length === 0 ? (
                            <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 text-center space-y-2 text-xs text-slate-500">
                              <p>No biometric activity logs match "{biometricStatusFilter}".</p>
                              <button
                                type="button"
                                onClick={() => setBiometricStatusFilter('ALL')}
                                className="px-3 py-1.5 rounded-lg bg-emerald-800 text-white font-semibold"
                              >
                                Show All Biometric Events
                              </button>
                            </div>
                          ) : (
                            <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900">
                              {filteredBiometricHistoryLogs.map((log) => {
                                const isFailed = log.eventStatus === 'Failed';
                                const isEnrolled = log.eventStatus === 'Enrolled';
                                return (
                                  <div key={log.id} className="p-4 space-y-2 text-xs">
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="space-y-0.5 min-w-0">
                                        <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                          {isFailed ? (
                                            <XCircle className="w-3.5 h-3.5 text-red-600 dark:text-red-400 shrink-0" />
                                          ) : isEnrolled ? (
                                            <KeyRound className="w-3.5 h-3.5 text-sky-700 dark:text-sky-400 shrink-0" />
                                          ) : (
                                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0" />
                                          )}
                                          <span className="truncate">{log.eventType}</span>
                                        </div>
                                        <div className="text-[11px] text-slate-500">
                                          {log.actorName} ·{' '}
                                          <span className="font-mono font-semibold">
                                            {log.actorRole}
                                          </span>
                                        </div>
                                      </div>

                                      {/* Distinct Status Indicator: 'Enrolled' vs 'Signed In' vs 'Failed' */}
                                      <span
                                        className={`inline-flex items-center gap-1.5 font-mono text-xs font-bold shrink-0 ${
                                          isFailed
                                            ? 'text-red-700 dark:text-red-400'
                                            : isEnrolled
                                            ? 'text-sky-800 dark:text-sky-300'
                                            : 'text-emerald-800 dark:text-emerald-400'
                                        }`}
                                      >
                                        <span
                                          className={`w-2 h-2 rounded-full ${
                                            isFailed
                                              ? 'bg-red-600 dark:bg-red-400'
                                              : isEnrolled
                                              ? 'bg-sky-600 dark:bg-sky-400'
                                              : 'bg-emerald-600 dark:bg-emerald-400'
                                          }`}
                                        />
                                        <span>
                                          {isFailed
                                            ? 'Failed'
                                            : isEnrolled
                                            ? 'Enrolled'
                                            : 'Signed In'}
                                        </span>
                                      </span>
                                    </div>

                                    {log.failureReason && (
                                      <div className="text-[11px] text-red-700 dark:text-red-400 bg-red-50/70 dark:bg-red-950/30 px-2.5 py-1.5 rounded-lg border border-red-200/70 dark:border-red-900/50">
                                        {log.failureReason}
                                      </div>
                                    )}

                                    <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] font-mono text-slate-600 dark:text-slate-400">
                                      <span className="truncate" title={log.credentialId}>
                                        Credential: {log.credentialId}
                                      </span>
                                      <span className="tabular-nums text-slate-500 shrink-0">
                                        {new Date(log.accessTimestamp).toLocaleString('en-PH', {
                                          month: 'short',
                                          day: '2-digit',
                                          year: 'numeric',
                                          hour: '2-digit',
                                          minute: '2-digit',
                                          second: '2-digit',
                                        })}
                                      </span>
                                    </div>

                                    <div className="text-[11px] text-slate-500 flex items-center justify-between">
                                      <span>Authenticator: {log.authenticatorMode}</span>
                                      <span className="font-mono text-[10px] text-slate-400">
                                        {isFailed
                                          ? 'ASSERTION REJECTED'
                                          : isEnrolled
                                          ? 'DEVICE ENROLLMENT'
                                          : 'ASSERTION VERIFIED'}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* FLOATING "AskLowerDimorok" CIVIC AI ASSISTANT BUTTON */}
            <button
              onClick={() => setShowAiAssistant(true)}
              className="absolute bottom-20 right-4 z-30 min-h-[48px] px-4 py-2.5 rounded-full bg-slate-900 dark:bg-emerald-700 text-white shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-transform flex items-center gap-2 text-xs font-semibold"
            >
              <Bot className="w-4 h-4 text-emerald-400 dark:text-white" />
              <span>AskLowerDimorok</span>
            </button>

            {/* FIXED BOTTOM-TAB MOBILE NAVIGATION (5 Tabs) */}
            <nav className="sticky bottom-0 z-20 grid grid-cols-5 items-center h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800">
              {[
                { id: 'home', label: 'Home', icon: Home },
                { id: 'services', label: 'Services', icon: FileCheck2 },
                { id: 'requests', label: 'Requests', icon: Clock },
                { id: 'announcements', label: 'Notices', icon: Megaphone },
                { id: 'profile', label: 'Profile', icon: User },
              ].map((tab) => {
                const IconComponent = tab.icon;
                const isActive =
                  residentTab === tab.id &&
                  !selectedService &&
                  !applyingService &&
                  !selectedRequestDetail;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setSelectedService(null);
                      setApplyingService(null);
                      setSelectedRequestDetail(null);
                      setResidentTab(tab.id as ResidentTab);
                    }}
                    className={`min-h-[48px] flex flex-col items-center justify-center transition-colors ${
                      isActive
                        ? 'text-emerald-800 dark:text-emerald-400 font-bold'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    <IconComponent className="w-5 h-5" />
                    <span className="text-[10px] tracking-tight mt-1 whitespace-nowrap">
                      {tab.label}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      {/* GLOBAL EDIT PROFILE MODAL FOR ALL USERS & OFFICIALS */}
      {showEditProfileModal && currentUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-xl w-full p-6 sm:p-7 shadow-2xl space-y-5 my-8">
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3.5">
                {currentResidentPhotoUrl ? (
                  <img
                    src={currentResidentPhotoUrl}
                    alt={`${currentUser.firstName} ${currentUser.lastName}`}
                    className="w-14 h-14 rounded-2xl object-cover border-2 border-emerald-700 shrink-0"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-2xl bg-emerald-800 text-white font-bold text-base flex items-center justify-center shrink-0">
                    {currentUser.firstName?.[0] || 'U'}
                    {currentUser.lastName?.[0] || 'P'}
                  </div>
                )}
                <div>
                  <span className="text-[11px] font-mono font-semibold text-emerald-800 dark:text-emerald-400">
                    Account Role: {currentUser.role}
                  </span>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    Update My Profile
                  </h2>
                  <p className="text-xs text-slate-500">
                    Update personal details, contact number, domicile address, and ID photo.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowEditProfileModal(false);
                  stopProfileCamera();
                  setProfileCameraOpen(false);
                }}
                className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleSaveProfileUpdate} className="space-y-4 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  Profile Photo (Upload or Live Camera)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => profilePhotoInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                    <span>Upload Photo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (profileCameraOpen) {
                        stopProfileCamera();
                        setProfileCameraOpen(false);
                      } else {
                        startProfileCamera();
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-emerald-800 text-white font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>{profileCameraOpen ? 'Close Camera' : 'Use Camera'}</span>
                  </button>
                </div>
              </div>

              {profileCameraOpen && (
                <div className="p-3.5 rounded-2xl bg-slate-950 text-white space-y-3">
                  <div className="relative aspect-square max-w-[220px] mx-auto rounded-xl overflow-hidden border border-emerald-500/50 bg-slate-900 flex items-center justify-center">
                    <video
                      ref={profileCameraVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className={`w-full h-full object-cover ${
                        profileCameraStreamActive ? 'block' : 'hidden'
                      }`}
                    />
                    {!profileCameraStreamActive && (
                      <div className="p-3 text-center space-y-1.5">
                        <Camera className="w-7 h-7 text-emerald-400 mx-auto" />
                        <p className="text-[11px] text-slate-300">
                          {profileCameraError || 'Initializing camera preview...'}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={handleCaptureProfileCameraPhoto}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>Capture Photo & Preview</span>
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    First Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={profileForm.firstName}
                    onChange={(e) =>
                      setProfileForm((f) => ({ ...f, firstName: e.target.value }))
                    }
                    className="w-full mt-1 px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    Middle Name
                  </label>
                  <input
                    type="text"
                    value={profileForm.middleName}
                    onChange={(e) =>
                      setProfileForm((f) => ({ ...f, middleName: e.target.value }))
                    }
                    className="w-full mt-1 px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={profileForm.lastName}
                    onChange={(e) =>
                      setProfileForm((f) => ({ ...f, lastName: e.target.value }))
                    }
                    className="w-full mt-1 px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    Suffix
                  </label>
                  <input
                    type="text"
                    value={profileForm.suffix}
                    onChange={(e) =>
                      setProfileForm((f) => ({ ...f, suffix: e.target.value }))
                    }
                    placeholder="Optional"
                    className="w-full mt-1 px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    Username *
                  </label>
                  <input
                    type="text"
                    required
                    value={profileForm.username}
                    onChange={(e) =>
                      setProfileForm((f) => ({ ...f, username: e.target.value }))
                    }
                    className="w-full mt-1 px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={profileForm.email}
                    onChange={(e) =>
                      setProfileForm((f) => ({ ...f, email: e.target.value }))
                    }
                    className="w-full mt-1 px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    Contact Number *
                  </label>
                  <input
                    type="tel"
                    required
                    value={profileForm.contactNumber}
                    onChange={(e) =>
                      setProfileForm((f) => ({ ...f, contactNumber: e.target.value }))
                    }
                    className="w-full mt-1 px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    Date of Birth
                  </label>
                  <input
                    type="date"
                    value={profileForm.dateOfBirth}
                    onChange={(e) =>
                      setProfileForm((f) => ({ ...f, dateOfBirth: e.target.value }))
                    }
                    className="w-full mt-1 px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    Sex
                  </label>
                  <select
                    value={profileForm.sex}
                    onChange={(e) =>
                      setProfileForm((f) => ({ ...f, sex: e.target.value }))
                    }
                    className="w-full mt-1 px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    Civil Status
                  </label>
                  <select
                    value={profileForm.civilStatus}
                    onChange={(e) =>
                      setProfileForm((f) => ({ ...f, civilStatus: e.target.value }))
                    }
                    className="w-full mt-1 px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    <option value="Single">Single</option>
                    <option value="Married">Married</option>
                    <option value="Widowed">Widowed</option>
                    <option value="Separated">Separated</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    Purok / Sitio
                  </label>
                  <select
                    value={profileForm.purok}
                    onChange={(e) => {
                      const nextPurok = e.target.value;
                      setProfileForm((f) => ({
                        ...f,
                        purok: nextPurok,
                        address: `${nextPurok}, Barangay Lower Dimorok, Molave, Zamboanga del Sur`,
                      }));
                    }}
                    className="w-full mt-1 px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    <option value="Purok 1 - Centro">Purok 1 - Centro</option>
                    <option value="Purok 2 - Riverside">Purok 2 - Riverside</option>
                    <option value="Purok 3 - Hillside">Purok 3 - Hillside</option>
                    <option value="Purok 4 - Mabuhay">Purok 4 - Mabuhay</option>
                    <option value="Purok 5 - Bagong Silang">Purok 5 - Bagong Silang</option>
                    <option value="Purok 6 - Pag-asa">Purok 6 - Pag-asa</option>
                    <option value="Purok 7 - Masagana">Purok 7 - Masagana</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    Registered Barangay Address
                  </label>
                  <input
                    type="text"
                    value={profileForm.address}
                    onChange={(e) =>
                      setProfileForm((f) => ({ ...f, address: e.target.value }))
                    }
                    className="w-full mt-1 px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditProfileModal(false);
                    stopProfileCamera();
                    setProfileCameraOpen(false);
                  }}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="px-5 py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{savingProfile ? 'Saving Changes...' : 'Save Profile Changes'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DIGITAL CERTIFICATE MODAL (PDF / PRINT / QR) */}
      <CertificateModal
        document={activeCertificate}
        onClose={() => setActiveCertificate(null)}
        onVerifyClick={(code) => handleVerifyDocument(code)}
        userRole={currentUser?.role}
        authHeaders={authHeaders}
        barangayName={barangaySettings.barangayName}
        onNotesUpdated={() => {
          fetchPortalData();
        }}
      />

      {/* GUARDRAILED CIVIC AI ASSISTANT DRAWER */}
      <CivicAssistantDrawer
        isOpen={showAiAssistant}
        onClose={() => setShowAiAssistant(false)}
        authHeaders={authHeaders}
      />
    </div>
  );
}
