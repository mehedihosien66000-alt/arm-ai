import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import type { App, ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { Auth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

export interface FirebaseAppletConfig {
  projectId: string;
  firestoreDatabaseId?: string;
}

export function loadFirebaseAppletConfig(): FirebaseAppletConfig | null {
  try {
    const raw = fs.readFileSync(path.join(ROOT_DIR, 'firebase-applet-config.json'), 'utf8');
    const parsed = JSON.parse(raw) as { projectId?: string; firestoreDatabaseId?: string };
    if (!parsed.projectId) return null;
    return {
      projectId: parsed.projectId,
      firestoreDatabaseId: parsed.firestoreDatabaseId,
    };
  } catch {
    return null;
  }
}

function parseServiceAccountFromEnv(): ServiceAccount | null {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (rawJson) {
    try {
      const normalized = rawJson.startsWith('{')
        ? rawJson
        : Buffer.from(rawJson, 'base64').toString('utf8');
      const parsed = JSON.parse(normalized) as ServiceAccount & {
        project_id?: string;
        private_key?: string;
        client_email?: string;
      };
      if (parsed.private_key || parsed.privateKey) {
        return {
          projectId: parsed.projectId || parsed.project_id,
          clientEmail: parsed.clientEmail || parsed.client_email,
          privateKey: (parsed.privateKey || parsed.private_key || '').replace(/\\n/g, '\n'),
        };
      }
    } catch {
      return null;
    }
  }

  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (credPath && fs.existsSync(credPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(credPath, 'utf8')) as ServiceAccount & {
        project_id?: string;
        private_key?: string;
        client_email?: string;
      };
      if (parsed.private_key || parsed.privateKey) {
        return {
          projectId: parsed.projectId || parsed.project_id,
          clientEmail: parsed.clientEmail || parsed.client_email,
          privateKey: (parsed.privateKey || parsed.private_key || '').replace(/\\n/g, '\n'),
        };
      }
    } catch {
      return null;
    }
  }

  return null;
}

export interface FirebaseAdminContext {
  app: App;
  auth: Auth;
  db: Firestore;
  projectId: string;
  databaseId: string;
}

let cachedContext: FirebaseAdminContext | null | undefined;

export function getFirebaseAdminContext(): FirebaseAdminContext | null {
  if (cachedContext !== undefined) {
    return cachedContext;
  }

  const cfg = loadFirebaseAppletConfig();
  const serviceAccount = parseServiceAccountFromEnv();
  if (!cfg || !serviceAccount) {
    cachedContext = null;
    return null;
  }

  const projectId = serviceAccount.projectId || cfg.projectId;
  const databaseId = cfg.firestoreDatabaseId || '(default)';

  const existing = getApps().find((a) => a.name === 'arm-ai-admin');
  const app =
    existing ||
    initializeApp(
      {
        credential: cert(serviceAccount),
        projectId,
      },
      'arm-ai-admin',
    );

  const auth = getAuth(app);
  const db = databaseId && databaseId !== '(default)' ? getFirestore(app, databaseId) : getFirestore(app);

  cachedContext = {
    app,
    auth,
    db,
    projectId,
    databaseId,
  };
  return cachedContext;
}

export function isFirebaseAdminConfigured(): boolean {
  return Boolean(getFirebaseAdminContext());
}
