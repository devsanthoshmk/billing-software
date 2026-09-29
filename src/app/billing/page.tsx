'use client';

import React, { useState, useEffect, useRef, useTransition } from 'react';
import { DosWindow, DosAction } from '@/components/ui/DosWindow';
import { DosModal } from '@/components/ui/DosModal';
import { ProductSearchModal } from '../masters/products/ProductSearchModal';
import { InlinePartyModal } from './components/InlinePartyModal';
import { OperatorLoginModal } from './components/OperatorLoginModal';
import { BatchPickerModal, BatchItem } from './components/BatchPickerModal';
import {
  getBillingInitialData,
  createSalesInvoice,
  getBatchesForProduct,
} from './actions';
import { calculateSchemeFreeQty, roundToPaise } from '@/lib/business-engine/calculations';
import { calculateDateDiffInDays } from '@/lib/business-engine/invariants';
import { PrintPreviewModal } from '@/components/print/PrintPreviewModal';
import { PrintInvoiceData } from '@/lib/print';

export interface LineItemState {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  packaging: string;
  hsnCode: string;
  batchId: string;
  batchNo: string;
  expiryDate: string;
  quantity: number;
  freeQuantity: number;
  sellingRate: number;
  purchaseRate: number;
  mrp: number;
  tradeDiscountPct: number;
  taxCode: string;
  taxPct: number;
  schemeThreshold: number;
  schemeFreeQty: number;
  stockAvailable: number;
  isReplacement: boolean;
}

