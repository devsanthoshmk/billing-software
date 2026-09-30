'use server';

import { db } from '@/lib/db';
import { auditLogs } from '@/lib/db/schema';
import fs from 'node:fs';
import path from 'node:path';

export async function createDatabaseBackupSnapshot(operator = 'ADMIN') {
  try {
    const dbPath = path.resolve(process.cwd(), 'data/siva_erp.db');
    if (!fs.existsSync(dbPath)) {
      return { success: false, error: 'Database file not found on disk' };
    }

    const backupDir = path.resolve(process.cwd(), 'data/backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `siva_erp_backup_${timestamp}.db`;
    const backupDest = path.join(backupDir, backupFileName);

    // Atomic file copy of SQLite database
    fs.copyFileSync(dbPath, backupDest);
    const stats = fs.statSync(backupDest);

    // Log in audit trail
    await db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      userId: operator,
      action: 'SYSTEM_BACKUP',
      entityType: 'database',
      entityId: backupFileName,
      remarks: `Database backup snapshot created (${Math.round(stats.size / 1024)} KB)`,
    });

    return {
      success: true,
      fileName: backupFileName,
      sizeKb: Math.round(stats.size / 1024),
      timestamp: new Date().toLocaleString(),
    };
  } catch (err: any) {
    console.error('createDatabaseBackupSnapshot error:', err);
    return { success: false, error: err.message };
  }
}

export async function getExistingBackups() {
  try {
    const backupDir = path.resolve(process.cwd(), 'data/backups');
    if (!fs.existsSync(backupDir)) {
      return { success: true, backups: [] };
    }

    const files = fs.readdirSync(backupDir).filter((f) => f.endsWith('.db'));
    const list = files.map((f) => {
      const st = fs.statSync(path.join(backupDir, f));
      return {
        fileName: f,
        sizeKb: Math.round(st.size / 1024),
        createdAt: st.birthtime.toLocaleString(),
      };
    });

    list.sort((a, b) => b.fileName.localeCompare(a.fileName));
    return { success: true, backups: list };
  } catch (err: any) {
    console.error('getExistingBackups error:', err);
    return { success: false, error: err.message, backups: [] };
  }
}
