'use server';

import { db } from '@/lib/db';
import { systemControls, auditLogs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function getSupervisorSettings() {
  try {
    const controls = (await db.query.systemControls.findFirst()) || {
      allowRateModification: false,
      allowOutstandingOverride: false,
      allowCollectionEdit: false,
      allowReportsAccess: true,
      allowDayEndOverride: false,
      allowCreditNoteAdjustment: true,
      allowCreditNoteCreation: true,
      allowInvoiceCancellation: false,
      allowPaymentModification: false,
      enforceCreditLimit: true,
      enforceLicenseExpiryBlock: true,
      enforceNegativeMarginBlock: true,
    };

    return { success: true, controls };
  } catch (err: any) {
    console.error('getSupervisorSettings error:', err);
    return { success: false, error: err.message };
  }
}

export async function updateSupervisorSettings(input: {
  allowRateModification: boolean;
  allowOutstandingOverride: boolean;
  allowCollectionEdit: boolean;
  allowInvoiceCancellation: boolean;
  enforceCreditLimit: boolean;
  enforceLicenseExpiryBlock: boolean;
  enforceNegativeMarginBlock: boolean;
  operatorPassword?: string;
  adminPassword?: string;
  operator: string;
}) {
  try {
    const current = await db.query.systemControls.findFirst();

    const updatePayload: any = {
      allowRateModification: input.allowRateModification,
      allowOutstandingOverride: input.allowOutstandingOverride,
      allowCollectionEdit: input.allowCollectionEdit,
      allowInvoiceCancellation: input.allowInvoiceCancellation,
      enforceCreditLimit: input.enforceCreditLimit,
      enforceLicenseExpiryBlock: input.enforceLicenseExpiryBlock,
      enforceNegativeMarginBlock: input.enforceNegativeMarginBlock,
    };

    if (input.operatorPassword && input.operatorPassword.trim()) {
      updatePayload.operatorPasswordHash = input.operatorPassword.trim();
    }
    if (input.adminPassword && input.adminPassword.trim()) {
      updatePayload.adminPasswordHash = input.adminPassword.trim();
    }

    if (current) {
      await db.update(systemControls).set(updatePayload).where(eq(systemControls.id, current.id));
    } else {
      await db.insert(systemControls).values({ id: 'default', ...updatePayload });
    }

    await db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      userId: input.operator || 'ADMIN',
      action: 'SUPERVISOR_CONFIG_UPDATE',
      entityType: 'system_controls',
      entityId: 'default',
      remarks: 'Supervisor security and control parameters updated.',
    });

    return { success: true };
  } catch (err: any) {
    console.error('updateSupervisorSettings error:', err);
    return { success: false, error: err.message };
  }
}