export default function BillingPOS() {
  const [operator, setOperator] = useState<string>('');
  const [showLoginModal, setShowLoginModal] = useState<boolean>(true);
  const [systemDate, setSystemDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [paymentTerms, setPaymentTerms] = useState<'CASH' | 'CREDIT' | 'CHEQUE'>('CREDIT');
  const [isInterstate, setIsInterstate] = useState<boolean>(false);

  // Master Data Cache
  const [customersList, setCustomersList] = useState<any[]>([]);
  const [salesmenList, setSalesmenList] = useState<any[]>([]);
  const [doctorsList, setDoctorsList] = useState<any[]>([]);
  const [taxSlabsList, setTaxSlabsList] = useState<any[]>([]);
  const [areasList, setAreasList] = useState<any[]>([]);

  // Selected Header Party State
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customerSearchQuery, setCustomerSearchQuery] = useState<string>('');
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const [salesmanId, setSalesmanId] = useState<string>('');
  const [doctorId, setDoctorId] = useState<string>('');
  const [customerDiscountPct, setCustomerDiscountPct] = useState<number>(0);
  const [cashDiscountPct, setCashDiscountPct] = useState<number>(0);

  // Modals State
  const [showInlinePartyModal, setShowInlinePartyModal] = useState<boolean>(false);
  const [showProductSearchModal, setShowProductSearchModal] = useState<boolean>(false);
  const [showBatchPickerModal, setShowBatchPickerModal] = useState<boolean>(false);
  const [batchPickerBatches, setBatchPickerBatches] = useState<BatchItem[]>([]);
  const [batchPickerProductName, setBatchPickerProductName] = useState<string>('');

  // Warning Dialogs State
  const [dlWarning, setDlWarning] = useState<{ message: string; isBlocking: boolean } | null>(null);
  const [creditWarning, setCreditWarning] = useState<{ message: string; canBypass: boolean } | null>(null);
  const [creditBypassed, setCreditBypassed] = useState<boolean>(false);
  const [negativeMarginAlert, setNegativeMarginAlert] = useState<{ message: string; rowIdx: number } | null>(null);
  const [splitPrompt, setSplitPrompt] = useState<{
    productName: string;
    batchNo: string;
    available: number;
    needed: number;
    onAccept: () => void;
  } | null>(null);

  // Invoice Success / Confirmation
  const [invoiceResult, setInvoiceResult] = useState<{
    invoiceNo: string;
    grandTotal: number;
    roundOff: number;
  } | null>(null);
  const [lastSavedPrintData, setLastSavedPrintData] = useState<PrintInvoiceData | null>(null);
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showClearConfirmModal, setShowClearConfirmModal] = useState<boolean>(false);

  // Line items grid state
  const [lineItems, setLineItems] = useState<LineItemState[]>([]);
  const [activeRowIdx, setActiveRowIdx] = useState<number>(0);

  // Load initial master data
  useEffect(() => {
    async function loadData() {
      try {
        const data = await getBillingInitialData();
        setCustomersList(data.customers);
        setSalesmenList(data.salesmen);
        setDoctorsList(data.doctors);
        setTaxSlabsList(data.taxSlabs);
        setAreasList(data.areas);

        if (data.customers.length > 0) {
          handleSelectCustomer(data.customers[0]);
        }
      } catch (err: any) {
        console.error('Failed to load billing initial data:', err);
      }
    }
    loadData();
  }, []);

  // Handle party selection and trigger DL/Credit checks
  const handleSelectCustomer = (cust: any) => {
    setSelectedCustomer(cust);
    setSelectedCustomerId(cust.id);
    setCustomerSearchQuery(`${cust.code} - ${cust.name}`);
    setCustomerDiscountPct(cust.defaultDiscountPct || 0);
    setIsInterstate(cust.billingType === 'O');
    setPaymentTerms(cust.paymentTerms === 'C' ? 'CASH' : cust.paymentTerms === 'H' ? 'CHEQUE' : 'CREDIT');
    if (cust.salesmanId) setSalesmanId(cust.salesmanId);

    // DL Expiry Validation
    if (cust.dlExpiryDate) {
      const days = calculateDateDiffInDays(cust.dlExpiryDate, systemDate);
      if (days < 0) {
        setDlWarning({
          message: `This party Drug License expired on ${cust.dlExpiryDate} (${Math.abs(days)} days ago)! Billing blocked under regulatory law.`,
          isBlocking: true,
        });
      } else if (days <= 30) {
        setDlWarning({
          message: `Drug License expires on ${cust.dlExpiryDate} (in ${days} days)!`,
          isBlocking: false,
        });
      } else {
        setDlWarning(null);
      }
    } else {
      setDlWarning(null);
    }

    // Reset credit bypass
    setCreditBypassed(false);
  };

  // Keyboard navigation on Customer input ('+' triggers F21 modal)
  const handleCustomerKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === '+') {
      e.preventDefault();
      setShowInlinePartyModal(true);
    }
  };

  // Select Product and allocate default FEFO batch
  const handleSelectProduct = async (prod: any, chosenBatch?: any) => {
    try {
      let batch = chosenBatch;
      if (!batch) {
        const batches = await getBatchesForProduct(prod.id);
        const inStock = batches.filter((b) => b.stockQty > 0);
        batch = inStock[0] || batches[0];
      }

      if (!batch) {
        setErrorMessage(`Product ${prod.name} has no batches available.`);
        return;
      }

      const slab = taxSlabsList.find((t) => t.code === prod.taxCode);
      const taxPct = slab ? (isInterstate ? slab.igstRate : slab.cgstRate + slab.sgstRate) : 12;

      const defaultQty = 1;
      const freeUnits = calculateSchemeFreeQty(
        defaultQty,
        batch.schemeThreshold || 0,
        batch.schemeFreeQty || 0,
        false
      );

      const newLine: LineItemState = {
        id: crypto.randomUUID(),
        productId: prod.id,
        productCode: prod.code,
        productName: prod.name,
        packaging: prod.packaging,
        hsnCode: prod.hsnCode,
        batchId: batch.id,
        batchNo: batch.batchNo,
        expiryDate: batch.expiryDate,
        quantity: defaultQty,
        freeQuantity: freeUnits,
        sellingRate: batch.sellingRate,
        purchaseRate: batch.purchaseRate,
        mrp: batch.mrp,
        tradeDiscountPct: customerDiscountPct || 0,
        taxCode: prod.taxCode,
        taxPct,
        schemeThreshold: batch.schemeThreshold || 0,
        schemeFreeQty: batch.schemeFreeQty || 0,
        stockAvailable: batch.stockQty,
        isReplacement: false,
      };

      setLineItems((prev) => {
        const next = [...prev];
        if (activeRowIdx < next.length) {
          next[activeRowIdx] = newLine;
        } else {
          next.push(newLine);
        }
        return next;
      });

      setShowProductSearchModal(false);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error selecting product');
    }
  };

  // Open Batch Picker Modal (F3)
  const handleOpenBatchPicker = async (rowIdx: number) => {
    const item = lineItems[rowIdx];
    if (!item) return;

    try {
      const batches = await getBatchesForProduct(item.productId);
      setBatchPickerBatches(batches);
      setBatchPickerProductName(item.productName);
      setActiveRowIdx(rowIdx);
      setShowBatchPickerModal(true);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error loading batches');
    }
  };

  // Apply batch selection from modal
  const handleApplyBatchSelection = (b: BatchItem) => {
    setLineItems((prev) => {
      const next = [...prev];
      const item = next[activeRowIdx];
      if (item) {
        const freeUnits = calculateSchemeFreeQty(
          item.quantity,
          b.schemeThreshold || 0,
          b.schemeFreeQty || 0,
          item.isReplacement
        );
        next[activeRowIdx] = {
          ...item,
          batchId: b.id,
          batchNo: b.batchNo,
          expiryDate: b.expiryDate,
          sellingRate: b.sellingRate,
          purchaseRate: b.purchaseRate,
          mrp: b.mrp,
          stockAvailable: b.stockQty,
          schemeThreshold: b.schemeThreshold || 0,
          schemeFreeQty: b.schemeFreeQty || 0,
          freeQuantity: freeUnits,
        };
      }
      return next;
    });
    setShowBatchPickerModal(false);
  };

  // Update line item quantity and check scheme/multi-batch rules
  const handleUpdateLineQuantity = async (rowIdx: number, newQty: number) => {
    if (newQty <= 0) return;

    const item = lineItems[rowIdx];
    if (!item) return;

    const freeUnits = calculateSchemeFreeQty(
      newQty,
      item.schemeThreshold,
      item.schemeFreeQty,
      item.isReplacement
    );
    const totalRequired = newQty + freeUnits;

    // Check if multi-batch splitting is needed
    if (totalRequired > item.stockAvailable) {
      const batches = await getBatchesForProduct(item.productId);
      const eligibleBatches = batches.filter((b) => b.stockQty > 0 && b.id !== item.batchId);

      if (eligibleBatches.length > 0) {
        const nextBatch = eligibleBatches[0];
        setSplitPrompt({
          productName: item.productName,
          batchNo: item.batchNo,
          available: item.stockAvailable,
          needed: totalRequired,
          onAccept: () => {
            // Split into 2 rows: Primary batch exhausts stock, remainder goes to next batch
            const primaryQty = item.stockAvailable;
            const remainderQty = totalRequired - primaryQty;

            setLineItems((prev) => {
              const next = [...prev];
              // Update row 1
              next[rowIdx] = {
                ...item,
                quantity: primaryQty,
                freeQuantity: 0,
              };
              // Insert row 2 with next batch
              const row2: LineItemState = {
                ...item,
                id: crypto.randomUUID(),
                batchId: nextBatch.id,
                batchNo: nextBatch.batchNo,
                expiryDate: nextBatch.expiryDate,
                sellingRate: nextBatch.sellingRate,
                purchaseRate: nextBatch.purchaseRate,
                mrp: nextBatch.mrp,
                stockAvailable: nextBatch.stockQty,
                quantity: remainderQty,
                freeQuantity: 0,
              };
              next.splice(rowIdx + 1, 0, row2);
              return next;
            });
            setSplitPrompt(null);
          },
        });
        return;
      }
    }

    setLineItems((prev) => {
      const next = [...prev];
      next[rowIdx] = {
        ...item,
        quantity: newQty,
        freeQuantity: freeUnits,
      };
      return next;
    });
  };

  // Update line selling rate and check price bounds
  const handleUpdateLineRate = (rowIdx: number, newRate: number) => {
    const item = lineItems[rowIdx];
    if (!item) return;

    if (newRate > item.mrp) {
      setErrorMessage(`DPCO Violation: Selling Rate cannot exceed MRP (Rs. ${item.mrp.toFixed(2)})!`);
      return;
    }

    if (newRate < item.purchaseRate && newRate > 0) {
      setNegativeMarginAlert({
        message: `Selling Rate (Rs. ${newRate.toFixed(2)}) is less than Purchase Rate (Rs. ${item.purchaseRate.toFixed(2)})!`,
        rowIdx,
      });
    }

    setLineItems((prev) => {
      const next = [...prev];
      next[rowIdx] = {
        ...item,
        sellingRate: newRate,
      };
      return next;
    });
  };

  // Delete line item
  const handleDeleteRow = (rowIdx: number) => {
    setLineItems((prev) => prev.filter((_, i) => i !== rowIdx));
  };

  // Live Totals Calculations
  let subtotalGross = 0;
  let totalLineDisc = 0;
  let totalTaxable = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;

  for (const item of lineItems) {
    const gross = roundToPaise(item.quantity * item.sellingRate);
    const disc = roundToPaise((gross * item.tradeDiscountPct) / 100);
    const taxable = roundToPaise(gross - disc);

    let cgst = 0, sgst = 0, igst = 0;
    if (!selectedCustomer?.isTaxExempt && item.taxCode !== '01' && item.taxPct > 0) {
      if (isInterstate) {
        igst = roundToPaise((taxable * item.taxPct) / 100);
      } else {
        cgst = roundToPaise((taxable * (item.taxPct / 2)) / 100);
        sgst = roundToPaise((taxable * (item.taxPct / 2)) / 100);
      }
    }

    subtotalGross += gross;
    totalLineDisc += disc;
    totalTaxable += taxable;
    totalCgst += cgst;
    totalSgst += sgst;
    totalIgst += igst;
  }

  const cashDiscAmt = roundToPaise((totalTaxable * cashDiscountPct) / 100);
  const netTaxable = roundToPaise(totalTaxable - cashDiscAmt);
  const totalTax = roundToPaise(totalCgst + totalSgst + totalIgst);
  const tcsPct = selectedCustomer?.isTcsApplicable ? 0.075 : 0;
  const tcsAmt = roundToPaise(((netTaxable + totalTax) * tcsPct) / 100);
  const unroundedTotal = netTaxable + totalTax + tcsAmt;
  const grandTotal = Math.round(unroundedTotal);
  const roundOff = roundToPaise(grandTotal - unroundedTotal);

  // Submit Invoice to Server Action
  const handleFinalizeInvoice = async () => {
    setErrorMessage(null);

    if (lineItems.length === 0) {
      setErrorMessage('Cannot save empty invoice. Add at least 1 item.');
      return;
    }
    if (!selectedCustomerId) {
      setErrorMessage('Customer is mandatory.');
      return;
    }
    if (dlWarning?.isBlocking) {
      setErrorMessage('Cannot invoice: Party Drug License has expired!');
      return;
    }

    // Check credit exposure if credit transaction
    if (paymentTerms === 'CREDIT' && selectedCustomer) {
      const exposure = (selectedCustomer.closingBalance || 0) + grandTotal;
      if (selectedCustomer.creditLimit > 0 && exposure > selectedCustomer.creditLimit && !creditBypassed) {
        setCreditWarning({
          message: `Credit limit exceeded! Limit: Rs. ${selectedCustomer.creditLimit.toFixed(2)}, Current Balance: Rs. ${(selectedCustomer.closingBalance || 0).toFixed(2)}, Invoice: Rs. ${grandTotal.toFixed(2)}. Total Exposure: Rs. ${exposure.toFixed(2)}. Bypass and proceed?`,
          canBypass: true,
        });
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const res = await createSalesInvoice({
        customerId: selectedCustomerId,
        salesmanId: salesmanId || null,
        doctorId: doctorId || null,
        invoiceDate: systemDate,
        paymentTerms,
        isInterstate,
        preparedBy: operator || 'ADMIN',
        cashDiscountPct,
        creditLimitBypassed: creditBypassed,
        items: lineItems.map((item) => ({
          productId: item.productId,
          batchId: item.batchId,
          productName: item.productName,
          packaging: item.packaging,
          hsnCode: item.hsnCode,
          batchNo: item.batchNo,
          expiryDate: item.expiryDate,
          quantity: item.quantity,
          freeQuantity: item.freeQuantity,
          sellingRate: item.sellingRate,
          purchaseRate: item.purchaseRate,
          mrp: item.mrp,
          tradeDiscountPct: item.tradeDiscountPct,
          taxCode: item.taxCode,
          taxPct: item.taxPct,
          schemeThreshold: item.schemeThreshold,
          schemeFreeQty: item.schemeFreeQty,
          isReplacement: item.isReplacement,
        })),
      });

      if (res.success && res.invoiceNo) {
        const printObj: PrintInvoiceData = {
          invoiceNo: res.invoiceNo,
          invoiceDate: systemDate,
          invoiceTime: new Date().toTimeString().slice(0, 8),
          paymentTerms,
          isInterstate,
          company: {
            companyName: 'SIVA PHARMACEUTICAL DISTRIBUTORS',
            tradeName: 'WHOLESALE SOFTWARE',
            addressLine1: 'WHOLESALE ADDRESS, PLACE.',
            phone: '044-28282828',
            gstin: '33AAAAA0000A1Z5',
            dlNo20b: 'TN/CHE/20B/12345',
            dlNo21b: 'TN/CHE/21B/12346',
            stateName: 'Tamil Nadu',
            stateCode: '33',
            bankDetailsLine1: 'BANK: STATE BANK OF INDIA, A/C: 12345678901',
            bankDetailsLine2: 'IFSC: SBIN0000123, BRANCH: MAIN BRANCH',
          },
          customer: {
            code: selectedCustomer?.code || 'WALKIN',
            name: selectedCustomer?.name || 'CASH CUSTOMER',
            address: selectedCustomer?.addressLine1 || 'LOCAL',
            gstin: selectedCustomer?.gstin || '',
            dlNo20b: selectedCustomer?.dlNo20b || '',
            dlNo21b: selectedCustomer?.dlNo21b || '',
            closingBalance: selectedCustomer?.closingBalance || 0,
          },
          items: lineItems.map((item, idx) => ({
            slNo: idx + 1,
            productName: item.productName,
            packaging: item.packaging,
            hsnCode: item.hsnCode,
            batchNo: item.batchNo,
            expiryDate: item.expiryDate,
            mrp: item.mrp,
            quantity: item.quantity,
            freeQuantity: item.freeQuantity,
            rate: item.sellingRate,
            discountPct: item.tradeDiscountPct,
            discountAmount: (item.sellingRate * item.quantity * item.tradeDiscountPct) / 100,
            taxableAmount: item.sellingRate * item.quantity * (1 - item.tradeDiscountPct / 100),
            taxPct: item.taxPct,
            netAmount: (item.sellingRate * item.quantity * (1 - item.tradeDiscountPct / 100)) * (1 + item.taxPct / 100),
          })),
          subtotalGross,
          totalLineDiscount: totalLineDisc,
          cashDiscountAmount: cashDiscAmt,
          taxableAmount: netTaxable,
          cgstAmount: totalCgst,
          sgstAmount: totalSgst,
          igstAmount: totalIgst,
          totalTaxAmount: totalTax,
          roundOff: res.roundOff || roundOff,
          netAmount: res.grandTotal || grandTotal,
          totalQuantity: lineItems.reduce((acc, it) => acc + it.quantity, 0),
          totalItemsCount: lineItems.length,
          preparedBy: operator || 'ADMIN',
        };
        setLastSavedPrintData(printObj);

        setInvoiceResult({
          invoiceNo: res.invoiceNo,
          grandTotal: res.grandTotal || grandTotal,
          roundOff: res.roundOff || roundOff,
        });
        // Clear items
        setLineItems([]);
        setActiveRowIdx(0);
      } else {
        setErrorMessage(res.error || 'Failed to save invoice');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error finalizing invoice');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Keyboard actions for DosWindow
  const actions: DosAction[] = [
    {
      keyLabel: 'F2',
      label: 'Search Item',
      onClick: () => setShowProductSearchModal(true),
    },
    {
      keyLabel: 'F3',
      label: 'Change Batch',
      onClick: () => handleOpenBatchPicker(activeRowIdx),
      disabled: lineItems.length === 0,
    },
    {
      keyLabel: 'F5',
      label: 'Save Invoice',
      variant: 'primary',
      onClick: handleFinalizeInvoice,
      disabled: isSubmitting || lineItems.length === 0,
    },
    {
      keyLabel: '+',
      label: 'New Party',
      variant: 'amber',
      onClick: () => setShowInlinePartyModal(true),
    },
    {
      keyLabel: 'F12',
      label: 'Clear Bill',
      variant: 'danger',
      onClick: () => setShowClearConfirmModal(true),
    },
  ];

  return (
    <div className="flex flex-col h-full bg-brand-paper">
      {/* 1. Operator Login Modal */}
      {showLoginModal && (
        <OperatorLoginModal
          isOpen={showLoginModal}
          systemDate={systemDate}
          onLogin={(op) => {
            setOperator(op);
            setShowLoginModal(false);
          }}
        />
      )}

      {/* 2. Main Window */}
      <DosWindow
        title="SALES POS INVOICE ENTRY SCREEN (AINVPRE.PRG)"
        subtitle={`OPERATOR: ${operator || 'GUEST'} | TERM: ${paymentTerms}`}
        breadcrumbs={['BILLING', 'SALES POS', 'NEW INVOICE']}
        actions={actions}
        statusInfo={
          <span className="text-brand-amber font-bold">
            ITEMS: {lineItems.length} | TOTAL: ₹ {grandTotal.toFixed(2)}
          </span>
        }
      >
        <div className="flex flex-col h-full p-2 gap-2 font-mono text-xs">
          {/* Error Banner */}
          {errorMessage && (
            <div className="bg-red-600 text-white font-bold px-3 py-1.5 border border-black flex justify-between items-center shadow-[2px_2px_0px_0px_#000]">
              <span>[VALIDATION ERROR] {errorMessage}</span>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="bg-black/30 px-2 py-0.5 hover:bg-black/50"
              >
                [DISMISS]
              </button>
            </div>
          )}

          {/* Header Controls Banner */}
          <div className="bg-brand-surface border border-brand-border p-2 grid grid-cols-12 gap-2 items-center">
            {/* Row 1: Invoice Date & Customer */}
            <div className="col-span-2 flex items-center gap-1">
              <label className="font-bold text-brand-ink">Date:</label>
              <input
                type="date"
                value={systemDate}
                onChange={(e) => setSystemDate(e.target.value)}
                className="w-full bg-white border border-brand-border px-1.5 py-0.5"
              />
            </div>

            <div className="col-span-6 flex items-center gap-1">
              <label className="font-bold text-brand-ink whitespace-nowrap">
                Customer Name:
              </label>
              <select
                value={selectedCustomerId}
                onChange={(e) => {
                  const cust = customersList.find((c) => c.id === e.target.value);
                  if (cust) handleSelectCustomer(cust);
                }}
                onKeyDown={handleCustomerKeyDown}
                className="w-full bg-[#00AAAA] text-black font-bold px-1.5 py-0.5 border border-black focus:outline-none"
              >
                {customersList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} - {c.name} {c.closingBalance ? `(Bal: ₹${c.closingBalance})` : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowInlinePartyModal(true)}
                title="Add new customer (+)"
                className="bg-brand-amber text-white font-bold px-2 py-0.5 border border-black hover:bg-brand-amber/80"
              >
                +
              </button>
            </div>

            <div className="col-span-2 flex items-center gap-1">
              <label className="font-bold text-brand-ink">Term:</label>
              <select
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value as any)}
                className="w-full bg-white border border-brand-border px-1 py-0.5 font-bold"
              >
                <option value="CREDIT">R (Credit)</option>
                <option value="CASH">C (Cash)</option>
                <option value="CHEQUE">H (Cheque)</option>
              </select>
            </div>

            <div className="col-span-2 flex items-center gap-1">
              <label className="font-bold text-brand-ink">GST:</label>
              <select
                value={isInterstate ? 'O' : 'L'}
                onChange={(e) => setIsInterstate(e.target.value === 'O')}
                className="w-full bg-white border border-brand-border px-1 py-0.5"
              >
                <option value="L">Local (CGST+SGST)</option>
                <option value="O">Outstation (IGST)</option>
              </select>
            </div>

            {/* Row 2: Salesman, Doctor, Customer Discount */}
            <div className="col-span-4 flex items-center gap-1">
              <label className="font-bold text-brand-ink">Salesman:</label>
              <select
                value={salesmanId}
                onChange={(e) => setSalesmanId(e.target.value)}
                className="w-full bg-white border border-brand-border px-1 py-0.5"
              >
                <option value="">-- Assigned Salesman --</option>
                {salesmenList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} - {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-4 flex items-center gap-1">
              <label className="font-bold text-brand-ink">Doctor:</label>
              <select
                value={doctorId}
                onChange={(e) => setDoctorId(e.target.value)}
                className="w-full bg-white border border-brand-border px-1 py-0.5"
              >
                <option value="">-- Referring Doctor --</option>
                {doctorsList.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-2 flex items-center gap-1">
              <label className="font-bold text-brand-ink">Disc%:</label>
              <input
                type="number"
                step="0.01"
                value={customerDiscountPct}
                onChange={(e) => setCustomerDiscountPct(Number(e.target.value))}
                className="w-full bg-white border border-brand-border px-1 py-0.5 text-right font-bold"
              />
            </div>

            <div className="col-span-2 flex items-center gap-1">
              <label className="font-bold text-brand-ink">Cash Disc%:</label>
              <input
                type="number"
                step="0.01"
                value={cashDiscountPct}
                onChange={(e) => setCashDiscountPct(Number(e.target.value))}
                className="w-full bg-white border border-brand-border px-1 py-0.5 text-right"
              />
            </div>
          </div>

          {/* Regulatory Badges */}
          {dlWarning && (
            <div
              className={`p-1.5 border font-bold flex justify-between items-center ${
                dlWarning.isBlocking
                  ? 'bg-red-600 text-white border-black'
                  : 'bg-amber-100 text-amber-900 border-amber-400'
              }`}
            >
              <span>{dlWarning.isBlocking ? '[DRUG LICENSE EXPIRED]' : '[DL EXPIRY WARNING]'} {dlWarning.message}</span>
              {!dlWarning.isBlocking && (
                <button
                  type="button"
                  onClick={() => setDlWarning(null)}
                  className="text-xs underline cursor-pointer"
                >
                  Dismiss
                </button>
              )}
            </div>
          )}

          {/* 3. Line Items Grid (INVPRE.PRG 8 Columns) */}
          <div className="flex-1 border border-brand-border overflow-auto bg-white min-h-48">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-brand-ink text-white z-10">
                <tr>
                  <th className="w-8 px-1 py-1 text-center">#</th>
                  <th className="w-20 px-2 py-1 text-left">CODE</th>
                  <th className="px-2 py-1 text-left">PRODUCT NAME</th>
                  <th className="w-24 px-2 py-1 text-left">PACKING</th>
                  <th className="w-16 px-2 py-1 text-right">QTY</th>
                  <th className="w-14 px-2 py-1 text-right">FREE</th>
                  <th className="w-24 px-2 py-1 text-center">BATCH</th>
                  <th className="w-20 px-2 py-1 text-center">EXPY</th>
                  <th className="w-20 px-2 py-1 text-right">RATE</th>
                  <th className="w-24 px-2 py-1 text-right">VALUE</th>
                  <th className="w-8 px-1 py-1 text-center">DEL</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="text-center py-12 text-gray-500 font-bold">
                      <div className="flex flex-col items-center gap-2">
                        <span>--- NO LINE ITEMS ENTERED ---</span>
                        <button
                          type="button"
                          onClick={() => setShowProductSearchModal(true)}
                          className="bg-brand-ink text-white px-3 py-1 font-bold border border-black hover:bg-brand-amber cursor-pointer"
                        >
                          [F2: Press to Search & Add Products]
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  lineItems.map((item, idx) => {
                    const lineGross = roundToPaise(item.quantity * item.sellingRate);
                    const isActive = idx === activeRowIdx;

                    return (
                      <tr
                        key={item.id}
                        onClick={() => setActiveRowIdx(idx)}
                        className={`border-b border-gray-200 cursor-text ${
                          isActive ? 'bg-cyan-50' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                        }`}
                      >
                        <td className="px-1 py-1 text-center text-gray-500">{idx + 1}</td>
                        <td className="px-2 py-1 font-bold">{item.productCode}</td>
                        <td className="px-2 py-1 font-bold">{item.productName}</td>
                        <td className="px-2 py-1 text-gray-600">{item.packaging}</td>
                        <td className="px-1 py-0.5 text-right">
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) =>
                              handleUpdateLineQuantity(idx, Math.max(1, parseInt(e.target.value) || 1))
                            }
                            className="w-14 text-right font-bold bg-white border border-brand-border px-1 py-0.5"
                          />
                        </td>
                        <td className="px-2 py-1 text-right text-green-700 font-bold">
                          {item.freeQuantity}
                        </td>
                        <td className="px-1 py-0.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleOpenBatchPicker(idx)}
                            title="Click or F3 to change batch"
                            className="w-full bg-brand-surface hover:bg-brand-amber hover:text-white px-1 py-0.5 border border-brand-border font-bold text-xs truncate"
                          >
                            {item.batchNo}
                          </button>
                        </td>
                        <td className="px-2 py-1 text-center text-gray-600">{item.expiryDate}</td>
                        <td className="px-1 py-0.5 text-right">
                          <input
                            type="number"
                            step="0.01"
                            value={item.sellingRate}
                            onChange={(e) =>
                              handleUpdateLineRate(idx, parseFloat(e.target.value) || 0)
                            }
                            className="w-18 text-right font-bold bg-white border border-brand-border px-1 py-0.5"
                          />
                        </td>
                        <td className="px-2 py-1 text-right font-bold">
                          {lineGross.toFixed(2)}
                        </td>
                        <td className="px-1 py-1 text-center">
                          <button
                            type="button"
                            onClick={() => handleDeleteRow(idx)}
                            className="text-red-600 font-bold hover:bg-red-100 px-1"
                            title="Delete item"
                          >
                            X
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Quick Item Addition Button */}
          {lineItems.length > 0 && (
            <div className="flex justify-between items-center px-1">
              <button
                type="button"
                onClick={() => {
                  setActiveRowIdx(lineItems.length);
                  setShowProductSearchModal(true);
                }}
                className="bg-brand-surface border border-brand-border px-2 py-1 font-bold text-brand-ink hover:bg-gray-200"
              >
                [+ Add Another Product (F2)]
              </button>
              <span className="text-gray-500 text-[11px]">
                Tip: Press [F3] on row to select another batch | Press [+] in Customer to register party
              </span>
            </div>
          )}

          {/* 4. Live Invoice Summary Footer */}
          <div className="bg-brand-surface border border-brand-border p-2 grid grid-cols-12 gap-3 items-end">
            <div className="col-span-6 flex flex-col gap-1 text-[11px] text-gray-600">
              <div className="flex gap-4">
                <span>Gross Turnover: ₹ {subtotalGross.toFixed(2)}</span>
                <span>Line Disc: ₹ {totalLineDisc.toFixed(2)}</span>
                <span>Net Taxable: ₹ {netTaxable.toFixed(2)}</span>
              </div>
              <div className="flex gap-4">
                <span>CGST: ₹ {totalCgst.toFixed(2)}</span>
                <span>SGST: ₹ {totalSgst.toFixed(2)}</span>
                <span>IGST: ₹ {totalIgst.toFixed(2)}</span>
                {tcsAmt > 0 && <span>TCS: ₹ {tcsAmt.toFixed(2)}</span>}
              </div>
              <div className="text-gray-500 font-mono">
                Round-Off: {roundOff >= 0 ? `+${roundOff.toFixed(2)}` : roundOff.toFixed(2)}
              </div>
            </div>

            <div className="col-span-6 flex justify-end items-center gap-4">
              <div className="text-right">
                <span className="text-xs text-gray-500 block uppercase">Net Amount Payable</span>
                <span className="text-2xl font-bold text-brand-amber">
                  ₹ {grandTotal.toFixed(2)}
                </span>
              </div>

              <button
                type="button"
                onClick={handleFinalizeInvoice}
                disabled={isSubmitting || lineItems.length === 0}
                className="bg-brand-ink text-white font-bold px-6 py-2 border-2 border-black hover:bg-brand-amber cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? 'SAVING...' : '[F5: SAVE INVOICE]'}
              </button>
            </div>
          </div>
        </div>
      </DosWindow>

      {/* 5. Product Search Modal */}
      {showProductSearchModal && (
        <ProductSearchModal
          isOpen={showProductSearchModal}
          onClose={() => setShowProductSearchModal(false)}
          onSelectProduct={handleSelectProduct}
        />
      )}

      {/* 6. Inline Party Addition Modal (Feature F21) */}
      {showInlinePartyModal && (
        <InlinePartyModal
          isOpen={showInlinePartyModal}
          onClose={() => setShowInlinePartyModal(false)}
          onPartyCreated={(newCust) => {
            setCustomersList((prev) => [newCust, ...prev]);
            handleSelectCustomer(newCust);
          }}
          areas={areasList}
          salesmen={salesmenList}
        />
      )}

      {/* 7. Batch Picker Modal (F3) */}
      {showBatchPickerModal && (
        <BatchPickerModal
          isOpen={showBatchPickerModal}
          onClose={() => setShowBatchPickerModal(false)}
          productName={batchPickerProductName}
          batches={batchPickerBatches}
          currentBatchId={lineItems[activeRowIdx]?.batchId}
          onSelectBatch={handleApplyBatchSelection}
        />
      )}

      {/* 8. Multi-Batch Splitting Prompt Modal */}
      {splitPrompt && (
        <DosModal
          isOpen={true}
          onClose={() => setSplitPrompt(null)}
          title="INSUFFICIENT BATCH STOCK — AUTO SPLIT?"
          width="max-w-md"
          variant="amber"
          confirmText="[Enter: Split Batches]"
          cancelText="[ESC: Cancel]"
          onConfirm={splitPrompt.onAccept}
        >
          <div className="flex flex-col gap-2 font-mono text-xs">
            <p className="font-bold text-brand-ink">
              Batch <span className="underline">{splitPrompt.batchNo}</span> of {splitPrompt.productName} has only {splitPrompt.available} units available.
            </p>
            <p>
              Requested total is {splitPrompt.needed} units. Would you like to fulfill {splitPrompt.available} units from this batch and automatically split the remaining {splitPrompt.needed - splitPrompt.available} units to the next FEFO batch?
            </p>
          </div>
        </DosModal>
      )}

      {/* 9. Credit Limit Bypass Modal */}
      {creditWarning && (
        <DosModal
          isOpen={true}
          onClose={() => setCreditWarning(null)}
          title="CUSTOMER CREDIT LIMIT EXCEEDED"
          width="max-w-md"
          variant="danger"
          confirmText="[Enter: Bypass & Proceed]"
          cancelText="[ESC: Cancel]"
          onConfirm={() => {
            setCreditBypassed(true);
            setCreditWarning(null);
            setTimeout(() => handleFinalizeInvoice(), 50);
          }}
        >
          <div className="flex flex-col gap-2 font-mono text-xs">
            <p className="text-red-700 font-bold">{creditWarning.message}</p>
            <p className="text-gray-600">
              Under credit management rules, supervisor override is required to bypass party credit limit.
            </p>
          </div>
        </DosModal>
      )}

      {/* 10. Negative Margin Warning Modal */}
      {negativeMarginAlert && (
        <DosModal
          isOpen={true}
          onClose={() => setNegativeMarginAlert(null)}
          title="NEGATIVE MARGIN ALERT"
          width="max-w-md"
          variant="amber"
          confirmText="[Enter: Accept Rate]"
          cancelText="[ESC: Revert]"
          onConfirm={() => setNegativeMarginAlert(null)}
        >
          <div className="flex flex-col gap-2 font-mono text-xs">
            <p className="font-bold text-amber-900">{negativeMarginAlert.message}</p>
            <p className="text-gray-600">
              Selling price is below purchase cost. Confirm this promotional concession or adjust the rate.
            </p>
          </div>
        </DosModal>
      )}

      {/* 11. Invoice Saved Success Modal */}
      {invoiceResult && (
        <DosModal
          isOpen={true}
          onClose={() => setInvoiceResult(null)}
          title="INVOICE GENERATED SUCCESSFULLY"
          width="max-w-md"
          confirmText="[Enter: Prepare Next Bill]"
          cancelText="[ESC: Close]"
          actions={[
            {
              keyLabel: 'F8',
              label: 'Print Bill',
              onClick: () => setShowPrintModal(true),
            },
          ]}
          onConfirm={() => setInvoiceResult(null)}
        >
          <div className="flex flex-col gap-3 font-mono text-xs text-center py-2">
            <div className="bg-green-100 text-green-900 p-2 border border-green-400 font-bold">
              INVOICE SAVED & STOCKS COMMITTED
            </div>
            <div className="text-lg font-bold text-brand-ink">
              INVOICE NO: {invoiceResult.invoiceNo}
            </div>
            <div className="text-xl font-bold text-brand-amber">
              NET AMOUNT: ₹ {invoiceResult.grandTotal.toFixed(2)}
            </div>
            <div className="text-gray-500 text-[11px]">
              Inventory decremented across batches & customer ledger balance updated.
            </div>
            <button
              type="button"
              onClick={() => setShowPrintModal(true)}
              className="mt-2 py-1.5 px-3 bg-brand-ink text-white font-bold hover:bg-brand-ink/90 flex items-center justify-center gap-2 cursor-pointer shadow-[2px_2px_0px_0px_#F05A28]"
            >
              <span className="bg-brand-amber text-black px-1">F8</span>
              <span>OPEN PRINT PREVIEW / ESC/POS FORMATTER</span>
            </button>
          </div>
        </DosModal>
      )}

      {/* Print Preview Modal */}
      {lastSavedPrintData && (
        <PrintPreviewModal
          isOpen={showPrintModal}
          onClose={() => setShowPrintModal(false)}
          invoiceData={lastSavedPrintData}
        />
      )}

      {/* 12. Clear Bill Confirmation Modal */}
      {showClearConfirmModal && (
        <DosModal
          isOpen={true}
          onClose={() => setShowClearConfirmModal(false)}
          title="CONFIRM: CLEAR INVOICE DRAFT"
          width="max-w-md"
          variant="danger"
          confirmText="[Enter: Discard Draft]"
          cancelText="[ESC: Cancel]"
          onConfirm={() => {
            setLineItems([]);
            setActiveRowIdx(0);
            setShowClearConfirmModal(false);
          }}
        >
          <div className="flex flex-col gap-2 font-mono text-xs">
            <p className="font-bold text-red-700">DISCARD CURRENT INVOICE DRAFT?</p>
            <p className="text-gray-600">
              All entered line items, scanned batches, and discounts will be cleared. This action cannot be undone.
            </p>
          </div>
        </DosModal>
      )}
    </div>
  );
}
