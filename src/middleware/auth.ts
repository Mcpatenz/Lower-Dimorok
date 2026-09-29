import { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import { getOrCreateUser, getUserByUid, recordAuditLog } from '../db/repository.ts';

export interface AuthRequest extends Request {
  user?: {
    uid: string;
    email: string;
    role: string;
  };
}

const SQLI_XSS_PATTERNS = [
  /(\bUNION\b\s+\bSELECT\b)/i,
  /(\bDROP\b\s+\bTABLE\b)/i,
  /(\bOR\b\s+['"]?1['"]?\s*=\s*['"]?1['"]?)/i,
  /(;\s*--)/,
  /(<script\b[^>]*>)/i,
  /(javascript\s*:)/i,
  /(onerror\s*=|onload\s*=)/i,
];

function containsMaliciousPayload(value: unknown): string | null {
  if (typeof value === 'string') {
    for (const regex of SQLI_XSS_PATTERNS) {
      if (regex.test(value)) {
        return value.slice(0, 120);
      }
    }
  } else if (Array.isArray(value)) {
    for (const item of value) {
      const hit = containsMaliciousPayload(item);
      if (hit) return hit;
    }
  } else if (value && typeof value === 'object') {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      const hit = containsMaliciousPayload((value as Record<string, unknown>)[key]);
      if (hit) return hit;
    }
  }
  return null;
}

export const wafTamperGuard = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const matchedBody = containsMaliciousPayload(req.body);
  const matchedQuery = containsMaliciousPayload(req.query);
  const matchedParams = containsMaliciousPayload(req.params);
  const matchedSample = matchedBody || matchedQuery || matchedParams;

  if (matchedSample) {
    await recordAuditLog({
      eventCode: 'ER_DETECT_TAMPER',
      actorUid: req.user?.uid || 'UNAUTHENTICATED_CLIENT',
      actorEmail: req.user?.email || 'unknown@client',
      actorRole: req.user?.role || 'GUEST',
      severity: 'CRITICAL',
      description: `Real-time input guard intercepted SQLi/XSS payload on ${req.method} ${req.path}`,
      ipAddress: req.ip || '127.0.0.1',
      metadata: {
        endpoint: req.path,
        method: req.method,
        snippet: matchedSample,
      },
    });

    return res.status(400).json({
      error: 'Security Violation Detected (ER_DETECT_TAMPER): Malformed or potentially unsafe input payload rejected and logged.',
      code: 'ER_DETECT_TAMPER',
    });
  }

  next();
};

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const demoPersonaHeader = req.headers['x-dabawgov-persona'] as string | undefined;

  if (demoPersonaHeader) {
    const personaMap: Record<
      string,
      { uid: string; email: string; role: string; firstName: string; lastName: string }
    > = {
      'demo-resident-jonel': {
        uid: 'demo-resident-jonel',
        email: 'jonel.mabini@dimorok.gov.ph',
        role: 'RESIDENT',
        firstName: 'Jonel',
        lastName: 'Mabini',
      },
      'demo-resident-elena': {
        uid: 'demo-resident-elena',
        email: 'elena.soriano@dimorok.gov.ph',
        role: 'RESIDENT',
        firstName: 'Elena',
        lastName: 'Soriano',
      },
      'admin-secretary-01': {
        uid: 'admin-secretary-01',
        email: 'secretary@lowerdimorok.gov.ph',
        role: 'SECRETARY',
        firstName: 'Marites',
        lastName: 'Cabrera',
      },
      'admin-treasurer-01': {
        uid: 'admin-treasurer-01',
        email: 'treasurer@lowerdimorok.gov.ph',
        role: 'TREASURER',
        firstName: 'Noel',
        lastName: 'Magsaysay',
      },
      'admin-tanod-01': {
        uid: 'admin-tanod-01',
        email: 'tanod@lowerdimorok.gov.ph',
        role: 'TANOD',
        firstName: 'Rolando',
        lastName: 'Dalisay',
      },
      'admin-kagawad-01': {
        uid: 'admin-kagawad-01',
        email: 'kagawad@lowerdimorok.gov.ph',
        role: 'KAGAWAD',
        firstName: 'Danilo',
        lastName: 'Mendoza',
      },
      'admin-captain-01': {
        uid: 'admin-captain-01',
        email: 'captain@lowerdimorok.gov.ph',
        role: 'CAPTAIN',
        firstName: 'Rodrigo',
        lastName: 'Balimbingan',
      },
    };

    const persona = personaMap[demoPersonaHeader];
    if (persona) {
      const dbUser = await getOrCreateUser(persona.uid, persona.email, persona);
      req.user = {
        uid: dbUser.uid,
        email: dbUser.email,
        role: dbUser.role,
      };
      return next();
    }

    // Also allow any dynamically created official or citizen UID in the database
    const existingDynamicUser = await getUserByUid(demoPersonaHeader);
    if (existingDynamicUser) {
      req.user = {
        uid: existingDynamicUser.uid,
        email: existingDynamicUser.email,
        role: existingDynamicUser.role,
      };
      return next();
    }
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing authentication token' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    const dbUser = await getOrCreateUser(decodedToken.uid, decodedToken.email || 'resident@dimorok.gov.ph', {
      firstName: decodedToken.name?.split(' ')[0] || 'Resident',
      lastName: decodedToken.name?.split(' ').slice(1).join(' ') || 'Citizen',
    });

    req.user = {
      uid: dbUser.uid,
      email: dbUser.email,
      role: dbUser.role,
    };
    next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired session token' });
  }
};

export const requireOfficialRole = (allowedRoles: string[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const dbUser = await getUserByUid(req.user.uid);
    const currentRole = dbUser?.role || req.user.role;
    if (!allowedRoles.includes(currentRole)) {
      await recordAuditLog({
        eventCode: 'RBAC_ACCESS_DENIED',
        actorUid: req.user.uid,
        actorEmail: req.user.email,
        actorRole: currentRole,
        severity: 'WARNING',
        description: `Unauthorized role access attempt on ${req.path} (Role: ${currentRole})`,
      });
      return res.status(403).json({
        error: `Forbidden: Action requires official role (${allowedRoles.join(' / ')}).`,
      });
    }
    next();
  };
};
