import jsPDF from 'jspdf';
import path from 'path';
import fs from 'fs';

// Company constants (branded info)
const COMPANY_INFO = {
  name: 'NAGOLIE ENTERPRISES',
  tagline: 'Investing in Living Assets',
  address: 'Target - Isinya, Kajiado County, Kenya',
  phone1: '+254 721 451 707',
  phone2: '+254 763 003 182',
  email: 'nagolieenterprises@gmail.com',
  hours: 'Everyday: 8:00 AM - 6:00 PM',
  poBox: 'P.O BOX 359-01100',
  logoUrl: '/logo.png',
};

// Colors from your :root (converted to RGB for jsPDF)
const COLORS = {
  primaryBlue: [30, 64, 175], // #1e40af
  secondaryBlue: [59, 130, 246], // #3b82f6
  textDark: [31, 41, 55], // #1f2937
  textLight: [107, 114, 128], // #6b7280
  white: [255, 255, 255],
  border: [229, 231, 235], // #e5e7eb
  green: [17, 140, 79], // #30B54A for M-Pesa
  watermark: [220, 220, 220, 0.1] // Light gray for watermark with transparency
};

// ========== OPTIMIZED WATERMARK FUNCTION ==========
export const addOptimizedWatermark = (doc, type = 'agreement') => {
  const totalPages = doc.getNumberOfPages();
  const DOC_LABELS = {
    receipt: 'RECEIPT',
    statement: 'STATEMENT',
    agreement: 'AGREEMENT',
    investor: 'INVESTMENT AGREEMENT',
    letter: 'LETTER',
    leaveForm: 'LEAVE REQUEST',
    document: 'DOCUMENT',
    deliveryNote: 'DELIVERY NOTE',
    invoice: 'INVOICE'
  };
  const docType = DOC_LABELS[type] || 'DOCUMENT';
  
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    
    const savedState = {
      textColor: doc.getTextColor(),
      drawColor: doc.getDrawColor(),
      fillColor: doc.getFillColor(),
      lineWidth: doc.internal.getLineWidth(),
      font: doc.getFont(),
      fontSize: doc.internal.getFontSize()
    };
    
    try {
      doc.setTextColor(238, 241, 245);
      doc.setFont('helvetica', 'bold');
      const angle = 45;
      const watermarks = [
        { x: pageWidth * 0.28, y: pageHeight * 0.38 },
        { x: pageWidth * 0.72, y: pageHeight * 0.68 }
      ];
      
      watermarks.forEach(pos => {
        doc.setFontSize(28);
        doc.text('NAGOLIE ENTERPRISES', pos.x, pos.y, { align: 'center', angle });
        doc.setFontSize(18);
        doc.text(docType, pos.x, pos.y + 20, { align: 'center', angle });
      });
    } finally {
      doc.setTextColor(savedState.textColor);
      doc.setDrawColor(savedState.drawColor);
      doc.setFillColor(savedState.fillColor);
      doc.setLineWidth(savedState.lineWidth);
      if (savedState.font?.fontName) {
        doc.setFont(savedState.font.fontName, savedState.font.fontStyle);
      }
      doc.setFontSize(savedState.fontSize);
    }
  }
};

// ========== NEW: SINGLE PAGE WATERMARK FUNCTION FOR MULTI-PAGE DOCS ==========
/**
 * Adds watermark to ONLY the current page (for multi-page documents)
 * This should be called BEFORE adding content to each new page
 */
const addWatermarkToCurrentPage = (doc, type = 'agreement') => {
  const DOC_LABELS = {
    receipt: 'RECEIPT',
    statement: 'STATEMENT',
    agreement: 'AGREEMENT',
    investor: 'INVESTMENT AGREEMENT'
  };
  const docType = DOC_LABELS[type] || 'DOCUMENT';
  
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  
  const savedState = {
    textColor: doc.getTextColor(),
    drawColor: doc.getDrawColor(),
    fillColor: doc.getFillColor(),
    lineWidth: doc.internal.getLineWidth(),
    font: doc.getFont(),
    fontSize: doc.internal.getFontSize()
  };
  
  try {
    doc.setTextColor(238, 241, 245);
    doc.setFont('helvetica', 'bold');
    const angle = 45;
    const watermarks = [
      { x: pageWidth * 0.28, y: pageHeight * 0.38 },
      { x: pageWidth * 0.72, y: pageHeight * 0.68 }
    ];
    
    watermarks.forEach(pos => {
      doc.setFontSize(28);
      doc.text('NAGOLIE ENTERPRISES', pos.x, pos.y, { align: 'center', angle });
      doc.setFontSize(18);
      doc.text(docType, pos.x, pos.y + 20, { align: 'center', angle });
    });
  } finally {
    doc.setTextColor(savedState.textColor);
    doc.setDrawColor(savedState.drawColor);
    doc.setFillColor(savedState.fillColor);
    doc.setLineWidth(savedState.lineWidth);
    if (savedState.font?.fontName) {
      doc.setFont(savedState.font.fontName, savedState.font.fontStyle);
    }
    doc.setFontSize(savedState.fontSize);
  }
};

// Helper to fetch logo as base64 with proper dimensions
export const getLogoBase64 = async (url) => {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Logo fetch failed');
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Failed to load logo:', error);
    return null;
  }
};

// Common header function for all PDFs
export const addHeader = async (doc, yStart = 15) => {
  const logoBase64 = await getLogoBase64(COMPANY_INFO.logoUrl);
  let yPos = yStart;
  
  // Header with logo and company info side by side
  if (logoBase64) {
    // Add logo with proper dimensions (maintain aspect ratio)
    doc.addImage(logoBase64, 'PNG', 20, yPos, 25, 25);
  }
  
  // Company info aligned to the right of logo
  const infoX = logoBase64 ? 55 : 20;
  doc.setTextColor(...COLORS.primaryBlue);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(COMPANY_INFO.name, infoX, yPos + 8);
  doc.setTextColor(...COLORS.secondaryBlue);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(COMPANY_INFO.tagline, infoX, yPos + 13);
  doc.setTextColor(...COLORS.textDark);
  doc.setFontSize(8);
  doc.text(COMPANY_INFO.address, infoX, yPos + 18);
  doc.text(`${COMPANY_INFO.phone1} | ${COMPANY_INFO.phone2}`, infoX, yPos + 22);
  doc.text(COMPANY_INFO.email, infoX, yPos + 26);
  yPos += 35;
  return yPos;
};

// Common divider function
export const addDivider = (doc, yPos, color = COLORS.primaryBlue) => {
  doc.setLineWidth(0.5);
  doc.setDrawColor(...color);
  doc.line(20, yPos, 190, yPos);
  return yPos + 8;
};

// Helper to calculate current week/day number for a loan
const getLoanPeriod = (disbursementDate, repaymentPlan) => {
  if (!disbursementDate) return 'N/A';
  const start = new Date(disbursementDate);
  const now = new Date();
  const diffDays = Math.floor((now - start) / (1000 * 60 * 60 * 24));
  if (repaymentPlan === 'daily') {
    const dayNum = diffDays + 1;
    return `Day ${dayNum}`;
  } else {
    const weekNum = Math.floor(diffDays / 7) + 1;
    return `Week ${weekNum}`;
  }
};

// ========== PAGE NUMBER FUNCTION FOR AGREEMENTS ==========
export const addPageNumbers = (doc, format = 'page %d') => {
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.setFont('helvetica', 'normal');
    const pageNumText = format.replace('%d', i);
    doc.text(pageNumText, pageWidth / 2, pageHeight - 3, { align: 'center' });
  }
};

// Helper function to write lines with mixed styles without overlapping
const writeStyledLine = (doc, parts, x, y, fontSize = 10) => {
  let currentX = x;
  const originalFontSize = doc.internal.getFontSize();
  const originalFont = doc.getFont();
  
  parts.forEach(part => {
    doc.setFont('helvetica', part.style);
    doc.setFontSize(fontSize);
    const text = part.text;
    doc.text(text, currentX, y);
    currentX += doc.getTextWidth(text);
  });
  
  // Restore original font
  doc.setFont(originalFont.fontName, originalFont.fontStyle);
  doc.setFontSize(originalFontSize);
};

// Helper Functions
const formatTransactionType = (type, paymentType) => {
  if (!type) return 'N/A';
  const typeLower = type.toLowerCase();
  const paymentTypeLower = paymentType ? paymentType.toLowerCase() : '';
  // Handle payment types specifically
  if (typeLower === 'payment') {
    if (paymentTypeLower === 'principal') return 'Principal Payment';
    if (paymentTypeLower === 'interest') return 'Interest Payment';
    return 'Payment';
  }
  const typeMap = {
    'topup': 'Top-up',
    'adjustment': 'Adjustment',
    'payment': 'Payment',
    'disbursement': 'Disbursement',
    'claim': 'Claim'
  };
  return typeMap[typeLower] || type.charAt(0).toUpperCase() + type.slice(1);
};

const formatPaymentMethod = (method, transactionType = '') => {
  if (!method && !transactionType) return 'N/A';
 
  // If transaction type is disbursement, return BANK
  if ((transactionType || '').toLowerCase() === 'disbursement') {
    return 'BANK';
  }
 
  const methodUpper = method ? method.toUpperCase() : '';
  if (methodUpper === 'DISBURSEMENT') return 'BANK';
  return methodUpper || 'N/A';
};

const formatStatus = (status) => {
  if (!status) return 'N/A';
  return status.charAt(0).toUpperCase() + status.slice(1);
};

const getTransactionReference = (transaction) => {
  const method = (transaction.method || '').toUpperCase();
  const paymentType = transaction.payment_type || transaction.paymentType || '';
  const transactionType = (transaction.type || '').toLowerCase();
  // If transaction type is disbursement, return BANK
  if (transactionType === 'disbursement') {
    return 'BANK';
  }
  if (method === 'MPESA' && transaction.mpesa_receipt) {
    // Include payment type in M-Pesa reference
    if (paymentType) {
      const paymentTypeFormatted = paymentType.charAt(0).toUpperCase() + paymentType.slice(1);
      return `${transaction.mpesa_receipt}`;
    }
    return transaction.mpesa_receipt;
  } else if (method === 'CASH') {
    // Include payment type in cash reference
    if (paymentType) {
      const paymentTypeFormatted = paymentType.charAt(0).toUpperCase() + paymentType.slice(1);
      return `CASH`;
    }
    return 'CASH';
  } else if (method === 'DISBURSEMENT') {
    // Handle disbursement as Bank reference
    return 'BANK';
  } else {
    // Include payment type in generic reference
    if (paymentType) {
      const paymentTypeFormatted = paymentType.charAt(0).toUpperCase() + paymentType.slice(1);
      return `${paymentTypeFormatted} Payment - TXN-${transaction.id}`;
    }
    return `TXN-${transaction.id}`;
  }
};

export const addFooter = (doc, yPos) => {
  if (yPos > 270) return;
  const footerY = Math.min(yPos + 20, 270);
  doc.setTextColor(...COLORS.textLight);
  doc.setFontSize(8);
  doc.text(`Generated on: ${new Date().toLocaleDateString('en-GB')} at ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`, 20, footerY);
  doc.setTextColor(...COLORS.textDark);
  doc.setFontSize(9);
  doc.text('Thank you for choosing Nagolie Enterprises!', 105, footerY + 10, { align: 'center' });
};

// Helper function to get first return date (14 days from agreement date)
function getFirstReturnDate(date) {
  const firstReturnDate = new Date(date);
  firstReturnDate.setDate(firstReturnDate.getDate() + 35);
  
  // Adjust to next weekday if it lands on a weekend
  if (firstReturnDate.getDay() === 6) { // Saturday
    firstReturnDate.setDate(firstReturnDate.getDate() + 2);
  } else if (firstReturnDate.getDay() === 0) { // Sunday
    firstReturnDate.setDate(firstReturnDate.getDate() + 1);
  }
  
  return firstReturnDate;
}

// Helper function to get subsequent return dates (7 days from return)
function getNextReturnDate(date) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + 28);
  
  // Adjust to next weekday if it lands on a weekend
  if (nextDate.getDay() === 6) { // Saturday
    nextDate.setDate(nextDate.getDate() + 2);
  } else if (nextDate.getDay() === 0) { // Sunday
    nextDate.setDate(nextDate.getDate() + 1);
  }
  
  return nextDate;
}

// Helper function to get next weekday
function getNextWeekday(date) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + 7);
  
  // If it's a weekend (Saturday = 6, Sunday = 0), move to Monday
  if (nextDate.getDay() === 6) { // Saturday
    nextDate.setDate(nextDate.getDate() + 2);
  } else if (nextDate.getDay() === 0) { // Sunday
    nextDate.setDate(nextDate.getDate() + 1);
  }
  
  return nextDate;
}

const computeRunningBalances = (loan, transactions) => {
  const isWeekly = loan.repayment_plan === 'weekly';
  const originalPrincipal = loan.borrowedAmount || 0;
  const disbursementDate = new Date(loan.borrowedDate || loan.disbursement_date);

  // Use backend’s current state as the baseline (already includes all interest up to now)
  let currentPrincipal = loan.currentPrincipal || originalPrincipal;
  let accruedInterest = Number(loan.unpaidInterest) || Number(loan.accrued_interest) || 0;
  let interestAdded = isWeekly ? Math.max(0, currentPrincipal - originalPrincipal) : accruedInterest;

  // Sort transactions oldest first
  const sortedReal = [...transactions].sort(
    (a, b) => new Date(a.date || a.created_at) - new Date(b.date || b.created_at)
  );

  const result = [];

  // Helper: get period label (week/day)
  const getPeriod = (date) => {
    const daysSince = Math.floor((date - disbursementDate) / (1000 * 60 * 60 * 24));
    if (isWeekly) {
      const week = Math.floor(daysSince / 7) + 1;
      return `Week ${week}`;
    } else {
      return `Day ${daysSince + 1}`;
    }
  };

  // --- Disbursement entry (no interest accrual needed) ---
  result.push({
    date: disbursementDate,
    type: 'disbursement',
    method: 'BANK',
    amount: originalPrincipal,
    principalBalance: originalPrincipal,
    interestBalance: 0,
    totalBalance: originalPrincipal,
    period: getPeriod(disbursementDate),
    payment_type: null,
    reference: 'BANK'
  });

  // --- Process each transaction, updating balances exactly as the backend does ---
  for (const txn of sortedReal) {
    const amount = txn.amount || 0;
    const txnType = txn.type;
    let newPrincipal = currentPrincipal;
    let newInterest = isWeekly ? interestAdded : accruedInterest;

    // Apply transaction EXACTLY as in backend's _apply_payment
    if (txnType === 'payment') {
      if (isWeekly) {
        // Weekly: payment reduces principal directly
        newPrincipal = Math.max(0, currentPrincipal - amount);
        newInterest = Math.max(0, newPrincipal - originalPrincipal);
      } else {
        // Daily: clear interest first, then principal
        if (accruedInterest >= amount) {
          newInterest = accruedInterest - amount;
          newPrincipal = currentPrincipal;
        } else {
          const remainder = amount - accruedInterest;
          newInterest = 0;
          newPrincipal = Math.max(0, currentPrincipal - remainder);
        }
      }
    } else if (txnType === 'topup' || txnType === 'adjustment') {
      newPrincipal = currentPrincipal + amount;
      if (isWeekly) newInterest = newPrincipal - originalPrincipal;
    } else if (txnType === 'renewal') {
      newPrincipal = amount;
      if (isWeekly) newInterest = newPrincipal - originalPrincipal;
      else newInterest = 0;
    } else if (txnType === 'waiver') {
      newPrincipal = Math.max(0, currentPrincipal - amount);
      if (isWeekly) newInterest = newPrincipal - originalPrincipal;
    }
    // other types (claim, etc.) ignored

    // Update running variables
    currentPrincipal = newPrincipal;
    if (isWeekly) interestAdded = newInterest;
    else accruedInterest = newInterest;

    // Store the transaction with balances AFTER the transaction
    result.push({
      date: new Date(txn.date || txn.created_at),
      type: txnType,
      method: txn.method,
      amount: amount,
      principalBalance: currentPrincipal,
      interestBalance: isWeekly ? interestAdded : accruedInterest,
      totalBalance: currentPrincipal + (isWeekly ? 0 : accruedInterest),
      period: getPeriod(new Date(txn.date || txn.created_at)),
      payment_type: txn.payment_type,
      reference: getTransactionReference(txn)
    });
  }

  return {
    transactions: result,
    currentPrincipal: currentPrincipal,
    currentInterest: isWeekly ? interestAdded : accruedInterest,
    totalBalance: currentPrincipal + (isWeekly ? 0 : accruedInterest)
  };
};

export const generateClientStatement = async (client, allTransactions) => {
  try {
    // Filter transactions for this loan
    const clientTransactions = allTransactions.filter(t =>
      t.loan_id === client.loan_id ||
      (client.loan_id && t.loan_id === client.loan_id.toString())
    );

    // Compute running balances using the corrected function
    const balances = computeRunningBalances(client, clientTransactions);
    const transactionsWithBalances = balances.transactions;

    const doc = new jsPDF();
    addOptimizedWatermark(doc, 'statement');
    let yPos = await addHeader(doc);

    // Title
    doc.setTextColor(...COLORS.primaryBlue);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('CLIENT PAYMENT STATEMENT', 105, yPos, { align: 'center' });
    yPos += 8;
    yPos = addDivider(doc, yPos);

    // Client Information
    doc.setTextColor(...COLORS.textDark);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('CLIENT INFORMATION', 20, yPos);
    yPos += 8;

    const clientDetails = [
      { label: 'Full Name:', value: client.name || 'N/A' },
      { label: 'Phone Number:', value: client.phone || 'N/A' },
      { label: 'ID Number:', value: String(client.idNumber || 'N/A') },
      { label: 'Loan ID:', value: String(client.loan_id || 'N/A') }
    ];

    clientDetails.forEach(({ label, value }) => {
      doc.setFont('helvetica', 'bold');
      doc.text(label, 25, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(String(value), 60, yPos);
      yPos += 6;
    });
    yPos += 10;

    // Loan Summary (using computed final balances)
    doc.setFont('helvetica', 'bold');
    doc.text('LOAN SUMMARY', 20, yPos);
    yPos += 8;

    const principalAmount = client.borrowedAmount || 0;
    const repaymentPlan = client.repayment_plan || 'weekly';
    const interestRate = repaymentPlan === 'daily' ? 4.5 : 30;
    const interestAmountKes = principalAmount * (interestRate / 100);
    const expectedTotal = principalAmount + interestAmountKes;
    const amountPaid = client.amountPaid || 0;
    const finalPrincipal = balances.currentPrincipal;
    const finalInterest = balances.currentInterest;

    // ✅ For weekly plans, show total outstanding as principal + current week's interest
    // (matches Client Management UI). For daily, show principal + unpaid accrued interest.
    let totalOutstanding;
    if (repaymentPlan === 'weekly') {
      const currentWeekInterest = finalPrincipal * (interestRate / 100);
      totalOutstanding = finalPrincipal + currentWeekInterest;
    } else {
      totalOutstanding = balances.totalBalance; // already principal + accrued interest
    }

    const loanDetails = [
      { label: 'Principal Amount:', value: `KES ${principalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
      { label: 'Interest Rate:', value: `${interestRate}% per ${repaymentPlan === 'daily' ? 'day' : 'week'} (KES ${interestAmountKes.toLocaleString('en-US', { minimumFractionDigits: 2 })})` },
      { label: 'Expected Total:', value: `KES ${expectedTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
      { label: 'Amount Paid:', value: `KES ${amountPaid.toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
      { label: 'Outstanding Principal:', value: `KES ${finalPrincipal.toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
      { label: 'Outstanding Interest:', value: `KES ${finalInterest.toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
      { label: 'Total Outstanding Balance:', value: `KES ${totalOutstanding.toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
      { label: 'Disbursement Date:', value: client.borrowedDate ? new Date(client.borrowedDate).toLocaleDateString('en-GB') : 'N/A' },
      { label: 'Due Date:', value: client.expectedReturnDate ? new Date(client.expectedReturnDate).toLocaleDateString('en-GB') : 'N/A' }
    ];

    loanDetails.forEach(({ label, value }) => {
      doc.setFont('helvetica', 'bold');
      doc.text(label, 25, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(String(value), 75, yPos);
      yPos += 6;
    });
    yPos += 15;

    // Transaction History table (unchanged, works correctly)
    if (transactionsWithBalances.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.text('TRANSACTION HISTORY', 20, yPos);
      yPos += 10;

      // Your exact column widths
      const colWidths = {
        date: 18, type: 25, method: 16, amount: 23,
        principal: 23, interest: 23, total: 23, period: 20
      };
      const startX = 20;
      const positions = [
        startX,
        startX + colWidths.date,
        startX + colWidths.date + colWidths.type,
        startX + colWidths.date + colWidths.type + colWidths.method,
        startX + colWidths.date + colWidths.type + colWidths.method + colWidths.amount,
        startX + colWidths.date + colWidths.type + colWidths.method + colWidths.amount + colWidths.principal,
        startX + colWidths.date + colWidths.type + colWidths.method + colWidths.amount + colWidths.principal + colWidths.interest,
        startX + colWidths.date + colWidths.type + colWidths.method + colWidths.amount + colWidths.principal + colWidths.interest + colWidths.total
      ];

      doc.setFillColor(...COLORS.primaryBlue);
      doc.setTextColor(...COLORS.white);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.rect(startX, yPos, 170, 8, 'F');

      const headers = ['Date', 'Type', 'Method', 'Amount', 'Principal', 'Interest', 'Total', 'Period'];
      headers.forEach((h, idx) => {
        doc.text(h, positions[idx] + 2, yPos + 5.5);
      });
      yPos += 8;

      doc.setTextColor(...COLORS.textDark);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);

      // Sort by date (oldest first)
      transactionsWithBalances.sort((a, b) => a.date - b.date).forEach((txn, idx) => {
        const rowHeight = 7;
        if (yPos + rowHeight > 270) {
          doc.addPage();
          addWatermarkToCurrentPage(doc, 'statement');
          yPos = 20;
          doc.setFillColor(...COLORS.primaryBlue);
          doc.setTextColor(...COLORS.white);
          doc.setFont('helvetica', 'bold');
          doc.rect(startX, yPos, 170, 8, 'F');
          headers.forEach((h, hidx) => {
            doc.text(h, positions[hidx] + 2, yPos + 5.5);
          });
          yPos += 8;
          doc.setTextColor(...COLORS.textDark);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
        }

        if (idx % 2 === 0) {
          doc.setFillColor(...COLORS.border);
          doc.rect(startX, yPos, 170, rowHeight, 'F');
        }

        const formatMoney = (amt) => `KES ${amt.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        const dateStr = txn.date.toLocaleDateString('en-GB');
        const typeStr = formatTransactionType(txn.type, txn.payment_type);
        const methodStr = formatPaymentMethod(txn.method, txn.type);
        const amountStr = formatMoney(txn.amount);
        const principalStr = formatMoney(txn.principalBalance);
        const interestStr = formatMoney(txn.interestBalance);
        const totalStr = formatMoney(txn.totalBalance);
        const periodStr = txn.period;

        doc.text(dateStr, positions[0] + 2, yPos + 4.5);
        doc.text(typeStr, positions[1] + 2, yPos + 4.5);
        doc.text(methodStr, positions[2] + 2, yPos + 4.5);
        doc.text(amountStr, positions[3] + 2, yPos + 4.5);
        doc.text(principalStr, positions[4] + 2, yPos + 4.5);
        doc.text(interestStr, positions[5] + 2, yPos + 4.5);
        doc.text(totalStr, positions[6] + 2, yPos + 4.5);
        doc.text(periodStr, positions[7] + 2, yPos + 4.5);

        yPos += rowHeight;
      });
    } else {
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(...COLORS.textLight);
      doc.text('No transactions recorded yet.', 25, yPos);
      yPos += 10;
    }

    addFooter(doc, yPos);
    addPageNumbers(doc, 'page %d');

    const fileName = `Statement_${client.name?.replace(/\s+/g, '_') || 'Client'}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
  } catch (error) {
    console.error('Error generating client statement:', error);
    throw error;
  }
};

// Generate Transaction Receipt PDF
export const generateTransactionReceipt = async (transaction) => {
  try {
    const doc = new jsPDF();
    
    // ADD OPTIMIZED WATERMARK FIRST
    addOptimizedWatermark(doc, 'receipt');
    
    let yPos = await addHeader(doc);
  
    // Title: Transaction Receipt
    doc.setTextColor(...COLORS.primaryBlue);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('TRANSACTION RECEIPT', 105, yPos, { align: 'center' });
    yPos += 8;
  
    yPos = addDivider(doc, yPos);
  
    // Transaction Details in a clean layout
    doc.setFontSize(10);
  
    // Get payment_type from transaction - check multiple possible field names
    const paymentType = transaction.payment_type || transaction.paymentType || '';
  
    const details = [
      { label: 'Transaction ID:', value: String(transaction.id || 'N/A') },
      { label: 'Date:', value: transaction.date ? new Date(transaction.date).toLocaleDateString('en-GB') : 'N/A' },
      { label: 'Client Name:', value: transaction.clientName || 'N/A' },
      { label: 'Transaction Type:', value: formatTransactionType(transaction.type, paymentType) },
      { label: 'Amount:', value: `KES ${Number(transaction.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
      { label: 'Payment Method:', value: formatPaymentMethod(transaction.method, transaction.type) },
      { label: 'Status:', value: formatStatus(transaction.status) }
    ];
    
    // Render details with proper spacing
    details.forEach(({ label, value }) => {
      doc.setTextColor(...COLORS.textDark);
      doc.setFont('helvetica', 'bold');
      doc.text(label, 25, yPos);
      doc.setFont('helvetica', 'normal');
     
      // Special coloring for Payment Method
      if (label === 'Payment Method:') {
        const methodLower = (transaction.method || '').toLowerCase();
        const isDisbursement = (transaction.type || '').toLowerCase() === 'disbursement';
        const methodColor = methodLower === 'mpesa' ? COLORS.green : isDisbursement ? COLORS.primaryBlue : COLORS.textDark;
        doc.setTextColor(...methodColor);
      } else {
        doc.setTextColor(...COLORS.textDark);
      }
     
      doc.text(String(value), 70, yPos);
      yPos += 8;
    });
    
    // Add M-Pesa reference if applicable
    if (transaction.method?.toLowerCase() === 'mpesa' && transaction.mpesa_receipt) {
      yPos += 5;
      doc.setTextColor(...COLORS.textDark);
      doc.setFont('helvetica', 'bold');
      doc.text('M-Pesa Receipt No:', 25, yPos);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...COLORS.green);
      doc.text(transaction.mpesa_receipt, 70, yPos);
      yPos += 8;
    }
  
    yPos += 15;
  
    // Footer section
    addFooter(doc, yPos);
  
    // Save PDF
    doc.save(`Transaction_Receipt_${transaction.id || Date.now()}.pdf`);
  } catch (error) {
    console.error('Error generating transaction receipt:', error);
    throw error;
  }
};

// Generate Professional Loan Agreement PDF
export const generateLoanAgreementPDF = async (application) => {
  try {
    const doc = new jsPDF();

    addOptimizedWatermark(doc, 'agreement');

    let yPos = await addHeader(doc, 10);

    // Main Title
    doc.setTextColor(...COLORS.primaryBlue);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('LIVESTOCK ADVANCE PAYMENT AGREEMENT', 105, yPos, { align: 'center' });
    yPos += 8;

    yPos = addDivider(doc, yPos);

    // Agreement Date
    const agreementDate = application.date ? new Date(application.date) : new Date();
    const formattedDate = agreementDate.toLocaleDateString('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
    const today = new Date().toLocaleDateString('en-GB');

    doc.setTextColor(...COLORS.textDark);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`Agreement Date: ${formattedDate}`, 20, yPos);
    yPos += 8;

    // Agreement Body (Top Section)
    doc.setFontSize(11.5);
    const firstLineParts = [
      { text: "I ", style: 'normal' },
      { text: `${application.name || '___________________'}`, style: 'bold' },
      { text: " of ID NO: ", style: 'normal' },
      { text: `${application.idNumber || '___________________'}`, style: 'bold' },
      { text: " on this ", style: 'normal' },
      { text: "________", style: 'bold' },
      { text: " (day) ", style: 'normal' },
      { text: "________", style: 'bold' },
      { text: ` (month) (Year) 20${agreementDate.getFullYear().toString().slice(-2)}`, style: 'normal' }
    ];
    writeStyledLine(doc, firstLineParts, 20, yPos, 11.5);
    yPos += 5;

    const secondLineParts = [
      { text: "acknowledge/agree and therefore receive Ksh: ", style: 'normal' },
      { text: `${application.loanAmount ? application.loanAmount.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '__________'}`, style: 'bold' }
    ];
    writeStyledLine(doc, secondLineParts, 20, yPos, 11.5);
    yPos += 5;

    const thirdLineParts = [
      { text: "for payment of ", style: 'normal' },
      { text: `${application.livestockType || '__________'}`, style: 'bold' },
      { text: " (No. of livestock ", style: 'normal' },
      { text: `${application.livestockCount || '____'}`, style: 'bold' },
      { text: ") by Nagolie enterprises.", style: 'normal' }
    ];
    writeStyledLine(doc, thirdLineParts, 20, yPos, 11.5);
    yPos += 8;

    // Terms and Conditions heading
    doc.setTextColor(...COLORS.primaryBlue);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('TERMS AND CONDITIONS', 105, yPos, { align: 'center' });
    yPos += 7;

    // ─────────────────────────────────────────────────────────────────────────
    // REPAYMENT PLAN DETECTION
    const rawPlan = (
      application.repaymentPlan   ||
      application.repayment_plan  ||
      'weekly'
    ).toString().toLowerCase().trim();
    const selectedPlan = (rawPlan === 'daily') ? 'daily' : 'weekly';

    // Interest calculation
    const loanAmount = parseFloat(application.loanAmount) || 0;
    let interestAmount = 0, interestLabel = '';
    if (selectedPlan === 'daily') {
      interestAmount = loanAmount * 0.045;
      interestLabel = ' per day';
    } else {
      interestAmount = loanAmount * 0.30;
      interestLabel = ' weekly';
    }
    const formattedInterestValue = interestAmount.toLocaleString('en-US', { minimumFractionDigits: 2 });
    const formattedInterest = `Ksh ${formattedInterestValue}${interestLabel}`;

    // Helper: draw checkbox
    const drawCheckbox = (x, y, ticked = false) => {
      const SZ = 5;
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.5);
      doc.rect(x, y, SZ, SZ);
      if (ticked) {
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.8);
        doc.line(x + 0.8, y + 2.6, x + 2.0, y + 4.0);
        doc.line(x + 2.0, y + 4.0, x + 4.4, y + 0.8);
        doc.setLineWidth(0.3);
      }
    };

    const drawThumbprintBox = (x, y, width = 40, height = 35) => {
      doc.setDrawColor(230, 235, 245);
      doc.setLineWidth(0.3);
      doc.roundedRect(x, y, width, height, 2, 2);
      doc.setTextColor(230, 235, 240);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.text('THUMB PRINT', x + width / 2, y + height / 2, { align: 'center' });
      doc.setTextColor(...COLORS.textDark);
      doc.setFont('helvetica', 'normal');
    };

    const drawRtLtCheckboxes = (x, y) => {
      doc.setTextColor(...COLORS.textDark);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.3);
      doc.rect(x, y, 4, 4);   doc.text('R.T', x + 5, y + 3.5);
      doc.rect(x + 22, y, 4, 4);   doc.text('L.T', x + 27, y + 3.5);
    };

    const LH = 3.5;

    const renderLine = (line, y) => {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...COLORS.textDark);

      if (Array.isArray(line)) {
        writeStyledLine(doc, line, 20, y, 10);
        return LH;
      }

      if (typeof line === 'object' && (line.heading || line.subheading)) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...COLORS.primaryBlue);
        doc.text(line.text, 20, y);
        return LH - 0.5;
      }

      if (typeof line === 'object' && line.boldDark) {
        doc.setFontSize(line.fontSize || 10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...COLORS.textDark);
        doc.text(line.text, 20, y);
        return LH;
      }

      if (typeof line === 'object' && line.checkbox) {
        const isTicked = (line.plan === selectedPlan);
        drawCheckbox(20, y - 4, isTicked);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...COLORS.textDark);
        doc.text(line.label, 28, y);
        return LH;
      }

      if (typeof line === 'object' && line.interestPlaceholder) {
        const staticText = 'The interest for this loan is ';
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...COLORS.textDark);
        doc.text(staticText, 20, y);
        const staticW = doc.getTextWidth(staticText);
        doc.setFont('helvetica', 'bold');
        doc.text(formattedInterest, 20 + staticW, y);
        return LH;
      }

      if (typeof line === 'object' && line.thumbprintBox) {
        const boxW = 40, boxH = 35;
        const boxX = 210 - 20 - boxW;
        const boxY = y - 2;
        drawThumbprintBox(boxX, boxY, boxW, boxH);
        const cbY = boxY + boxH + 4;
        const cbX = boxX + (boxW / 2) - 17;
        drawRtLtCheckboxes(cbX, cbY);
        return boxH + 10;
      }

      if (typeof line === 'object' && line.classificationStatement) {
        const classification = application.productionClassification || 
                               application.production_classification || 
                               "not specified";
        const statement = `The collateral for this loan is categorized under the [${classification}] category.`;
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(...COLORS.primaryBlue);
        doc.text(statement, 20, y);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...COLORS.textDark);
        return LH;
      }

      // Plain string – wrap to avoid overflow
      const wrapped = doc.splitTextToSize(String(line), 170);
      wrapped.forEach((w, idx) => {
        if (idx === 0) doc.text(w, 20, y);
        else doc.text(w, 20, y + idx * LH);
      });
      return LH * wrapped.length;
    };

    const termGroups = [
      // 1. Agreement Overview
      [
        { text: "1. Agreement Overview", heading: true },
        "This Livestock Financing Agreement (\"Agreement\") is entered into between the applicant (\"Recipient\") and",
        " Nagolie Enterprises (\"Company\"). The Recipient acknowledges receipt of a loan from Nagolie Enterprises, secured",
        "  by the specified livestock, which shall become the property of Nagolie Enterprises until the loan is fully repaid.",
        ""
      ],
      // 2. Ownership Transfer and Custody
      [
        { text: "2. Ownership Transfer and Custody", heading: true },
        "Upon disbursement of the loan, legal ownership of the specified livestock transfers to Nagolie Enterprises,",
        " with the Recipient maintaining physical custody.",
        "The Recipient agrees to:",
        "- Provide proper care and maintenance for the livestock",
        "- Ensure the livestock are kept in good health",
        "- Not sell, transfer, or dispose of the livestock without prior written consent from the Company",
        "- Allow Company representatives access to inspect the livestock at reasonable times",
        "",
        { text: "2.1. Absolute Right of Claim Upon Default:", subheading: true },
        "In the event of default, the Company reserves the absolute right to claim, take possession of, and remove the",
        " collateral livestock without further notice.",
        "This right extends to claiming the livestock:",
        "- In the presence OR absence of the Recipient",
        "- In the presence OR absence of the Next of Kin or any family members",
        "- Without requirement for additional consent or permission from any party",
        "",
        { text: "2.2. Immediate Action for Recovery:", subheading: true },
        "The Company shall not be delayed or hindered in its recovery efforts by the unavailability, resistance, or objections",
        "  of the Recipient, Next of Kin, or any related parties.",
        "The Company's representatives, including livestock valuers and security personnel, are authorized to take immediate",
        "  action to secure the Company's property and recover losses without legal impediment.",
        "",
        { text: "2.3. Consent to Recovery in the Event of Default", subheading: true },
        [
          { text: "I, ", style: 'normal' },
          { text: application.name || "___________________", style: 'bold' },
          { text: " of ID NO: ", style: 'normal' },
          { text: application.idNumber || "___________________", style: 'bold' },
          { text: " acknowledge that I have read and fully understood the terms of this", style: 'normal' }
        ],
        "Agreement, particularly the rights of Nagolie Enterprises to recover the collateral livestock upon default.",
        "I voluntarily and irrevocably consent that in the event of default, Nagolie Enterprises and its authorized",
        "agents may immediately take possession of the collateral livestock without the need for a court order, further",
        "notice, or additional consent from any party. I hereby waive all rights to legally obstruct or delay such",
        "recovery. This consent is freely given, binding on my heirs, successors, and assigns, and enforceable to the",
        "fullest extent permitted under the laws of Kenya.",
        "",
        { text: `Signature: ___________________          Date: ${today}`, boldDark: true, fontSize: 11 },
        { thumbprintBox: true }
      ],
      // 3. Repayment Terms and Interest
      [
        { text: "3. Repayment Terms and Interest", heading: true },
        "The loan is repayable under one of the following plans selected by the Recipient at the time of disbursement",
        "(please tick one plan below):",
        "",
        { checkbox: true, plan: 'weekly', label: "Weekly Plan:" },
        "The loan is repayable within seven (7) days from the date of disbursement with an interest of 30%",
        "(negotiable) of the disbursed funds. Interest shall be charged on a weekly basis for a maximum period",
        "of two (2) weeks. After two (2) weeks, if the loan is not fully repaid, no further interest will accrue.",
        "The Recipient must then either:",
        "  (a) repay the outstanding loan balance in full, or",
        "  (b) sign a compulsory Loan Renewal Agreement with the Company to extend the repayment period.",
        "",
        { checkbox: true, plan: 'daily', label: "Daily Plan:" },
        "The loan is repayable with an interest of 4.5% per day. Interest shall be charged daily for a maximum",
        "period of two (2) weeks. After two (2) weeks, if the loan is not fully repaid, no further interest will",
        "accrue. The Recipient must then either:",
        "  (a) repay the outstanding loan balance in full, or",
        "  (b) sign a compulsory Loan Renewal Agreement with the Company to extend the repayment period.",
        "",
        { interestPlaceholder: true },
        "",        
        "A loan shall only be deemed fully repaid and settled upon payment in full of the entire outstanding principal",
        "amount together with all accrued interest and any applicable charges. Partial payments, including payment of",
        "interest alone, shall not constitute settlement or discharge of the loan obligation.",
        "",
        "Recognizing the circumstances of local communities, the Director of Nagolie Enterprises may at their",
        "discretion grant an extension of the repayment period after consultation with the Recipient. Any extension",
        "must be agreed upon in writing by both parties, specifying the new repayment date.",
        ""
      ],
      // 4. Loan Settlement and Ownership Return
      [
        { text: "4. Loan Settlement and Ownership Return", heading: true },
        "Upon full repayment of the loan principal plus agreed interest:",
        "- Legal ownership of the livestock reverts to the Recipient",
        "- All rights and responsibilities regarding the livestock return to the Recipient",
        ""
      ],
      // 5. Livestock Valuation & Value Chain Classification
      [
        { text: "5. Livestock Valuation & Value Chain Classification", heading: true },
        "All livestock shall be valued by an authorized Livestock Valuer appointed by Nagolie Enterprises.",
        "The valuation shall be final and binding for determining the maximum loan amount.",
        "",
        "In addition to standard valuation, each livestock asset shall be classified according to its economic production ",
        "role within the agricultural value chain.",
        { classificationStatement: true },
        "",
        { text: "5.1 Value Chain Integration and Utilization", subheading: true },
        "Nagolie Enterprises Ltd recognizes livestock as productive assets within the agricultural value chain.",
        "Where applicable, the Company reserves the right to:",
        "  • Monitor the productivity of the collateral livestock",
        "  • Provide advisory or support services to enhance value generation",
        "  • Utilize classification insights to optimize asset value in the event of recovery, resale, or risk management",
        "The Recipient acknowledges that livestock classification may influence the loan amounts, risk evaluation and ",
        "recovery strategy in the event of default.",
        ""
      ],
      // 6. Default and Remedies
      [
        { text: "6. Default and Remedies", heading: true },
        "Failure to repay the loan by the due date (including any agreed extension) shall constitute default, entitling",
        "  Nagolie Enterprises to:",
        "- Charge compounded interest on the outstanding amount after every seven (7) days until full repayment",
        "- Take immediate possession of the livestock in holding for 48 hrs to allow the Recipient to repay or sign a",
        "   renewal agreement",
        "- Sell the livestock to recover the outstanding loan amount if payment is not made within the 48hr holding period",
        "- Initiate legal proceedings for recovery of any remaining balance",
        "- Charge interest on overdue amounts at the prevailing market rate",
        ""
      ],
      // 7. Governing Law
      [
        { text: "7. Governing Law", heading: true },
        "This agreement shall be governed by and construed in accordance with the laws of Kenya. Any disputes arising",
        "  from this agreement shall be subject to the exclusive jurisdiction of the courts of Kenya.",
        ""
      ],
      // 8. Entire Agreement
      [
        { text: "8. Entire Agreement", heading: true },
        "This document constitutes the entire agreement between the parties and supersedes all prior discussions,",
        " negotiations, and agreements. No modification of this agreement shall be effective unless in writing and",
        " signed by both parties.",
        ""
      ]
    ];

    // ---- PAGE 1 ----
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.textDark);
    for (let i = 0; i < 2; i++) {
      for (const line of termGroups[i]) {
        yPos += renderLine(line, yPos);
      }
    }

    // ---- PAGE 2 ----
    doc.addPage();
    addWatermarkToCurrentPage(doc, 'agreement');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.textDark);
    yPos = 20;
    for (let i = 2; i < termGroups.length; i++) {
      for (const line of termGroups[i]) {
        yPos += renderLine(line, yPos);
      }
    }

    // ========== ADD SIGNATURE LINE AT BOTTOM OF PAGE 2 ==========
    // Ensure there is enough space; place it at y = 270 (near page bottom)
    const signatureY = Math.min(yPos + 15, 280);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.textDark);
    doc.text(`Client's Signature: ________________________`, 105, signatureY, { align: 'center' });

    // ---- PAGE 3: Valuation Report + Signatures ----
    doc.addPage();
    addWatermarkToCurrentPage(doc, 'agreement');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    yPos = 20;

    // STRUCTURED VALUATION REPORT (with multi-line fields)
    doc.setTextColor(...COLORS.primaryBlue);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('VALUATION REPORT', 105, yPos, { align: 'center' });
    yPos += 10;

    const startX = 20;
    const labelWidth = 55;
    const rowHeight = 7;
    let currentY = yPos;

    const addMultiLineField = (label, linesCount = 2) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...COLORS.textDark);
      doc.text(label, startX, currentY + 3);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      const fieldX = startX + labelWidth;
      const line = '_'.repeat(70);
      for (let i = 0; i < linesCount; i++) {
        doc.text(line, fieldX, currentY + 3 + i * rowHeight);
      }
      currentY += rowHeight * linesCount;
    };

    const addFieldRow = (label, underlineLength = 60, valuePrefix = '') => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...COLORS.textDark);
      doc.text(label, startX, currentY + 3);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      const fieldX = startX + labelWidth;
      const fieldValue = valuePrefix ? `${valuePrefix} ` : '';
      const fieldText = fieldValue + '_'.repeat(underlineLength);
      doc.text(fieldText, fieldX, currentY + 3);
      currentY += rowHeight;
    };

    addFieldRow('Collateral Price (KES):', 60);
    addFieldRow('Product Quantity, Quality and Price:', 60);
    addMultiLineField('Supplement recommendation:', 2);
    addMultiLineField('Parasite Control recommendations:', 2);
    addFieldRow('Last vaccination date:', 40, '____/____/____');
    addMultiLineField('Next vaccination date recommendation:', 2);

    yPos = currentY + 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.textDark);
    doc.text("I, the Recipient, confirm that I have read and agree with the valuation process and the valuation", 20, yPos);
    yPos += 5;
    doc.text("of the collateral livestock as recorded above.", 20, yPos);
    yPos += 12;

    doc.setFont('helvetica', 'bold');
    doc.text("Client's signature:", 20, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text("_________________________", 70, yPos);
    yPos += 8;

    doc.setFont('helvetica', 'bold');
    doc.text("Valuer's name:", 20, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text("_________________________", 70, yPos);
    yPos += 6;

    doc.setFont('helvetica', 'bold');
    doc.text("Valuer's signature:", 20, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text("_________________________", 70, yPos);
    yPos += 8;

    doc.setFont('helvetica', 'bold');
    doc.text("Date:", 20, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text("_________________________", 70, yPos);
    yPos += 12;

    // Divider
    doc.setDrawColor(...COLORS.primaryBlue);
    doc.setLineWidth(0.5);
    doc.line(20, yPos, 190, yPos);
    yPos += 8;

    // SIGNATURES SECTION
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...COLORS.primaryBlue);
    doc.text('SIGNATURES', 105, yPos, { align: 'center' });
    yPos += 8;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.textDark);
    doc.text('PARTIES TO THIS AGREEMENT:', 20, yPos);
    yPos += 8;

    const clientTopY = yPos;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.textDark);
    doc.text('CLIENT', 20, clientTopY);

    doc.setFontSize(10);
    doc.text('Name:', 25, clientTopY + 8);
    doc.setFont('helvetica', 'normal');
    doc.text(`${application.name || '___________________'}`, 55, clientTopY + 8);

    doc.setFont('helvetica', 'bold');
    doc.text('ID No:', 25, clientTopY + 16);
    doc.setFont('helvetica', 'normal');
    doc.text(`${application.idNumber || '___________________'}`, 55, clientTopY + 16);

    doc.setFont('helvetica', 'bold');
    doc.text('Signature:', 25, clientTopY + 24);
    doc.setFont('helvetica', 'normal');
    doc.text('___________________', 65, clientTopY + 24);

    const thumbW = 40, thumbH = 35;
    const thumbBoxX = 210 - 20 - thumbW;
    const thumbBoxY = clientTopY - 2;
    drawThumbprintBox(thumbBoxX, thumbBoxY, thumbW, thumbH);
    const cbY = thumbBoxY + thumbH + 4;
    const cbX = thumbBoxX + (thumbW / 2) - 17;
    drawRtLtCheckboxes(cbX, cbY);

    yPos = thumbBoxY + thumbH + 14;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.textDark);
    doc.text('CONFIRMED BY:', 20, yPos);
    yPos += 8;

    const colW = 190 / 3;
    const col1 = 20, col2 = 35 + colW, col3 = 20 + colW * 2;
    const confY = yPos;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.textDark);
    doc.text('Shadrack Kesumet', col1, confY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Director', col1, confY + 5);
    doc.text('Sign: ___________________', col1, confY + 12);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.textDark);
    doc.text('George Marite', col2, confY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Livestock Valuer', col2, confY + 5);
    doc.text('Sign: ___________________', col2, confY + 12);

    yPos = confY + 22;

    const stampW = 60, stampH = 35;
    const stampX = (210 - stampW) / 2;
    const stampY = yPos;
    doc.setDrawColor(230, 235, 245);
    doc.setLineWidth(0.3);
    doc.roundedRect(stampX, stampY, stampW, stampH, 2, 2);
    doc.setTextColor(230, 235, 240);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.text('OFFICIAL COMPANY STAMP', stampX + stampW / 2, stampY + stampH / 2, { align: 'center' });

    const footerY = 285;
    doc.setTextColor(...COLORS.textLight);
    doc.setFontSize(8);
    doc.text(`Generated on: ${new Date().toLocaleDateString('en-GB')}`, 20, footerY);
    doc.setTextColor(...COLORS.textDark);
    doc.setFontSize(9);
    doc.text('Thank you for choosing Nagolie Enterprises!', 105, footerY + 5, { align: 'center' });

    addPageNumbers(doc, 'page %d');

    const fileName = `Loan_Agreement_${application.name?.replace(/\s+/g, '_') || 'Client'}_${formattedDate.replace(/\//g, '-')}.pdf`;
    doc.save(fileName);

  } catch (error) {
    console.error('Error generating loan agreement:', error);
    throw error;
  }
};

// Generate Manual Loan Agreement PDF (with blanks for manual filling)
export const generateManualLoanAgreementPDF = async () => {
  try {
    const doc = new jsPDF();

    addOptimizedWatermark(doc, 'agreement');

    let yPos = await addHeader(doc, 10);

    // Main Title
    doc.setTextColor(...COLORS.primaryBlue);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('LIVESTOCK ADVANCE PAYMENT AGREEMENT', 105, yPos, { align: 'center' });
    yPos += 8;

    yPos = addDivider(doc, yPos);

    // Agreement Date – left blank for manual entry
    doc.setTextColor(...COLORS.textDark);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`Agreement Date: ___________________`, 20, yPos);
    yPos += 8;

    // Agreement Body – all blanks
    doc.setFontSize(11.5);
    const firstLineParts = [
      { text: "I ", style: 'normal' },
      { text: "________________", style: 'bold' },
      { text: " of ID NO: ", style: 'normal' },
      { text: "______________", style: 'bold' },
      { text: " on this ", style: 'normal' },
      { text: "_____", style: 'bold' },
      { text: " (day) ", style: 'normal' },
      { text: "_____", style: 'bold' },
      { text: " (month) (Year) 2026", style: 'normal' }
    ];
    writeStyledLine(doc, firstLineParts, 20, yPos, 11.5);
    yPos += 5;

    const secondLineParts = [
      { text: "acknowledge/agree and therefore receive Ksh: ", style: 'normal' },
      { text: "_____________", style: 'bold' }
    ];
    writeStyledLine(doc, secondLineParts, 20, yPos, 11.5);
    yPos += 5;

    const thirdLineParts = [
      { text: "for payment of ", style: 'normal' },
      { text: "_______________", style: 'bold' },
      { text: " (No. of livestock ", style: 'normal' },
      { text: "_______", style: 'bold' },
      { text: ") by Nagolie enterprises.", style: 'normal' }
    ];
    writeStyledLine(doc, thirdLineParts, 20, yPos, 11.5);
    yPos += 8;

    // Terms and Conditions heading
    doc.setTextColor(...COLORS.primaryBlue);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('TERMS AND CONDITIONS', 105, yPos, { align: 'center' });
    yPos += 7;

    // Helper functions
    const drawCheckbox = (x, y) => {
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.3);
      doc.rect(x, y, 4, 4);
    };

    const drawThumbprintBox = (x, y, width = 30, height = 25) => {
      doc.setDrawColor(230, 235, 245);
      doc.setLineWidth(0.3);
      doc.roundedRect(x, y, width, height, 2, 2);
      doc.setTextColor(230, 235, 240);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.text('THUMB PRINT', x + width / 2, y + height / 2, { align: 'center' });
    };

    const drawRtLtCheckboxes = (x, y) => {
      doc.setTextColor(...COLORS.textDark);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.3);
      doc.rect(x, y, 4, 4);
      doc.text('Right Thumb', x + 5, y + 3.5);
      doc.rect(x + 45, y, 4, 4);
      doc.text('Left Thumb', x + 50, y + 3.5);
    };

    const LH = 3.5;

    const termGroups = [
      // 1. Agreement Overview
      [
        { text: "1. Agreement Overview", heading: true },
        "This Livestock Financing Agreement (\"Agreement\") is entered into between the applicant (\"Recipient\") and",
        " Nagolie Enterprises (\"Company\"). The Recipient acknowledges receipt of a loan from Nagolie Enterprises, secured",
        "  by the specified livestock, which shall become the property of Nagolie Enterprises until the loan is fully repaid.",
        ""
      ],
      // 2. Ownership Transfer and Custody
      [
        { text: "2. Ownership Transfer and Custody", heading: true },
        "Upon disbursement of the loan, legal ownership of the specified livestock transfers to Nagolie Enterprises,",
        " with the Recipient maintaining physical custody.",
        "The Recipient agrees to:",
        "- Provide proper care and maintenance for the livestock",
        "- Ensure the livestock are kept in good health",
        "- Not sell, transfer, or dispose of the livestock without prior written consent from the Company",
        "- Allow Company representatives access to inspect the livestock at reasonable times",
        "",
        { text: "2.1. Absolute Right of Claim Upon Default:", subheading: true },
        "In the event of default, the Company reserves the absolute right to claim, take possession of, and remove the",
        " collateral livestock without further notice.",
        "This right extends to claiming the livestock:",
        "- In the presence OR absence of the Recipient",
        "- In the presence OR absence of the Next of Kin or any family members",
        "- Without requirement for additional consent or permission from any party",
        "",
        { text: "2.2. Immediate Action for Recovery:", subheading: true },
        "The Company shall not be delayed or hindered in its recovery efforts by the unavailability, resistance, or objections",
        "  of the Recipient, Next of Kin, or any related parties.",
        "The Company's representatives, including livestock valuers and security personnel, are authorized to take immediate",
        "  action to secure the Company's property and recover losses without legal impediment.",
        "",
        { text: "2.3. Consent to Recovery in the Event of Default", subheading: true },
        [
          { text: "I, ", style: 'normal' },
          { text: "___________________", style: 'bold' },
          { text: " of ID NO: ", style: 'normal' },
          { text: "___________________", style: 'bold' },
          { text: " acknowledge that I have read and fully understood the ", style: 'normal' }
        ],
        "terms of this Agreement, particularly the rights of Nagolie Enterprises to recover the collateral livestock upon default.",
        "I voluntarily and irrevocably consent that in the event of default, Nagolie Enterprises and its authorized agents",
        "may immediately take possession of the collateral livestock without the need for a court order, further notice,",
        "or additional consent from any party. I hereby waive all rights to legally obstruct or delay such recovery",
        "This consent is freely given, binding on my heirs, successors, and assigns, and enforceable to the fullest extent",
        "permitted under the laws of Kenya.",
        "",
        { text: "Signature: ___________________          Date: ___________________", boldDark: true, fontSize: 11 },
        { thumbprintBox: true }
      ],
      // 3. Repayment Terms and Interest
      [
        { text: "3. Repayment Terms and Interest", heading: true },
        "The loan is repayable under one of the following plans selected by the Recipient at the time of disbursement",
        "(please tick one plan below):",
        "",
        { checkbox: true, label: "Weekly Plan:" },
        "",
        "The loan is repayable within seven (7) days from the date of disbursement with an interest of 30% (negotiable)",
        "of the disbursed funds. The weekly interest rate of thirty percent (30%) constitutes a comprehensive charge",
        "inclusive of all ancillary costs related to the loan, including but not limited to processing fees,",
        "valuation costs, and veterinary care expenses where applicable. Such charges are applied to facilitate",
        "due diligence, risk management, and ongoing asset maintenance during the tenure of the loan.",
        "Interest shall be charged on a weekly basis for a",
        "maximum period of two (2) weeks. After two (2) weeks, if the loan is not fully repaid, no further interest will",
        "accrue. The Recipient must then either:",
        " (a) repay the outstanding loan balance in full, or ",
        " (b) sign a compulsory Loan Renewal Agreement with the Company to extend the repayment period.",
        "",
        { checkbox: true, label: "Daily Plan:" },
        "",
        "The loan is repayable with an interest of 4.5% per day. Interest shall be",
        "charged daily for a maximum period of two (2) weeks. After two (2) weeks, if the loan is not fully repaid, no",
        "further interest will accrue. The Recipient must then either:",
        " (a) repay the outstanding loan balance in full, or",
        " (b) sign a compulsory Loan Renewal Agreement with the Company to extend the repayment period.",
        "",
        "The interest for this loan is Ksh________",
        "",
        "A loan shall only be deemed fully repaid and settled upon payment in full of the entire outstanding principal",
        "amount together with all accrued interest and any applicable charges. Partial payments, including payment of",
        "interest alone, shall not constitute settlement or discharge of the loan obligation.",
        "",
        "Recognizing the circumstances of local communities, the Director of Nagolie Enterprises may at their",
        "discretion grant an extension of the repayment period after consultation with the Recipient. Any extension",
        "must be agreed upon in writing by both parties, specifying the new repayment date.",
        ""
      ],
      // 4. Loan Settlement and Ownership Return
      [
        { text: "4. Loan Settlement and Ownership Return", heading: true },
        "Upon full repayment of the loan principal plus agreed interest:",
        "- Legal ownership of the livestock reverts to the Recipient",
        "- All rights and responsibilities regarding the livestock return to the Recipient",
        ""
      ],
      // 5. Livestock Valuation & Value Chain Classification
      [
        { text: "5. Livestock Valuation & Value Chain Classification", heading: true },
        "All livestock shall be valued by an authorized Livestock Valuer appointed by Nagolie Enterprises.",
        "The valuation shall be final and binding for determining the maximum loan amount.",
        "",
        "In addition to standard valuation, each livestock asset shall be classified according to its economic production ",
        "role within the agricultural value chain.",
        "The collateral for this loan is categorized under the [ _________________ ] category.",
        "",
        { text: "5.1 Value Chain Integration and Utilization", subheading: true },
        "Nagolie Enterprises Ltd recognizes livestock as productive assets within the agricultural value chain.",
        "Where applicable, the Company reserves the right to:",
        "  • Monitor the productivity of the collateral livestock",
        "  • Provide advisory or support services to enhance value generation",
        "  • Utilize classification insights to optimize asset value in the event of recovery, resale, or risk management",
        "The Recipient acknowledges that livestock classification may influence the loan amounts, risk evaluation and ",
        "recovery strategy in the event of default.",
        ""
      ],
      // 6. Default and Remedies
      [
        { text: "6. Default and Remedies", heading: true },
        "Failure to repay the loan by the due date (including any agreed extension) shall constitute default, entitling",
        "  Nagolie Enterprises to:",
        "- Charge compounded interest on the outstanding amount after every seven (7) days until full repayment",
        "- Take immediate possession of the livestock in holding for 30 days to allow the Recipient to repay or sign a",
        "   renewal agreement",
        "- Sell the livestock to recover the outstanding loan amount if payment is not made within the 30 days holding period",
        "- Initiate legal proceedings for recovery of any remaining balance",
        "- Charge interest of 4.5% daily on overdue amounts",
        ""
      ],
      // 7. Governing Law
      [
        { text: "7. Governing Law", heading: true },
        "This agreement shall be governed by and construed in accordance with the laws of Kenya. Any disputes arising",
        "  from this agreement shall be subject to the exclusive jurisdiction of the courts of Kenya.",
        ""
      ],
      // 8. Entire Agreement
      [
        { text: "8. Entire Agreement", heading: true },
        "This document constitutes the entire agreement between the parties and supersedes all prior discussions,",
        " negotiations, and agreements. No modification of this agreement shall be effective unless in writing and",
        " signed by both parties.",
        ""
      ]
    ];

    const renderLine = (line, y) => {
      doc.setFontSize(10);

      if (Array.isArray(line)) {
        let x = 20;
        line.forEach(part => {
          if (part.style === 'bold') {
            doc.setFont('helvetica', 'bold');
          } else {
            doc.setFont('helvetica', 'normal');
          }
          doc.setTextColor(...COLORS.textDark);
          doc.text(part.text, x, y);
          x += doc.getTextWidth(part.text);
        });
        return LH;
      }

      if (typeof line === 'object' && (line.heading || line.subheading)) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...COLORS.primaryBlue);
        doc.text(line.text, 20, y);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...COLORS.textDark);
        return LH - 0.5;
      }

      if (typeof line === 'object' && line.boldDark) {
        const fs = line.fontSize || 10;
        doc.setFontSize(fs);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...COLORS.textDark);
        doc.text(line.text, 20, y);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        return LH;
      }

      if (typeof line === 'object' && line.checkbox) {
        drawCheckbox(20, y - 3);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...COLORS.textDark);
        doc.text(line.label, 26, y);
        doc.setFont('helvetica', 'normal');
        return LH;
      }

      if (typeof line === 'object' && line.thumbprintBox) {
        const boxW = 40;
        const boxH = 35;
        const boxX = 210 - 20 - boxW;
        const boxY = y - 2;
        drawThumbprintBox(boxX, boxY, boxW, boxH);
        const checkY = boxY + boxH + 4;
        const groupWidth = 50 + 5 + 20;
        const checkX = boxX + (boxW / 2) - (groupWidth / 2);
        drawRtLtCheckboxes(checkX, checkY);
        return boxH + 10;
      }

      // Plain string – wrap to avoid overflow
      const wrapped = doc.splitTextToSize(String(line), 170);
      wrapped.forEach((w, idx) => {
        if (idx === 0) doc.text(w, 20, y);
        else doc.text(w, 20, y + idx * LH);
      });
      return LH * wrapped.length;
    };

    // ---- PAGE 1: Groups 0 and 1 ----
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.textDark);

    for (let i = 0; i < 2; i++) {
      const group = termGroups[i];
      for (const line of group) {
        yPos += renderLine(line, yPos);
      }
    }

    // ---- PAGE 2: Groups 2 through 7 ----
    doc.addPage();
    addWatermarkToCurrentPage(doc, 'agreement');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.textDark);
    yPos = 20;

    for (let i = 2; i < termGroups.length; i++) {
      const group = termGroups[i];
      for (const line of group) {
        yPos += renderLine(line, yPos);
      }
    }

    // ========== ADD CLIENT SIGNATURE LINE AT BOTTOM OF PAGE 2 ==========
    const signatureY = Math.min(yPos + 15, 294);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.textDark);
    doc.text(`Client's Signature: ________________________`, 105, signatureY, { align: 'center' });

    // ---- PAGE 3: Valuation Report + Signatures ----
    doc.addPage();
    addWatermarkToCurrentPage(doc, 'agreement');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    yPos = 20;

    // STRUCTURED VALUATION REPORT (with multi-line fields)
    doc.setTextColor(...COLORS.primaryBlue);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('VALUATION REPORT', 105, yPos, { align: 'center' });
    yPos += 10;

    const startX = 20;
    const labelWidth = 55;
    const rowHeight = 7;
    let currentY = yPos;

    const addMultiLineField = (label, linesCount = 2) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...COLORS.textDark);
      doc.text(label, startX, currentY + 3);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      const fieldX = startX + labelWidth;
      const line = '_'.repeat(70);
      for (let i = 0; i < linesCount; i++) {
        doc.text(line, fieldX, currentY + 3 + i * rowHeight);
      }
      currentY += rowHeight * linesCount;
    };

    const addFieldRow = (label, underlineLength = 70, valuePrefix = '') => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...COLORS.textDark);
      doc.text(label, startX, currentY + 3);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      const fieldX = startX + labelWidth;
      const fieldValue = valuePrefix ? `${valuePrefix} ` : '';
      const fieldText = fieldValue + '_'.repeat(underlineLength);
      doc.text(fieldText, fieldX, currentY + 3);
      currentY += rowHeight;
    };

    addFieldRow('Collateral Price (KES):', 60);
    addFieldRow('Product Quantity, Quality and Price:', 60);
    addMultiLineField('Supplement recommendation:', 2);
    addMultiLineField('Parasite Control recommendations:', 2);
    addFieldRow('Last vaccination date:', 40, '____/____/____');
    addMultiLineField('Next vaccination date recommendation:', 2);

    yPos = currentY + 8;

    // Client confirmation statement
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.textDark);
    doc.text("I, the Recipient, confirm that I have read and agree with the valuation process and the valuation", 20, yPos);
    yPos += 5;
    doc.text("of the collateral livestock as recorded above.", 20, yPos);
    yPos += 12;

    // Signature fields (no duplication)
    doc.setFont('helvetica', 'bold');
    doc.text("Client's signature:", 20, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text("_________________________", 70, yPos);
    yPos += 8;

    doc.setFont('helvetica', 'bold');
    doc.text("Valuer's name:", 20, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text("_________________________", 70, yPos);
    yPos += 6;

    doc.setFont('helvetica', 'bold');
    doc.text("Valuer's signature:", 20, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text("_________________________", 70, yPos);
    yPos += 8;

    doc.setFont('helvetica', 'bold');
    doc.text("Date:", 20, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text("_________________________", 70, yPos);
    yPos += 12;

    // Divider
    doc.setDrawColor(...COLORS.primaryBlue);
    doc.setLineWidth(0.5);
    doc.line(20, yPos, 190, yPos);
    yPos += 8;

    // SIGNATURES SECTION
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...COLORS.primaryBlue);
    doc.text('SIGNATURES', 105, yPos, { align: 'center' });
    yPos += 8;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.textDark);
    doc.text('PARTIES TO THIS AGREEMENT:', 20, yPos);
    yPos += 8;

    // CLIENT block
    const clientTopY = yPos;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.textDark);
    doc.text('CLIENT', 20, clientTopY);

    doc.setFontSize(10);
    doc.text('Name:', 25, clientTopY + 8);
    doc.setFont('helvetica', 'normal');
    doc.text('___________________', 55, clientTopY + 8);

    doc.setFont('helvetica', 'bold');
    doc.text('ID No:', 25, clientTopY + 16);
    doc.setFont('helvetica', 'normal');
    doc.text('___________________', 55, clientTopY + 16);

    doc.setFont('helvetica', 'bold');
    doc.text('Signature:', 25, clientTopY + 24);
    doc.setFont('helvetica', 'normal');
    doc.text('___________________', 65, clientTopY + 24);

    // Thumbprint box
    const thumbW = 40;
    const thumbH = 35;
    const thumbBoxX = 210 - 20 - thumbW;
    const thumbBoxY = clientTopY - 2;
    drawThumbprintBox(thumbBoxX, thumbBoxY, thumbW, thumbH);
    const checkY = thumbBoxY + thumbH + 4;
    const groupWidth = 50 + 5 + 20;
    const checkX = thumbBoxX + (thumbW / 2) - (groupWidth / 2);
    drawRtLtCheckboxes(checkX, checkY);

    yPos = thumbBoxY + thumbH + 18;

    // CONFIRMED BY section
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.textDark);
    doc.text('CONFIRMED BY:', 20, yPos);
    yPos += 8;

    const colW = 190 / 3;
    const col1 = 20;
    const col2 = 20 + colW;
    const col3 = 20 + colW * 2;
    const confY = yPos;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.textDark);
    doc.text('Shadrack Kesumet', col1, confY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Director', col1, confY + 5);
    doc.text('Sign: ___________________', col1, confY + 12);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('George Marite', col2, confY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Livestock Valuer', col2, confY + 5);
    doc.text('Sign: ___________________', col2, confY + 12);

    yPos = confY + 22;

    // Stamp (shifted right)
    const stampW = 60;
    const stampH = 35;
    const stampX = (210 - stampW) / 2 + 10;
    const stampY = yPos;

    let stampBase64 = null;
    try {
      stampBase64 = await getLogoBase64('/nagolie-stamp-manual.png');
    } catch (error) {
      console.warn('Failed to load stamp image:', error);
    }

    if (stampBase64) {
      doc.addImage(stampBase64, 'PNG', stampX, stampY, stampW, stampH);
    } else {
      doc.setDrawColor(230, 235, 245);
      doc.setLineWidth(0.3);
      doc.roundedRect(stampX, stampY, stampW, stampH, 2, 2);
      doc.setTextColor(230, 235, 240);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'italic');
      doc.text('OFFICIAL COMPANY STAMP', stampX + stampW / 2, stampY + stampH / 2, { align: 'center' });
    }

    // Footer
    const footerY = 285;
    doc.setTextColor(...COLORS.textLight);
    doc.setFontSize(8);
    doc.text(`Generated on: ${new Date().toLocaleDateString('en-GB')}`, 20, footerY);
    doc.setTextColor(...COLORS.textDark);
    doc.setFontSize(9);
    doc.text('Thank you for choosing Nagolie Enterprises!', 105, footerY + 5, { align: 'center' });

    addPageNumbers(doc, 'page %d');

    const fileName = `Manual_Loan_Agreement_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);

  } catch (error) {
    console.error('Error generating manual loan agreement:', error);
    throw error;
  }
};

// Generate Professional Investor Agreement PDF
export const generateInvestorAgreementPDF = async (investor) => {
  try {
    const doc = new jsPDF();
    
    // ADD OPTIMIZED WATERMARK FIRST
    addOptimizedWatermark(doc, 'investor');
    
    let yPos = await addHeader(doc, 10);

    // Define agreement date early — this was the main fix
    const agreementDate = investor.invested_date 
      ? new Date(investor.invested_date) 
      : new Date();

    const formattedDate = agreementDate.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });

    // Main Title
    doc.setTextColor(...COLORS.primaryBlue);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('INVESTMENT AGREEMENT', 105, yPos, { align: 'center' });
    yPos += 8;

    yPos = addDivider(doc, yPos);

    // Parties Section
    doc.setTextColor(...COLORS.primaryBlue);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('PARTIES TO THIS AGREEMENT', 105, yPos, { align: 'center' });
    yPos += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.textDark);

    // Company Details
    doc.setFont('helvetica', 'bold');
    doc.text('1. NAGOLIE ENTERPRISES (hereinafter referred to as "the Company"):', 20, yPos);
    yPos += 6;
    doc.setFont('helvetica', 'normal');
    doc.text(` Registered Office: ${COMPANY_INFO.address}`, 25, yPos);
    yPos += 6;
    doc.text(` Postal Address: ${COMPANY_INFO.poBox}`, 25, yPos);
    yPos += 6;
    doc.text(` Phone: ${COMPANY_INFO.phone2}`, 25, yPos);
    yPos += 6;
    doc.text(` Email: ${COMPANY_INFO.email}`, 25, yPos);
    yPos += 6;
    doc.text(` Director: SHADRACK KESUMET`, 25, yPos);
    yPos += 12;

    // Investor Details
    doc.setFont('helvetica', 'bold');
    doc.text('2. THE INVESTOR:', 20, yPos);
    yPos += 6;
    doc.setFont('helvetica', 'normal');
    doc.text(` Full Name: ${(investor.name || '').toUpperCase() || '___________________'}`, 25, yPos);
    yPos += 6;
    doc.text(` ID Number: ${investor.id_number || '___________________'}`, 25, yPos);
    yPos += 6;
    doc.text(` Phone: ${investor.phone || '___________________'}`, 25, yPos);
    yPos += 6;
    doc.text(` Email: ${investor.email || '___________________'}`, 25, yPos);
    yPos += 12;

    // Investment Details Section
    doc.setTextColor(...COLORS.primaryBlue);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('INVESTMENT DETAILS', 105, yPos, { align: 'center' });
    yPos += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.textDark);

    const investmentAmount = investor.investment_amount ? parseFloat(investor.investment_amount) : 0;
    const returnAmount = investmentAmount * 0.40; // 10% return

    const firstReturnDate  = getFirstReturnDate(agreementDate);
    const secondReturnDate = getNextReturnDate(firstReturnDate);

    const investmentDetails = [
      { label: 'Investment Amount:', value: `KES ${investmentAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
      { label: 'Investment Date:', value: formattedDate },
      { label: 'Return Percentage:', value: '40%' },
      { label: 'Return Amount (per period):', value: `KES ${returnAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
      { label: 'Return Frequency:', value: 'First return after 5 weeks, then every 4 weeks' },
      { label: 'First Return Date:', value: firstReturnDate.toLocaleDateString('en-GB') },
      { label: 'Second Return Date:', value: secondReturnDate.toLocaleDateString('en-GB') },
      { label: 'Early Withdrawal Fee:', value: '15% of expected amount (investor receives 85%)' },
      { label: 'Investor Account Access:', value: 'Yes - Online dashboard with real-time statistics' }
    ];

    investmentDetails.forEach(({ label, value }) => {
      doc.setFont('helvetica', 'bold');
      doc.text(label, 25, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(String(value), 80, yPos);
      yPos += 7;
    });

    yPos += 12;

    // Terms and Conditions heading
    doc.setTextColor(...COLORS.primaryBlue);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('TERMS AND CONDITIONS', 105, yPos, { align: 'center' });
    yPos += 8;

    // Your full terms & conditions groups (unchanged)
    const termGroups = [
      [
        { text: "1. Agreement Overview", bold: true },
        "This Investment Agreement (\"Agreement\") is entered into between Nagolie Enterprises ",
        "(the \"Company\") and the investor named above (the \"Investor\"). The Investor agrees to",
        "invest the specified amount in the Company's livestock financing operations, and the Company",
        "agrees to manage the investment and provide returns as specified herein.",
        ""
      ],
       [
        { text: "2. Investment and Returns", bold: true },
        "The Investor shall invest the amount specified above. In consideration of this investment,",
        "the Company shall pay the Investor a return of 40% of the invested amount. The first return",
        "shall be paid after five (5) weeks from the investment date, and subsequent returns",
        "shall be paid every four (4) weeks thereafter.",
        "",
        "If the Investor requests an early return (before the scheduled return date), the Company",
        "may, at its discretion, process the early return subject to a fee of 15% of the expected",
        "return amount. In such a case, the Investor will receive 85% of the expected return amount.",
        ""
      ],
      [
        { text: "3. Investor Account Access", bold: true },
        "The Investor shall be provided with secure online access to an investor dashboard where",
        "they can monitor:",
        "- Real-time investment performance and returns history",
        "- Livestock held as collateral for the investment",
        "- Current valuation of livestock assets",
        "- Upcoming return dates and amounts",
        "- Company financial health indicators",
        "",
        "The Company shall ensure the investor dashboard is updated regularly with accurate",
        "information regarding the livestock collateral.",
        ""
      ],
      [
        { text: "4. Livestock as Collateral", bold: true },
        "The Investor's capital shall be secured by livestock owned and managed by the Company.",
        "The Company shall maintain detailed records of all livestock serving as collateral,",
        "including but not limited to:",
        "- Type, breed, and age of livestock",
        "- Current market valuation",
        "- Health status and veterinary records",
        "- Location and ownership documentation",
        "",
        "The Investor acknowledges that livestock are mortal assets and their value may fluctuate",
        "due to market conditions, health issues, or other factors beyond the Company's control.",
        ""
      ],
      [
        { text: "5. Risk Acknowledgment and Management", bold: true },
        "The Investor acknowledges and agrees that investing in livestock involves inherent risks,",
        "including but not limited to:",
        "- Mortality or illness of livestock",
        "- Market price fluctuations",
        "- Natural disasters or disease outbreaks",
        "- Theft or loss",
        "",
        "In the event of livestock loss that affects the collateral value, the Company and Investor",
        "shall negotiate in good faith to determine an appropriate loss allocation. The Company",
        "shall provide transparent documentation of any such incidents and their financial impact.",
        "Any loss allocation shall be mutually agreed upon in writing by both parties.",
        ""
      ],
      [
        { text: "6. Investment Term and Withdrawal", bold: true },
        "6.1 Investment Term:",
        "This investment shall continue until the Investor provides written notice of withdrawal",
        "as specified below.",
        "",
        "6.2 Withdrawal Process:",
        "Should the Investor wish to withdraw their investment, they must submit an official",
        "written request (withdrawal letter) to the Company's registered office. The request",
        "must include:",
        "- Investor's full name and ID number",
        "- Investment amount and date",
        "- Reason for withdrawal (optional)",
        "- Signature and date",
        "",
        "6.3 Withdrawal Timeline:",
        "Upon receipt of the official withdrawal request, the Company shall:",
        "- Immediately stop processing any further returns to the Investor",
        "- Have a period of ninety (90) days to return the full invested amount to the Investor",
        "",
        "6.4 Purpose of 90-Day Period:",
        "The 90-day period allows the Company adequate time to:",
        "- Make proper logistical arrangements",
        "- Liaise with clients to gather funds without disrupting ongoing operations",
        "- Ensure orderly liquidation of livestock collateral if necessary",
        "- Complete all administrative and financial processes",
        "",
        "6.5 Early Withdrawal:",
        "Withdrawal requests submitted before the completion of twelve (12) months from the",
        "investment date shall be considered early withdrawals and may be subject to:",
        "- A processing fee of up to 5% of the principal amount",
        "- Extended processing time at the Company's discretion",
        "",
        "6.6 Force Majeure:",
        "In the event of circumstances beyond the Company's control (force majeure) that affect",
        "the ability to process withdrawals within 90 days, the Company shall notify the Investor",
        "in writing and propose a revised timeline.",
        ""
      ],
      [
        { text: "7. Company Obligations", bold: true },
        "The Company shall:",
        "- Provide quarterly financial statements to the Investor",
        "- Notify the Investor of any material changes to the livestock portfolio",
        "- Ensure proper care and veterinary attention for all livestock",
        "- Maintain separate accounting for investor funds",
        "- Process withdrawal requests in accordance with Clause 6",
        ""
      ],
      [
        { text: "8. Investor Obligations", bold: true },
        "The Investor shall:",
        "- Provide accurate personal information for account setup",
        "- Maintain the confidentiality of their investor account credentials",
        "- Notify the Company of any changes to contact information",
        "- Review investment reports and statements promptly",
        "- Submit withdrawal requests in writing as specified in Clause 6",
        ""
      ],
      [
        { text: "9. Dispute Resolution", bold: true },
        "Any disputes arising from this Agreement shall first be addressed through mutual",
        "negotiation between the parties. If unresolved, disputes shall be referred to mediation",
        "in accordance with the laws of Kenya. The courts of Kajiado County shall have exclusive",
        "jurisdiction over any legal proceedings.",
        ""
      ],
      [
        { text: "10. Governing Law", bold: true },
        "This Agreement shall be governed by and construed in accordance with the laws of Kenya.",
        "All matters relating to this investment shall be subject to Kenyan financial regulations",
        "and agricultural investment guidelines.",
        ""
      ],
      [
        { text: "11. Entire Agreement", bold: true },
        "This document constitutes the entire agreement between the parties and supersedes all",
        "prior discussions and understandings. No modification shall be effective unless in",
        "writing and signed by both parties.",
        ""
      ]
    ];

    // Set font explicitly before terms
    doc.setFontSize(10.5);
    doc.setFont('helvetica', 'normal');
    
    termGroups.forEach((group, groupIndex) => {
      const groupHeight = group.length * 4.5;

      if (yPos + groupHeight > 250 && groupIndex > 0) {
        doc.addPage();
        // Add watermark to new page FIRST, before any content
        addWatermarkToCurrentPage(doc, 'investor');
        // Reset font state after watermark
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10.5);
        yPos = 20;
      }

      group.forEach(line => {
        if (typeof line === 'object' && line.bold) {
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(...COLORS.primaryBlue);
          doc.text(line.text, 20, yPos);
          // Reset to normal for next line
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(...COLORS.textDark);
        } else {
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(...COLORS.textDark);
          doc.text(line, 20, yPos);
        }
        yPos += 4.5;
      });
    });

    yPos += 8;

    // Add a new page if needed for signatures
    if (yPos > 180) {
      doc.addPage();
      // Add watermark to new page FIRST, before any content
      addWatermarkToCurrentPage(doc, 'investor');
      // Reset font state after watermark
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(12);
      yPos = 20;
    }

    // Signature Section
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('SIGNATURES', 105, yPos, { align: 'center' });
    yPos += 12;

    // Investor Section
    doc.setFontSize(12);
    doc.text('INVESTOR:', 20, yPos);
    yPos += 8;

    doc.setFont('helvetica', 'bold');
    doc.text('NAME:', 25, yPos);
    doc.text(`${(investor.name || '').toUpperCase() || '___________________'}`, 70, yPos);
    yPos += 6;

    doc.text('ID NUMBER:', 25, yPos);
    doc.text(`${investor.id_number || '___________________'}`, 70, yPos);
    yPos += 6;

    doc.text('RETURNS DISBURSMENT ACCOUNT NUMBER:', 25, yPos);
    doc.text('___________________', 130, yPos);
    yPos += 6;

    doc.text('SIGNATURE:', 25, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text('___________________', 70, yPos);
    yPos += 6;

    doc.text('DATE:', 25, yPos);
    doc.text('___________________', 70, yPos);

    yPos += 15;

    // Company/Director Section
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('FOR AND ON BEHALF OF NAGOLIE ENTERPRISES:', 20, yPos);
    yPos += 8;

    doc.text('DIRECTOR:', 25, yPos);
    doc.text('SHADRACK KESUMET', 70, yPos);
    yPos += 6;

    doc.text('SIGNATURE:', 25, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text('___________________', 70, yPos);
    yPos += 6;

    doc.text('DATE:', 25, yPos);
    doc.text('___________________', 70, yPos);

    yPos += 15;

    // Company Stamp Box
    const stampBoxY = yPos;
    const stampBoxWidth = 60;
    const stampBoxHeight = 35;
    const stampBoxX = (210 - stampBoxWidth) / 2;

    doc.setDrawColor(230, 235, 245);
    doc.setLineWidth(0.3);
    doc.roundedRect(stampBoxX, stampBoxY, stampBoxWidth, stampBoxHeight, 2, 2);

    doc.setTextColor(230, 235, 240);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.text('OFFICIAL COMPANY STAMP', stampBoxX + (stampBoxWidth / 2), stampBoxY + (stampBoxHeight / 2), { align: 'center' });

    // Footer
    const footerY = 270;
    doc.setTextColor(...COLORS.textLight);
    doc.setFontSize(8);
    doc.text(`Generated on: ${new Date().toLocaleDateString('en-GB')} at ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`, 20, footerY);

    doc.setTextColor(...COLORS.textDark);
    doc.setFontSize(9);
    doc.text('Thank you for investing with Nagolie Enterprises!', 105, footerY + 6, { align: 'center' });

    addPageNumbers(doc, 'page %d');

    // Save PDF
    const fileName = `Investment_Agreement_${(investor.name || '').replace(/\s+/g, '_') || 'Investor'}_${formattedDate.replace(/\//g, '-')}.pdf`;
    doc.save(fileName);

  } catch (error) {
    console.error('Error generating investor agreement:', error);
    throw error;
  }
};

// ================= AUTO‑FILLED NEXT OF KIN CONSENT =================
export const generateNextOfKinConsentPDF = async (loanData) => {
  try {
    const doc = new jsPDF();

    addOptimizedWatermark(doc, 'agreement');

    let yPos = await addHeader(doc, 10);

    const currentDate = new Date();
    const formattedDate = currentDate.toLocaleDateString('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });

    // Main Title
    doc.setTextColor(...COLORS.primaryBlue);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('NEXT OF KIN CONSENT FORM', 105, yPos, { align: 'center' });
    yPos += 10;

    yPos = addDivider(doc, yPos);

    // Loan Reference Information Header
    doc.setTextColor(...COLORS.primaryBlue);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('LOAN REFERENCE INFORMATION', 105, yPos, { align: 'center' });
    yPos += 12;

    // Loan Reference Information – auto‑filled
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.textDark);

    // First row: Borrower's Name and ID Number
    doc.setFont('helvetica', 'bold');
    doc.text("Borrower's Name:", 20, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(loanData?.name || '___________________________', 55, yPos);

    doc.setFont('helvetica', 'bold');
    doc.text("ID Number:", 120, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(loanData?.idNumber || '_________________', 150, yPos);

    yPos += 10;

    // Second row: Loan Amount and Loan Date
    doc.setFont('helvetica', 'bold');
    doc.text("Loan Amount:", 20, yPos);
    doc.setFont('helvetica', 'normal');
    const loanAmount = loanData?.loanAmount
      ? `KSh ${loanData.loanAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
      : '___________________';
    doc.text(loanAmount, 55, yPos);

    doc.setFont('helvetica', 'bold');
    doc.text("Loan Date:", 120, yPos);
    doc.setFont('helvetica', 'normal');
    const loanDate = loanData?.date
      ? new Date(loanData.date).toLocaleDateString('en-GB')
      : '_________________';
    doc.text(loanDate, 150, yPos);

    yPos += 10;

    // Consent Statement Header
    doc.setTextColor(...COLORS.primaryBlue);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('CONSENT AND ACKNOWLEDGEMENT STATEMENT', 105, yPos, { align: 'center' });
    yPos += 12;

    // Consent Statement paragraph
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.textDark);

    const consentParagraph = "I, the undersigned Next of Kin to the above-named Borrower, hereby acknowledge and consent that:\n\n" +
      "1. I am fully aware that the Borrower is taking a livestock financing loan from Nagolie Enterprises.\n" +
      "2. I have read, understood, and consent to all the terms and conditions of the loan agreement between the Borrower and Nagolie Enterprises.\n" +
      "3. I acknowledge that the livestock specified in the loan agreement will serve as collateral for this loan.\n" +
      "4. I understand the implications of default as outlined in the loan agreement.\n" +
      "5. I agree to act as a point of contact in matters relating to this loan.\n" +
      "6. In the event of default, I understand that Nagolie Enterprises will provide notice and has the absolute right to claim, take possession of, and remove the collateral livestock without further notice, whether I am present or not, after the second missed payment date.\n" +
      "7. I will cooperate with Nagolie Enterprises in their recovery efforts should the need arise.";

    const consentLines = doc.splitTextToSize(consentParagraph, 170);
    consentLines.forEach(line => {
      if (yPos > 250) {
        doc.addPage();
        addWatermarkToCurrentPage(doc, 'agreement');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        yPos = 20;
      }
      doc.text(line, 20, yPos);
      yPos += 6;
    });

    yPos += 8;

    // Next of Kin Details Header
    doc.setTextColor(...COLORS.primaryBlue);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('NEXT OF KIN DETAILS', 105, yPos, { align: 'center' });
    yPos += 10;

    // Next of Kin Information
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.textDark);

    // First row: Full Name and ID Number
    doc.setFont('helvetica', 'bold');
    doc.text("Full Name:", 20, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text("__________________________", 55, yPos);

    doc.setFont('helvetica', 'bold');
    doc.text("ID Number:", 120, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text("_________________", 150, yPos);

    yPos += 10;

    // Second row: Relationship and Phone Number
    doc.setFont('helvetica', 'bold');
    doc.text("Relationship:", 20, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text("__________________________", 55, yPos);

    doc.setFont('helvetica', 'bold');
    doc.text("Phone Number:", 120, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text("_________________", 150, yPos);

    yPos += 10;

    // Third row: signature and date
    doc.setFont('helvetica', 'bold');
    doc.text("Signature:", 20, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text("__________________________", 55, yPos);

    doc.setFont('helvetica', 'bold');
    doc.text("Date:", 120, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text("_________________", 150, yPos);

    yPos += 12;

    // ---- Helper: draw thumbprint box with checkboxes ----
    const drawThumbprintBox = (x, y, width = 30, height = 25) => {
      doc.setDrawColor(230, 235, 245);
      doc.setLineWidth(0.3);
      doc.roundedRect(x, y, width, height, 2, 2);
      doc.setTextColor(230, 235, 240);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.text('THUMB PRINT', x + width / 2, y + height / 2, { align: 'center' });
    };

    const drawRtLtCheckboxes = (x, y) => {
      doc.setTextColor(...COLORS.textDark);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.3);
      doc.rect(x + 15, y, 4, 4);
      doc.text('Right Thumb', x + 20, y + 3.5);
      doc.rect(x + 45, y, 4, 4);
      doc.text('Left Thumb', x + 50, y + 3.5);
    };

    // ---- Layout: stamp on left, thumbprint on right ----
    const boxWidth = 60;
    const boxHeight = 35;
    const leftX = 20;
    const rightX = 210 - 20 - boxWidth;
    const boxesY = yPos;

    // Draw stamp box (left)
    doc.setDrawColor(230, 235, 245);
    doc.setLineWidth(0.3);
    doc.roundedRect(leftX, boxesY, boxWidth, boxHeight, 2, 2);
    const stampCenterX = leftX + boxWidth / 2;
    const stampCenterY = boxesY + boxHeight / 2;
    doc.setTextColor(230, 235, 240);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.text('OFFICIAL COMPANY STAMP', stampCenterX, stampCenterY - 3, { align: 'center' });
    doc.text('(To be affixed here)', stampCenterX, stampCenterY + 3, { align: 'center' });

    // Draw thumbprint box (right)
    drawThumbprintBox(rightX, boxesY, boxWidth, boxHeight);
    const checkY = boxesY + boxHeight + 4;
    const groupWidth = 50 + 5 + 20;
    const checkX = rightX + (boxWidth / 2) - (groupWidth / 2);
    drawRtLtCheckboxes(checkX, checkY);
    yPos = checkY + 12;

    // Footer (first page)
    doc.setTextColor(...COLORS.textLight);
    doc.setFontSize(8);
    doc.text(`Generated on: ${new Date().toLocaleDateString('en-GB')}`, 20, 287);
    doc.setTextColor(...COLORS.textDark);
    doc.setFontSize(9);
    doc.text(COMPANY_INFO.tagline, 105, 285, { align: 'center' });

    // ========== PAGE 2: TERMS AND CONDITIONS (updated with new clause 5 & 5.1) ==========
    doc.addPage();
    addWatermarkToCurrentPage(doc, 'agreement');
    yPos = 20;

    doc.setTextColor(...COLORS.primaryBlue);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('LOAN AGREEMENT TERMS AND CONDITIONS', 105, yPos, { align: 'center' });
    yPos += 8;
    yPos = addDivider(doc, yPos);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(...COLORS.textDark);
    doc.text("Reference copy for Next of Kin review", 105, yPos, { align: 'center' });
    yPos += 15;
    doc.setTextColor(...COLORS.primaryBlue);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('TERMS AND CONDITIONS', 105, yPos, { align: 'center' });
    yPos += 8;

    // Updated termGroups with new Clause 5 and 5.1
    const termGroups = [
      // 1. Agreement Overview
      [
        { text: "1. Agreement Overview", heading: true },
        "This Livestock Financing Agreement (\"Agreement\") is entered into between the applicant (\"Recipient\") and",
        " Nagolie Enterprises (\"Company\"). The Recipient acknowledges receipt of a loan from Nagolie Enterprises, secured",
        "  by the specified livestock, which shall become the property of Nagolie Enterprises until the loan is fully repaid.",
        ""
      ],
      // 2. Ownership Transfer and Custody (without 2.3)
      [
        { text: "2. Ownership Transfer and Custody", heading: true },
        "Upon disbursement of the loan, legal ownership of the specified livestock transfers to Nagolie Enterprises,",
        " with the Recipient maintaining physical custody.",
        "The Recipient agrees to:",
        "- Provide proper care and maintenance for the livestock",
        "- Ensure the livestock are kept in good health",
        "- Not sell, transfer, or dispose of the livestock without prior written consent from the Company",
        "- Allow Company representatives access to inspect the livestock at reasonable times",
        "",
        { text: "2.1. Absolute Right of Claim Upon Default:", subheading: true },
        "In the event of default, the Company reserves the absolute right to claim, take possession of, and remove the",
        " collateral livestock without further notice.",
        "This right extends to claiming the livestock:",
        "- In the presence OR absence of the Recipient",
        "- In the presence OR absence of the Next of Kin or any family members",
        "- Without requirement for additional consent or permission from any party",
        "",
        { text: "2.2. Immediate Action for Recovery:", subheading: true },
        "The Company shall not be delayed or hindered in its recovery efforts by the unavailability, resistance, or objections",
        "  of the Recipient, Next of Kin, or any related parties.",
        "The Company's representatives, including livestock valuers and security personnel, are authorized to take immediate",
        "  action to secure the Company's property and recover losses without legal impediment.",
        ""
      ],
      // 3. Repayment Terms and Interest (both plans, plain text)
      [
        { text: "3. Repayment Terms and Interest", heading: true },
        "The loan is repayable under one of the following plans selected by the Recipient at the time of disbursement",
        "(please tick one plan below):",
        "",
        "Weekly Plan:",
        "",
        "The loan is repayable within seven (7) days from the date of disbursement with an interest of 30% (negotiable)",
        "of the disbursed funds. The weekly interest rate of thirty percent (30%) constitutes a comprehensive charge",
        "inclusive of all ancillary costs related to the loan, including but not limited to processing fees,",
        "valuation costs, and veterinary care expenses where applicable. Such charges are applied to facilitate",
        "due diligence, risk management, and ongoing asset maintenance during the tenure of the loan.",
        "Interest shall be charged on a weekly basis for a",
        "maximum period of two (2) weeks. After two (2) weeks, if the loan is not fully repaid, no further interest will",
        "accrue. The Recipient must then either:",
        " (a) repay the outstanding loan balance in full, or ",
        " (b) sign a compulsory Loan Renewal Agreement with the Company to extend the repayment period.",
        "",
        "Daily Plan:",
        "",
        "The loan is repayable with an interest of 4.5% per day. Interest shall be",
        "charged daily for a maximum period of two (2) weeks. After two (2) weeks, if the loan is not fully repaid, no",
        "further interest will accrue. The Recipient must then either:",
        " (a) repay the outstanding loan balance in full, or",
        " (b) sign a compulsory Loan Renewal Agreement with the Company to extend the repayment period.",
        "",
        "The interest for this loan is Ksh________",
        "",
        "A loan shall only be deemed fully repaid and settled upon payment in full of the entire outstanding principal",
        "amount together with all accrued interest and any applicable charges. Partial payments, including payment of",
        "interest alone, shall not constitute settlement or discharge of the loan obligation.",
        "",
        "Recognizing the circumstances of local communities, the Director of Nagolie Enterprises may at their",
        "discretion grant an extension of the repayment period after consultation with the Recipient. Any extension",
        "must be agreed upon in writing by both parties, specifying the new repayment date.",
        ""
      ],
      // 4. Loan Settlement and Ownership Return
      [
        { text: "4. Loan Settlement and Ownership Return", heading: true },
        "Upon full repayment of the loan principal plus agreed interest:",
        "- Legal ownership of the livestock reverts to the Recipient",
        "- All rights and responsibilities regarding the livestock return to the Recipient",
        ""
      ],
      // 5. Livestock Valuation & Value Chain Classification (updated)
      [
        { text: "5. Livestock Valuation & Value Chain Classification", heading: true },
        "All livestock shall be valued by an authorized Livestock Valuer appointed by Nagolie Enterprises.",
        "The valuation shall be final and binding for determining the maximum loan amount.",
        "",
        "In addition to standard valuation, each livestock asset shall be classified according to its economic production ",
        "role within the agricultural value chain.",
        "",
        { text: "5.1 Value Chain Integration and Utilization", subheading: true },
        "Nagolie Enterprises Ltd recognizes livestock as productive assets within the agricultural value chain.",
        "Where applicable, the Company reserves the right to:",
        "  • Monitor the productivity of the collateral livestock",
        "  • Provide advisory or support services to enhance value generation",
        "  • Utilize classification insights to optimize asset value in the event of recovery, resale, or risk management",
        "The Recipient acknowledges that livestock classification may influence the loan amounts, risk evaluation and ",
        "recovery strategy in the event of default.",
        ""
      ],
      // 6. Default and Remedies
      [
        { text: "6. Default and Remedies", heading: true },
        "Failure to repay the loan by the due date (including any agreed extension) shall constitute default, entitling",
        "  Nagolie Enterprises to:",
        "- Charge compounded interest on the outstanding amount after every seven (7) days until full repayment",
        "- Take immediate possession of the livestock in holding for 30 days to allow the Recipient to repay or sign a",
        "   renewal agreement",
        "- Sell the livestock to recover the outstanding loan amount if payment is not made within the 30 days holding period",
        "- Initiate legal proceedings for recovery of any remaining balance",
        "- Charge interest on overdue amounts at the prevailing market rate",
        ""
      ],
      // 7. Governing Law
      [
        { text: "7. Governing Law", heading: true },
        "This agreement shall be governed by and construed in accordance with the laws of Kenya. Any disputes arising",
        "  from this agreement shall be subject to the exclusive jurisdiction of the courts of Kenya.",
        ""
      ],
      // 8. Entire Agreement
      [
        { text: "8. Entire Agreement", heading: true },
        "This document constitutes the entire agreement between the parties and supersedes all prior discussions,",
        " negotiations, and agreements. No modification of this agreement shall be effective unless in writing and",
        " signed by both parties.",
        ""
      ]
    ];

    // Render term groups
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.textDark);

    for (const group of termGroups) {
      for (const line of group) {
        if (typeof line === 'object' && line.heading) {
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(...COLORS.primaryBlue);
          doc.text(line.text, 20, yPos);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(...COLORS.textDark);
        } else if (typeof line === 'object' && line.subheading) {
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(...COLORS.primaryBlue);
          doc.text(line.text, 20, yPos);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(...COLORS.textDark);
        } else {
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(...COLORS.textDark);
          doc.text(String(line), 20, yPos);
        }
        yPos += 4.2;
        if (yPos > 280) {
          doc.addPage();
          addWatermarkToCurrentPage(doc, 'agreement');
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          yPos = 20;
        }
      }
    }

    addPageNumbers(doc, 'page %d');

    const fileName = `Next_of_Kin_Consent_${loanData?.name?.replace(/\s+/g, '_') || 'Client'}_${formattedDate.replace(/\//g, '-')}.pdf`;
    doc.save(fileName);

  } catch (error) {
    console.error('Error generating next of kin consent form:', error);
    throw error;
  }
};

// ================= MANUAL NEXT OF KIN CONSENT =================
export const generateManualNextOfKinConsentPDF = async () => {
  try {
    const doc = new jsPDF();

    addOptimizedWatermark(doc, 'agreement');

    let yPos = await addHeader(doc, 10);

    const currentDate = new Date();
    const formattedDate = currentDate.toLocaleDateString('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });

    // Main Title
    doc.setTextColor(...COLORS.primaryBlue);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('NEXT OF KIN CONSENT FORM', 105, yPos, { align: 'center' });
    yPos += 10;

    yPos = addDivider(doc, yPos);

    // Loan Reference Information Header
    doc.setTextColor(...COLORS.primaryBlue);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('LOAN REFERENCE INFORMATION', 105, yPos, { align: 'center' });
    yPos += 12;

    // Loan Reference Information – all blanks
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.textDark);

    doc.setFont('helvetica', 'bold');
    doc.text("Borrower's Name:", 20, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text("__________________________", 55, yPos);

    doc.setFont('helvetica', 'bold');
    doc.text("ID Number:", 120, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text("_________________", 150, yPos);

    yPos += 10;

    doc.setFont('helvetica', 'bold');
    doc.text("Loan Amount:", 20, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text("___________________", 55, yPos);

    doc.setFont('helvetica', 'bold');
    doc.text("Loan Date:", 120, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text("_________________", 150, yPos);

    yPos += 10;

    // Consent Statement Header
    doc.setTextColor(...COLORS.primaryBlue);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('CONSENT AND ACKNOWLEDGEMENT STATEMENT', 105, yPos, { align: 'center' });
    yPos += 12;

    // Consent Statement paragraph
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.textDark);

    const consentParagraph = "I, the undersigned Next of Kin to the above-named Borrower, hereby acknowledge and consent that:\n\n" +
      "1. I am fully aware that the Borrower is taking a livestock financing loan from Nagolie Enterprises.\n" +
      "2. I have read, understood, and consent to all the terms and conditions of the loan agreement between the Borrower and Nagolie Enterprises.\n" +
      "3. I acknowledge that the livestock specified in the loan agreement will serve as collateral for this loan.\n" +
      "4. I understand the implications of default as outlined in the loan agreement.\n" +
      "5. I agree to act as a point of contact in matters relating to this loan.\n" +
      "6. In the event of default, I understand that Nagolie Enterprises will provide notice and has the absolute right to claim, take possession of, and remove the collateral livestock without further notice, whether I am present or not , after the second missed payment date.\n" +
      "7. I will cooperate with Nagolie Enterprises in their recovery efforts should the need arise.";

    const consentLines = doc.splitTextToSize(consentParagraph, 170);
    consentLines.forEach(line => {
      if (yPos > 250) {
        doc.addPage();
        addWatermarkToCurrentPage(doc, 'agreement');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        yPos = 20;
      }
      doc.text(line, 20, yPos);
      yPos += 6;
    });

    yPos += 8;

    // Next of Kin Details Header
    doc.setTextColor(...COLORS.primaryBlue);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('NEXT OF KIN DETAILS', 105, yPos, { align: 'center' });
    yPos += 10;

    // Next of Kin Information
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.textDark);

    doc.setFont('helvetica', 'bold');
    doc.text("Full Name:", 20, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text("__________________________", 55, yPos);

    doc.setFont('helvetica', 'bold');
    doc.text("ID Number:", 120, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text("_________________", 150, yPos);

    yPos += 10;

    doc.setFont('helvetica', 'bold');
    doc.text("Relationship:", 20, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text("__________________________", 55, yPos);

    doc.setFont('helvetica', 'bold');
    doc.text("Phone Number:", 120, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text("_________________", 150, yPos);

    yPos += 10;

    // Signature and date
    doc.setFont('helvetica', 'bold');
    doc.text("Signature:", 20, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text("__________________________", 55, yPos);

    doc.setFont('helvetica', 'bold');
    doc.text("Date:", 120, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text("_________________", 150, yPos);

    yPos += 12;

    const drawThumbprintBox = (x, y, width = 30, height = 25) => {
      doc.setDrawColor(230, 235, 245);
      doc.setLineWidth(0.3);
      doc.roundedRect(x, y, width, height, 2, 2);
      doc.setTextColor(230, 235, 240);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.text('THUMB PRINT', x + width / 2, y + height / 2, { align: 'center' });
    };

    const drawRtLtCheckboxes = (x, y) => {
      doc.setTextColor(...COLORS.textDark);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.3);
      doc.rect(x + 15, y, 4, 4);
      doc.text('Right Thumb', x + 20, y + 3.5);
      doc.rect(x + 45, y, 4, 4);
      doc.text('Left Thumb', x + 50, y + 3.5);
    };

    const boxWidth = 60;
    const boxHeight = 35;
    const leftX = 20;
    const rightX = 210 - 20 - boxWidth;
    const boxesY = yPos;

    let stampBase64 = null;
    try {
      stampBase64 = await getLogoBase64('/nagolie-stamp-manual.png');
    } catch (error) {
      console.warn('Failed to load stamp image:', error);
    }

    if (stampBase64) {
      doc.addImage(stampBase64, 'PNG', leftX, boxesY, boxWidth, boxHeight);
    } else {
      doc.setDrawColor(230, 235, 245);
      doc.setLineWidth(0.3);
      doc.roundedRect(leftX, boxesY, boxWidth, boxHeight, 2, 2);
      const stampCenterX = leftX + boxWidth / 2;
      const stampCenterY = boxesY + boxHeight / 2;
      doc.setTextColor(230, 235, 240);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'italic');
      doc.text('OFFICIAL COMPANY STAMP', stampCenterX, stampCenterY - 3, { align: 'center' });
      doc.text('(To be affixed here)', stampCenterX, stampCenterY + 3, { align: 'center' });
    }

    drawThumbprintBox(rightX, boxesY, boxWidth, boxHeight);
    const checkY = boxesY + boxHeight + 4;
    const groupWidth = 50 + 5 + 20;
    const checkX = rightX + (boxWidth / 2) - (groupWidth / 2);
    drawRtLtCheckboxes(checkX, checkY);
    yPos = checkY + 12;

    // Footer first page
    doc.setTextColor(...COLORS.textLight);
    doc.setFontSize(8);
    doc.text(`Generated on: ${new Date().toLocaleDateString('en-GB')}`, 20, 285);
    doc.setTextColor(...COLORS.textDark);
    doc.setFontSize(9);
    doc.text(COMPANY_INFO.tagline, 105, 285, { align: 'center' });

    // ========== PAGE 2: TERMS AND CONDITIONS (updated with new clause 5 & 5.1) ==========
    doc.addPage();
    addWatermarkToCurrentPage(doc, 'agreement');
    yPos = 20;

    doc.setTextColor(...COLORS.primaryBlue);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('LOAN AGREEMENT TERMS AND CONDITIONS', 105, yPos, { align: 'center' });
    yPos += 8;
    yPos = addDivider(doc, yPos);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(...COLORS.textDark);
    doc.text("Reference copy for Next of Kin review", 105, yPos, { align: 'center' });
    yPos += 15;
    doc.setTextColor(...COLORS.primaryBlue);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('TERMS AND CONDITIONS', 105, yPos, { align: 'center' });
    yPos += 8;

    // Updated termGroups (same as in auto next of kin)
    const termGroups = [
      [
        { text: "1. Agreement Overview", heading: true },
        "This Livestock Financing Agreement (\"Agreement\") is entered into between the applicant (\"Recipient\") and",
        " Nagolie Enterprises (\"Company\"). The Recipient acknowledges receipt of a loan from Nagolie Enterprises, secured",
        "  by the specified livestock, which shall become the property of Nagolie Enterprises until the loan is fully repaid.",
        ""
      ],
      [
        { text: "2. Ownership Transfer and Custody", heading: true },
        "Upon disbursement of the loan, legal ownership of the specified livestock transfers to Nagolie Enterprises,",
        " with the Recipient maintaining physical custody.",
        "The Recipient agrees to:",
        "- Provide proper care and maintenance for the livestock",
        "- Ensure the livestock are kept in good health",
        "- Not sell, transfer, or dispose of the livestock without prior written consent from the Company",
        "- Allow Company representatives access to inspect the livestock at reasonable times",
        "",
        { text: "2.1. Absolute Right of Claim Upon Default:", subheading: true },
        "In the event of default, the Company reserves the absolute right to claim, take possession of, and remove the",
        " collateral livestock without further notice.",
        "This right extends to claiming the livestock:",
        "- In the presence OR absence of the Recipient",
        "- In the presence OR absence of the Next of Kin or any family members",
        "- Without requirement for additional consent or permission from any party",
        "",
        { text: "2.2. Immediate Action for Recovery:", subheading: true },
        "The Company shall not be delayed or hindered in its recovery efforts by the unavailability, resistance, or objections",
        "  of the Recipient, Next of Kin, or any related parties.",
        "The Company's representatives, including livestock valuers and security personnel, are authorized to take immediate",
        "  action to secure the Company's property and recover losses without legal impediment.",
        ""
      ],
      [
        { text: "3. Repayment Terms and Interest", heading: true },
        "The loan is repayable under one of the following plans selected by the Recipient at the time of disbursement",
        "(please tick one plan below):",
        "",
        "Weekly Plan:",
        "",
        "The loan is repayable within seven (7) days from the date of disbursement with an interest of 30% (negotiable)",
        "of the disbursed funds. The weekly interest rate of thirty percent (30%) constitutes a comprehensive charge",
        "inclusive of all ancillary costs related to the loan, including but not limited to processing fees,",
        "valuation costs, and veterinary care expenses where applicable. Such charges are applied to facilitate",
        "due diligence, risk management, and ongoing asset maintenance during the tenure of the loan.",
        "Interest shall be charged on a weekly basis for a",
        "maximum period of two (2) weeks. After two (2) weeks, if the loan is not fully repaid, no further interest will",
        "accrue. The Recipient must then either:",
        " (a) repay the outstanding loan balance in full, or ",
        " (b) sign a compulsory Loan Renewal Agreement with the Company to extend the repayment period.",
        "",
        "Daily Plan:",
        "",
        "The loan is repayable with an interest of 4.5% per day. Interest shall be",
        "charged daily for a maximum period of two (2) weeks. After two (2) weeks, if the loan is not fully repaid, no",
        "further interest will accrue. The Recipient must then either:",
        " (a) repay the outstanding loan balance in full, or",
        " (b) sign a compulsory Loan Renewal Agreement with the Company to extend the repayment period.",
        "",
        "The interest for this loan is Ksh________",
        "",
        "A loan shall only be deemed fully repaid and settled upon payment in full of the entire outstanding principal",
        "amount together with all accrued interest and any applicable charges. Partial payments, including payment of",
        "interest alone, shall not constitute settlement or discharge of the loan obligation.",
        "",
        "Recognizing the circumstances of local communities, the Director of Nagolie Enterprises may at their",
        "discretion grant an extension of the repayment period after consultation with the Recipient. Any extension",
        "must be agreed upon in writing by both parties, specifying the new repayment date.",
        ""
      ],
      [
        { text: "4. Loan Settlement and Ownership Return", heading: true },
        "Upon full repayment of the loan principal plus agreed interest:",
        "- Legal ownership of the livestock reverts to the Recipient",
        "- All rights and responsibilities regarding the livestock return to the Recipient",
        ""
      ],
      // Updated Clause 5
      [
        { text: "5. Livestock Valuation & Value Chain Classification", heading: true },
        "All livestock shall be valued by an authorized Livestock Valuer appointed by Nagolie Enterprises.",
        "The valuation shall be final and binding for determining the maximum loan amount.",
        "",
        "In addition to standard valuation, each livestock asset shall be classified according to its economic production ",
        "role within the agricultural value chain.",
        "",
        { text: "5.1 Value Chain Integration and Utilization", subheading: true },
        "Nagolie Enterprises Ltd recognizes livestock as productive assets within the agricultural value chain.",
        "Where applicable, the Company reserves the right to:",
        "  • Monitor the productivity of the collateral livestock",
        "  • Provide advisory or support services to enhance value generation",
        "  • Utilize classification insights to optimize asset value in the event of recovery, resale, or risk management",
        "The Recipient acknowledges that livestock classification may influence the loan amounts, risk evaluation and ",
        "recovery strategy in the event of default.",
        ""
      ],
      [
        { text: "6. Default and Remedies", heading: true },
        "Failure to repay the loan by the due date (including any agreed extension) shall constitute default, entitling",
        "  Nagolie Enterprises to:",
        "- Charge compounded interest on the outstanding amount after every seven (7) days until full repayment",
        "- Take immediate possession of the livestock in holding for 30 days to allow the Recipient to repay or sign a",
        "   renewal agreement",
        "- Sell the livestock to recover the outstanding loan amount if payment is not made within the 30-day holding period",
        "- Initiate legal proceedings for recovery of any remaining balance",
        "- Charge interest on overdue amounts at the prevailing market rate",
        ""
      ],
      [
        { text: "7. Governing Law", heading: true },
        "This agreement shall be governed by and construed in accordance with the laws of Kenya. Any disputes arising",
        "  from this agreement shall be subject to the exclusive jurisdiction of the courts of Kenya.",
        ""
      ],
      [
        { text: "8. Entire Agreement", heading: true },
        "This document constitutes the entire agreement between the parties and supersedes all prior discussions,",
        " negotiations, and agreements. No modification of this agreement shall be effective unless in writing and",
        " signed by both parties.",
        ""
      ]
    ];

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.textDark);

    for (const group of termGroups) {
      for (const line of group) {
        if (typeof line === 'object' && line.heading) {
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(...COLORS.primaryBlue);
          doc.text(line.text, 20, yPos);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(...COLORS.textDark);
        } else if (typeof line === 'object' && line.subheading) {
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(...COLORS.primaryBlue);
          doc.text(line.text, 20, yPos);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(...COLORS.textDark);
        } else {
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(...COLORS.textDark);
          doc.text(String(line), 20, yPos);
        }
        yPos += 4.2;
        if (yPos > 280) {
          doc.addPage();
          addWatermarkToCurrentPage(doc, 'agreement');
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          yPos = 20;
        }
      }
    }

    addPageNumbers(doc, 'page %d');

    const fileName = `Next_of_Kin_Consent_Form.pdf`;
    doc.save(fileName);

  } catch (error) {
    console.error('Error generating next of kin consent form:', error);
    throw error;
  }
};

// Helper function
const formatNumber = (num) => {
  return num ? num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") : "0";
};

// Generate Investor Statement PDF
export const generateInvestorStatementPDF = async (investor, transactions = []) => {
  try {
    const doc = new jsPDF();
    
    // ADD OPTIMIZED WATERMARK FIRST
    addOptimizedWatermark(doc, 'statement');
    
    let yPos = await addHeader(doc);
    
    // Title
    doc.setTextColor(...COLORS.primaryBlue);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('INVESTOR STATEMENT', 105, yPos, { align: 'center' });
    yPos += 8;
    
    yPos = addDivider(doc, yPos);
    
    // Investor Information Section
    doc.setTextColor(...COLORS.textDark);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('INVESTOR INFORMATION', 20, yPos);
    yPos += 8;
    
    const investorDetails = [
      { label: 'Full Name:', value: investor.name || 'N/A' },
      { label: 'Phone Number:', value: investor.phone || 'N/A' },
      { label: 'ID Number:', value: String(investor.id_number || 'N/A') },
      { label: 'Email:', value: investor.email || 'N/A' }
    ];
    
    investorDetails.forEach(({ label, value }) => {
      doc.setFont('helvetica', 'bold');
      doc.text(label, 25, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(String(value), 60, yPos);
      yPos += 6;
    });
    
    yPos += 10;
    
    // Investment Summary Section
    doc.setFont('helvetica', 'bold');
    doc.text('INVESTMENT SUMMARY', 20, yPos);
    yPos += 8;
    
    const RETURN_PERCENTAGE = 40;
    const expectedReturnAmount = (investor.investment_amount || 0) * (RETURN_PERCENTAGE / 100);
    
    const investmentDetails = [
      { label: 'Investment Amount:', value: `KES ${Number(investor.investment_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
      { label: 'Return Percentage:', value: `${RETURN_PERCENTAGE}%` },
      { label: 'Expected Return per Period:', value: `KES ${expectedReturnAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
      { label: 'Total Returns Received:', value: `KES ${Number(investor.total_returns_received || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
      { label: 'Investment Date:', value: investor.invested_date ? new Date(investor.invested_date).toLocaleDateString('en-GB') : 'N/A' },
      { label: 'Next Return Date:', value: investor.next_return_date ? new Date(investor.next_return_date).toLocaleDateString('en-GB') : 'N/A' },
      { label: 'Last Return Date:', value: investor.last_return_date ? new Date(investor.last_return_date).toLocaleDateString('en-GB') : 'N/A' },
      { label: 'Account Status:', value: investor.account_status ? investor.account_status.toUpperCase() : 'N/A' }
    ];
    
    investmentDetails.forEach(({ label, value }) => {
      doc.setFont('helvetica', 'bold');
      doc.text(label, 25, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(String(value), 75, yPos);
      yPos += 6;
    });
    
    yPos += 15;
    
    // Transaction History Section - FIXED FILTERING
    if (transactions && transactions.length > 0) {
      // Filter transactions for this investor - IMPROVED FILTERING
      const investorTxns = transactions.filter(txn => {
        // Check multiple possible ways the investor could be linked
        const txnInvestorId = txn.investor_id || txn.investorId || (txn.investor ? txn.investor.id : null);
        const txnInvestorName = txn.investor_name || (txn.investor ? txn.investor.name : null);
        
        console.log("Transaction filtering:", {
          txnId: txn.id,
          txnInvestorId,
          txnInvestorName,
          investorId: investor.id,
          investorName: investor.name,
          match: txnInvestorId === investor.id || 
                 (txnInvestorId && investor.id && txnInvestorId.toString() === investor.id.toString()) ||
                 txnInvestorName === investor.name ||
                 (txnInvestorName && investor.name && txnInvestorName.toLowerCase().includes(investor.name.toLowerCase()))
        });
        
        return (
          txnInvestorId === investor.id ||
          (txnInvestorId && investor.id && txnInvestorId.toString() === investor.id.toString()) ||
          txnInvestorName === investor.name ||
          (txnInvestorName && investor.name && txnInvestorName.toLowerCase().includes(investor.name.toLowerCase()))
        );
      });
      
      const sortedTxns = [...investorTxns].sort((a, b) => {
        const dateA = new Date(a.date || a.return_date || a.created_at || a.createdAt || 0);
        const dateB = new Date(b.date || b.return_date || b.created_at || b.createdAt || 0);
        return dateB - dateA; // Newest first
      });
      
      console.log("Filtered investor transactions:", {
        totalTransactions: transactions.length,
        filteredCount: investorTxns.length,
        investorTxns: investorTxns.map(t => ({
          id: t.id,
          type: t.type,
          amount: t.amount,
          investor_id: t.investor_id,
          investor_name: t.investor_name
        }))
      });
      
      if (sortedTxns.length > 0) {
        doc.setFont('helvetica', 'bold');
        doc.text('TRANSACTION HISTORY', 20, yPos);
        yPos += 10;
        
        // Table headers
        doc.setFillColor(...COLORS.primaryBlue);
        doc.setTextColor(...COLORS.white);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.rect(20, yPos, 170, 8, 'F');
        doc.text('Date', 25, yPos + 5.5);
        doc.text('Type', 55, yPos + 5.5);
        doc.text('Method', 85, yPos + 5.5);
        doc.text('Amount', 115, yPos + 5.5);
        doc.text('Reference', 145, yPos + 5.5);
        yPos += 8;
        
        // Transaction rows
        sortedTxns.forEach((transaction, index) => {
          if (yPos > 250) {
            doc.addPage();
            addWatermarkToCurrentPage(doc, 'statement');
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            yPos = 20;
          }
          
          // Alternate row colors
          if (index % 2 === 0) {
            doc.setFillColor(...COLORS.border);
            doc.rect(20, yPos, 170, 7, 'F');
          }
          
          const date = new Date(transaction.date || transaction.return_date || transaction.created_at || transaction.createdAt || Date.now()).toLocaleDateString('en-GB');
          
          // Get transaction type
          const transactionType = transaction.transaction_type || transaction.type || '';
          const type = formatInvestorTransactionTypeForStatement(transactionType);
          
          // Get payment method
          const method = transaction.payment_method || transaction.method || transaction.paymentMethod || 'N/A';
          
          const amount = `KES ${Number(transaction.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
          const reference = getInvestorTransactionReference(transaction);
          
          // Set text color based on transaction type
          doc.setTextColor(...COLORS.textDark);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.text(date, 25, yPos + 4.5);
          
          // Color for type
          const typeLower = type.toLowerCase();
          if (typeLower.includes('return')) {
            doc.setTextColor(0, 128, 0); // Green for returns
          } else if (typeLower.includes('topup') || typeLower.includes('adjustment') || typeLower.includes('increase') || typeLower.includes('decrease')) {
            doc.setTextColor(0, 0, 255); // Blue for adjustments
          } else if (typeLower.includes('initial')) {
            doc.setTextColor(139, 0, 139); // Purple for initial investment
          } else if (typeLower.includes('disbursement')) {
            doc.setTextColor(255, 140, 0); // Orange for disbursements
          } else {
            doc.setTextColor(...COLORS.textDark);
          }
          doc.text(type, 55, yPos + 4.5);
          
          // Reset for method and amount
          doc.setTextColor(...COLORS.textDark);
          doc.text(method.toUpperCase(), 85, yPos + 4.5);
          doc.text(amount, 115, yPos + 4.5);
          
          // Color for reference
          if (method.toLowerCase() === 'mpesa') {
            doc.setTextColor(...COLORS.green);
          } else {
            doc.setTextColor(...COLORS.textDark);
          }
          doc.text(reference, 145, yPos + 4.5);
          
          yPos += 7;
        });
      } else {
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(...COLORS.textLight);
        doc.text('No transactions recorded yet for this investor.', 25, yPos);
        yPos += 10;
      }
    } else {
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(...COLORS.textLight);
      doc.text('No transactions recorded yet.', 25, yPos);
      yPos += 10;
    }
    
    // Footer
    addFooter(doc, yPos);

    addPageNumbers(doc, 'page %d');
    
    // Save PDF
    const fileName = `Investor_Statement_${investor.name?.replace(/\s+/g, '_') || 'Investor'}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
  } catch (error) {
    console.error('Error generating investor statement:', error);
    throw error;
  }
};

const formatInvestorTransactionTypeForStatement = (type) => {
  if (!type) return 'N/A';
  
  const typeLower = type.toLowerCase();
  
  const typeMap = {
    'return': 'Investor Return',
    'investor_return': 'Investor Return',
    'topup': 'Investment Top-up',
    'investor_topup': 'Investment Top-up',
    'adjustment_up': 'Investment Increase',
    'investor_adjustment_up': 'Investment Increase',
    'adjustment_down': 'Investment Decrease',
    'investor_adjustment_down': 'Investment Decrease',
    'initial_investment': 'Initial Investment',
    'initial': 'Initial Investment',
    'disbursement': 'Loan Disbursement',
    'loan_disbursement': 'Loan Disbursement',
    'investor_topup': 'Investment Top-up',
    'mpesa': 'M-Pesa Payment',
    'bank': 'Bank Transfer',
    'cash': 'Cash Payment'
  };
  
  return typeMap[typeLower] || type.charAt(0).toUpperCase() + type.slice(1);
};

// Helper function for investor transaction reference
const getInvestorTransactionReference = (transaction) => {
  const method = (transaction.payment_method || transaction.method || '').toUpperCase();
  const type = transaction.transaction_type || transaction.type || '';
  
  if (method === 'MPESA' && (transaction.mpesa_receipt || transaction.mpesa_reference)) {
    return transaction.mpesa_receipt || transaction.mpesa_reference || 'MPESA';
  } else if (method === 'CASH') {
    return 'CASH';
  } else if (method === 'BANK') {
    return 'BANK TRANSFER';
  } else if (type === 'topup' || type === 'investor_topup') {
    return 'TOP-UP';
  } else if (type === 'initial_investment') {
    return 'INITIAL';
  } else if (type === 'return' || type === 'investor_return') {
    return 'RETURN';
  } else {
    return `TXN-${transaction.id || 'REF'}`;
  }
};

export const generateInvestorTransactionReceipt = async (transaction) => {
  try {
    const doc = new jsPDF();
    
    // ADD OPTIMIZED WATERMARK FIRST
    addOptimizedWatermark(doc, 'receipt');
    
    let yPos = await addHeader(doc);
  
    // Title: Investor Transaction Receipt
    doc.setTextColor(...COLORS.primaryBlue);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('INVESTOR TRANSACTION RECEIPT', 105, yPos, { align: 'center' });
    yPos += 8;
  
    yPos = addDivider(doc, yPos);
  
    // Transaction Details in a clean layout
    doc.setFontSize(10);
  
    // Determine transaction type for display
    const transactionType = formatInvestorTransactionType(transaction);
    
    const details = [
      { label: 'Transaction ID:', value: String(transaction.id || 'N/A') },
      { label: 'Date:', value: transaction.date || transaction.created_at || transaction.return_date ? 
        new Date(transaction.date || transaction.created_at || transaction.return_date).toLocaleDateString('en-GB') : 'N/A' },
      { label: 'Investor Name:', value: transaction.investor_name || 'N/A' },
      { label: 'Transaction Type:', value: transactionType },
      { label: 'Amount:', value: `KES ${Number(transaction.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
      { label: 'Payment Method:', value: formatInvestorPaymentMethod(transaction) },
      { label: 'Status:', value: formatInvestorStatus(transaction.status) }
    ];
    
    // Render details with proper spacing
    details.forEach(({ label, value }) => {
      doc.setTextColor(...COLORS.textDark);
      doc.setFont('helvetica', 'bold');
      doc.text(label, 25, yPos);
      doc.setFont('helvetica', 'normal');
     
      // Special coloring for Payment Method
      const methodLower = (transaction.payment_method || transaction.method || '').toLowerCase();
      const methodColor = methodLower === 'mpesa' ? COLORS.green : COLORS.textDark;
      doc.setTextColor(...methodColor);
     
      doc.text(String(value), 70, yPos);
      yPos += 8;
    });
    
    // Add M-Pesa reference if applicable
    if ((transaction.method?.toLowerCase() === 'mpesa' || transaction.payment_method?.toLowerCase() === 'mpesa') && 
        (transaction.mpesa_receipt || transaction.mpesa_reference)) {
      yPos += 5;
      doc.setTextColor(...COLORS.textDark);
      doc.setFont('helvetica', 'bold');
      doc.text('M-Pesa Reference:', 25, yPos);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...COLORS.green);
      doc.text(transaction.mpesa_receipt || transaction.mpesa_reference, 70, yPos);
      yPos += 8;
    }

    // Add notes if available
    if (transaction.notes) {
      yPos += 5;
      doc.setTextColor(...COLORS.textDark);
      doc.setFont('helvetica', 'bold');
      doc.text('Notes:', 25, yPos);
      doc.setFont('helvetica', 'normal');
      
      // Split notes into multiple lines if too long
      const notesLines = doc.splitTextToSize(transaction.notes, 150);
      notesLines.forEach(line => {
        doc.text(line, 25, yPos + 5);
        yPos += 5;
      });
    }
  
    yPos += 15;
  
    // Footer section
    addFooter(doc, yPos);

    addPageNumbers(doc, 'page %d');
  
    // Save PDF with appropriate filename
    const investorName = (transaction.investor_name || 'Investor').replace(/\s+/g, '_');
    const transType = (transaction.type || transaction.transaction_type || '').replace(/\s+/g, '_');
    doc.save(`Investor_Receipt_${investorName}_${transType}_${transaction.id || Date.now()}.pdf`);
  } catch (error) {
    console.error('Error generating investor transaction receipt:', error);
    throw error;
  }
};

const formatInvestorTransactionType = (transaction) => {
  if (!transaction) return 'N/A';
  
  const type = transaction.transaction_type || transaction.type || '';
  const typeLower = type.toLowerCase();
  
  const typeMap = {
    'return': 'Investor Return',
    'investor_return': 'Investor Return',
    'topup': 'Investment Top-up',
    'investor_topup': 'Investment Top-up',
    'adjustment_up': 'Investment Increase',
    'investor_adjustment_up': 'Investment Increase',
    'adjustment_down': 'Investment Decrease',
    'investor_adjustment_down': 'Investment Decrease',
    'initial_investment': 'Initial Investment',
    'disbursement': 'Loan Disbursement'
  };
  
  return typeMap[typeLower] || type.charAt(0).toUpperCase() + type.slice(1);
};

const formatInvestorPaymentMethod = (transaction) => {
  const method = transaction.payment_method || transaction.method || '';
  if (!method) return 'N/A';
  return method.toUpperCase();
};

const formatInvestorStatus = (status) => {
  if (!status) return 'Completed'; // Default for investor transactions
  return status.charAt(0).toUpperCase() + status.slice(1);
};

const filterInvestorTransactions = (transactions, investorId, investorName) => {
  return transactions.filter(txn => {
    // Check multiple possible ways the investor could be linked
    const txnInvestorId = txn.investor_id || txn.investorId || (txn.investor ? txn.investor.id : null);
    const txnInvestorName = txn.investor_name || (txn.investor ? txn.investor.name : null);
    
    return (
      txnInvestorId === investorId ||
      (txnInvestorId && investorId && txnInvestorId.toString() === investorId.toString()) ||
      txnInvestorName === investorName ||
      (txnInvestorName && investorName && txnInvestorName.toLowerCase().includes(investorName.toLowerCase()))
    );
  });
};

// ========== PROPOSAL PDF GENERATOR ==========
export const generateProposalPDF = async () => {
  try {
    const doc = new jsPDF();

    // Add watermark (type 'proposal')
    addOptimizedWatermark(doc, 'proposal');

    // Add company header
    let yPos = await addHeader(doc, 15);

    doc.setFontSize(15);
    doc.setTextColor(...COLORS.secondaryBlue);
    doc.text('Digital Growth & Operational Enhancement Proposal', 105, yPos, { align: 'center' });
    yPos += 3;
    yPos = addDivider(doc, yPos, COLORS.secondaryBlue);
    const proposalLines = [
      // ===== 1. INTRODUCTION =====
      { text: '1. Introduction', style: 'section' },
      { text: 'This proposal outlines a structured plan to enhance Nagolie Enterprises’ digital presence, operational reporting systems, investor engagement strategy, and local brand dominance.', style: 'normal' },
      { text: 'The objective is to:', style: 'normal' },
      { text: 'Increase visibility and client acquisition', style: 'bullet' },
      { text: 'Improve internal decision-making through data reporting', style: 'bullet' },
      { text: 'Strengthen investor confidence', style: 'bullet' },
      { text: 'Enhance brand recognition within Kajiado County and beyond', style: 'bullet' },
      // ===== 2. PROPOSED INITIATIVES =====
      { text: '2. Proposed Initiatives', style: 'section' },
      // A. Digital Marketing Expansion
      { text: 'A. Digital Marketing Expansion', style: 'subsection' },
      { text: '1. Official Facebook Page Launch', style: 'subsubsection' },
      { text: 'Creation and management of Nagolie Enterprises’ official Facebook page to increase brand awareness and client engagement.', style: 'normal' },
      { text: 'Content Strategy:', style: 'bold' },
      { text: 'Valuation process overview', style: 'bullet' },
      { text: 'Client success stories', style: 'bullet' },
      { text: 'Testimonials (photo/video)', style: 'bullet' },
      { text: 'Promotional flyers', style: 'bullet' },
      { text: 'Educational livestock content', style: 'bullet' },
      { text: 'Advertising Strategy:', style: 'bold' },
      { text: 'Weekly boosted posts', style: 'bullet' },
      { text: 'Budget: KSh 300–500 per week', style: 'bullet' },
      { text: 'Targeted local audience (Isinya, Kajiado County and surrounding areas)', style: 'bullet' },
      { text: 'Expected Impact:', style: 'bold' },
      { text: 'Increased inquiries', style: 'bullet' },
      { text: 'Higher walk-in clients', style: 'bullet' },
      { text: 'Stronger brand credibility', style: 'bullet' },
      { text: '', style: 'normal' },

      // B. Website & System Improvements
      { text: 'B. Website & System Improvements', style: 'subsection' },
      { text: '2. Performance Report Generation System', style: 'subsubsection' },
      { text: 'Development of a reporting feature within the website system to generate:', style: 'normal' },
      { text: 'Reports Available:', style: 'bold' },
      { text: 'Weekly reports', style: 'bullet' },
      { text: 'Monthly reports', style: 'bullet' },
      { text: 'Yearly reports', style: 'bullet' },
      { text: 'Report Contents:', style: 'bold' },
      { text: 'Total money disbursed', style: 'bullet' },
      { text: 'Investor payout information', style: 'bullet' },
      { text: 'Estimated profit margin', style: 'bullet' },
      { text: 'Livestock claimed vs. company-owned livestock', style: 'bullet' },
      { text: 'Collateral livestock tracking and ownership', style: 'bullet' },
      { text: 'Location-based loan distribution analysis', style: 'bullet' },
      { text: 'Graph-based data visualization for better insights', style: 'bullet' },
      { text: 'Benefits:', style: 'bold' },
      { text: 'Improved strategic planning', style: 'bullet' },
      { text: 'Clear financial oversight', style: 'bullet' },
      { text: 'Better marketing targeting based on location data', style: 'bullet' },
      { text: 'Increased transparency for management and investors', style: 'bullet' },
      // C. Future System Integrations
      { text: 'C. Future System Integrations', style: 'subsection' },
      { text: '3. SMS Reminder & STK Push Integration (Future Phase)', style: 'subsubsection' },
      { text: 'Once capital allows, implement:', style: 'normal' },
      { text: 'Automated SMS reminders for:', style: 'bold' },
      { text: 'Investor payouts', style: 'bullet' },
      { text: 'Loan due dates', style: 'bullet' },
      { text: 'New investment opportunities', style: 'bullet' },
      { text: 'STK Push integration for seamless payment collection', style: 'bullet' },
      { text: 'Benefits:', style: 'bold' },
      { text: 'Improved payment efficiency', style: 'bullet' },
      { text: 'Reduced manual follow-up', style: 'bullet' },
      { text: 'Increased professionalism and automation', style: 'bullet' },
      // D. Investor Growth Strategy
      { text: 'D. Investor Growth Strategy', style: 'subsection' },
      { text: '4. Professional Investor Pitch Deck', style: 'subsubsection' },
      { text: 'Creation of a structured investor presentation (PowerPoint and/or Canva format) including:', style: 'normal' },
      { text: 'Financial model projections', style: 'bullet' },
      { text: 'Growth forecasts', style: 'bullet' },
      { text: 'Risk management strategy', style: 'bullet' },
      { text: 'Collateral system explanation', style: 'bullet' },
      { text: 'Livestock insurance information', style: 'bullet' },
      { text: 'Company performance highlights', style: 'bullet' },
      { text: 'Purpose:', style: 'bold' },
      { text: 'Attract serious investors', style: 'bullet' },
      { text: 'Increase investment capital', style: 'bullet' },
      { text: 'Improve trust and professionalism', style: 'bullet' },
      // E. Branding & Local Market Dominance
      { text: 'E. Branding & Local Market Dominance', style: 'subsection' },
      { text: '5. Branding Upgrade (In Progress)', style: 'subsubsection' },
      { text: 'Reflectors for brand recognition (in progress)', style: 'bullet' },
      { text: 'Reprocure branded caps and T-shirts', style: 'bullet' },
      { text: 'Proposal:', style: 'bold' },
      { text: 'Introduce “Nagolie Branding Days” (2 days per week)', style: 'bullet' },
      { text: 'Staff wear official merchandise', style: 'bullet' },
      { text: 'Increase visibility and brand authority', style: 'bullet' },
      // F. Referral Program Strategy
      { text: 'F. Referral Program Strategy', style: 'subsection' },
      { text: '6. Client Referral Incentive Program', style: 'subsubsection' },
      { text: 'Introduce a structured referral program:', style: 'normal' },
      { text: 'When an existing client refers a new client, the client receives a small discount on their loan', style: 'bullet' },
      { text: 'Expected Impact:', style: 'bold' },
      { text: 'Increased word-of-mouth marketing', style: 'bullet' },
      { text: 'Faster client growth', style: 'bullet' },
      { text: 'Strengthened community loyalty', style: 'bullet' },
      // ===== 3. EXPECTED OVERALL IMPACT =====
      { text: '3. Expected Overall Impact', style: 'section' },
      { text: 'If implemented effectively, these initiatives will:', style: 'normal' },
      { text: 'Increase client acquisition', style: 'bullet' },
      { text: 'Improve operational efficiency', style: 'bullet' },
      { text: 'Strengthen investor confidence', style: 'bullet' },
      { text: 'Enhance brand dominance in Isinya and its surroundings, Kajiado County and beyond', style: 'bullet' },
      { text: 'Position Nagolie Enterprises for scalable growth', style: 'bullet' },
      // ===== 4. CONCLUSION =====
      { text: '4. Conclusion', style: 'section' },
      { text: 'This proposal aims to strategically position Nagolie Enterprises as:', style: 'normal' },
      { text: 'A digitally organized company', style: 'bullet' },
      { text: 'A trusted investment partner', style: 'bullet' },
      { text: 'A locally dominant livestock acquisition enterprise', style: 'bullet' },
      { text: 'A scalable rural financial solutions leader', style: 'bullet' },
      { text: '', style: 'normal' },
      { text: 'Prepared by:', style: 'bold' },
      { text: 'Joseph Ngugi', style: 'normal' },
      { text: 'Sign: ___________', style: 'normal' },
      { text: 'Technical Operations Manager', style: 'normal' }
    ];

    // ---- Render lines with formatting ----
    const marginLeft = 20;
    const bulletIndent = 10; // extra indent for bullets
    const lineHeight = 6;

    proposalLines.forEach((lineObj) => {
      // Check if we need a new page
      if (yPos > 270) {
        doc.addPage();
        addWatermarkToCurrentPage(doc, 'proposal');
        yPos = 20;
      }

      const { text, style } = lineObj;

      if (text === '') {
        yPos += lineHeight * 0.8; // blank line spacing
        return;
      }

      // Set font and color based on style
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...COLORS.textDark);
      let xPos = marginLeft;
      let fontSize = 10;

      if (style === 'section') {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...COLORS.primaryBlue);
        doc.setFontSize(12);
        fontSize = 12;
      } else if (style === 'subsection') {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...COLORS.secondaryBlue);
        doc.setFontSize(11);
        fontSize = 11;
      } else if (style === 'subsubsection') {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...COLORS.textDark);
        doc.setFontSize(10.5);
        fontSize = 10.5;
      } else if (style === 'bold') {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...COLORS.textDark);
        doc.setFontSize(10);
      } else if (style === 'bullet') {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...COLORS.textDark);
        doc.setFontSize(10);
        xPos = marginLeft + bulletIndent;
        // Draw bullet character
        doc.setFontSize(8); // bullet slightly smaller
        doc.text('•', marginLeft + 5, yPos - 1);
        doc.setFontSize(10);
      } else {
        // normal text
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...COLORS.textDark);
        doc.setFontSize(10);
      }

      // Wrap long text
      const maxWidth = 170 - (xPos - marginLeft);
      const lines = doc.splitTextToSize(text, maxWidth);
      lines.forEach((line, index) => {
        if (index > 0) {
          yPos += lineHeight;
          if (yPos > 270) {
            doc.addPage();
            addWatermarkToCurrentPage(doc, 'proposal');
            yPos = 20;
          }
        }
        doc.text(line, xPos, yPos);
      });

      yPos += lineHeight;
    });

    // Add final footer
    addFooter(doc, yPos);

    // Save the PDF
    doc.save('Nagolie_Enterprises_Proposal.pdf');
  } catch (error) {
    console.error('Error generating proposal PDF:', error);
    throw error;
  }
};

export const generateLoanRenewalAgreementAutoPDF = async (loanData, newPrincipal) => {
  try {
    const doc = new jsPDF();
    addOptimizedWatermark(doc, 'agreement');
    let yPos = await addHeader(doc, 10);

    const currentDate = new Date();
    const formattedDate = currentDate.toLocaleDateString('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });

    doc.setTextColor(...COLORS.primaryBlue);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('LOAN RENEWAL AGREEMENT', 105, yPos, { align: 'center' });
    yPos += 8;
    yPos = addDivider(doc, yPos);

    // Borrower Information
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.textDark);
    doc.setFont('helvetica', 'bold');
    doc.text('Borrower Information:', 20, yPos);
    yPos += 6;
    
    doc.setFont('helvetica', 'normal');
    doc.text('Name: ', 25, yPos);
    doc.setFont('helvetica', 'bold');
    doc.text(loanData.name || '___________________', 25 + doc.getTextWidth('Name: '), yPos);
    yPos += 5.5;
    
    doc.setFont('helvetica', 'normal');
    doc.text('ID Number: ', 25, yPos);
    doc.setFont('helvetica', 'bold');
    doc.text(loanData.idNumber || '___________________', 25 + doc.getTextWidth('ID Number: '), yPos);
    yPos += 5.5;
    
    doc.setFont('helvetica', 'normal');
    doc.text('Phone: ', 25, yPos);
    doc.setFont('helvetica', 'bold');
    doc.text(loanData.phone || '___________________', 25 + doc.getTextWidth('Phone: '), yPos);
    yPos += 10;

    // Loan Details
    doc.setFont('helvetica', 'bold');
    doc.text('Loan Details:', 20, yPos);
    yPos += 6;
    
    // Original Loan Amount (with bold "KES")
    doc.setFont('helvetica', 'normal');
    doc.text('Original Loan Amount: ', 25, yPos);
    const origLabelWidth = doc.getTextWidth('Original Loan Amount: ');
    doc.setFont('helvetica', 'bold');
    doc.text('KES ', 25 + origLabelWidth, yPos);
    const kesWidth = doc.getTextWidth('KES ');
    const origAmt = (loanData.borrowedAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
    doc.text(origAmt, 25 + origLabelWidth + kesWidth, yPos);
    yPos += 5.5;
    
    // Outstanding Balance (with bold "KES")
    doc.setFont('helvetica', 'normal');
    doc.text('Outstanding Balance: ', 25, yPos);
    const outLabelWidth = doc.getTextWidth('Outstanding Balance: ');
    doc.setFont('helvetica', 'bold');
    doc.text('KES ', 25 + outLabelWidth, yPos);
    const outKesWidth = doc.getTextWidth('KES ');
    const outAmt = newPrincipal.toLocaleString('en-US', { minimumFractionDigits: 2 });
    doc.text(outAmt, 25 + outLabelWidth + outKesWidth, yPos);
    yPos += 5.5;
    
    // Original Due Date
    doc.setFont('helvetica', 'normal');
    doc.text('Original Due Date: ', 25, yPos);
    doc.setFont('helvetica', 'bold');
    const dueDate = loanData.expectedReturnDate ? new Date(loanData.expectedReturnDate).toLocaleDateString('en-GB') : 'N/A';
    doc.text(dueDate, 25 + doc.getTextWidth('Original Due Date: '), yPos);
    yPos += 10;

    // Renewal Terms heading
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.primaryBlue);
    doc.text('RENEWAL TERMS', 105, yPos, { align: 'center' });
    yPos += 8;
    
    // Terms font size remains 10pt (original)
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.textDark);
    doc.setFont('helvetica', 'normal');

    // Helper to write a line with a bold segment inside (including "KES" in bold)
    const writeBoldSegment = (prefix, boldText, suffix, y, xStart = 20) => {
      doc.setFont('helvetica', 'normal');
      doc.text(prefix, xStart, y);
      const xAfterPrefix = xStart + doc.getTextWidth(prefix);
      doc.setFont('helvetica', 'bold');
      doc.text(boldText, xAfterPrefix, y);
      if (suffix) {
        const xAfterBold = xAfterPrefix + doc.getTextWidth(boldText);
        doc.setFont('helvetica', 'normal');
        doc.text(suffix, xAfterBold, y);
      }
    };

    // Line 1
    doc.text("1. The Borrower acknowledges that the original loan is overdue and that the Company has agreed to renew the loan", 20, yPos);
    yPos += 4.5;
    doc.text("   under the following terms.", 20, yPos);
    yPos += 5;
    
    // Line 2
    doc.text("2. The Borrower shall repay the outstanding balance as follows:", 20, yPos);
    yPos += 5;
    
    // Line 2a – New Principal (bold "KES" + bold amount)
    doc.setFont('helvetica', 'normal');
    doc.text("   New Principal: ", 20, yPos);
    const newPrincLabelWidth = doc.getTextWidth("   New Principal: ");
    doc.setFont('helvetica', 'bold');
    doc.text("KES ", 20 + newPrincLabelWidth, yPos);
    const newPrincKesWidth = doc.getTextWidth("KES ");
    doc.text(newPrincipal.toLocaleString('en-US', { minimumFractionDigits: 2 }), 20 + newPrincLabelWidth + newPrincKesWidth, yPos);
    yPos += 5;
    
    // Line 2b – Interest (bold whole value)
    const interestText = loanData.repayment_plan === 'daily' 
      ? '4.5% per day (simple interest)' 
      : '30% per week (compound interest)';
    doc.setFont('helvetica', 'normal');
    doc.text("   Interest: ", 20, yPos);
    doc.setFont('helvetica', 'bold');
    doc.text(interestText, 20 + doc.getTextWidth("   Interest: "), yPos);
    yPos += 5;
    
    // Line 3
    doc.setFont('helvetica', 'normal');
    doc.text("3. The interest will continue to accrue on the new principal according to the original loan's repayment plan.", 20, yPos);
    yPos += 5;
    
    // Line 4
    doc.text("4. All terms and conditions of the original Livestock Advance Payment Agreement (including the collateral provisions)", 20, yPos);
    yPos += 4.5;
    doc.text("   remain in full force and effect.", 20, yPos);
    yPos += 5;
    
    // Line 5
    doc.text("5. The Borrower agrees that failure to comply with this renewal agreement will constitute immediate default,", 20, yPos);
    yPos += 4.5;
    doc.text("   and the Company may take possession of the collateral livestock without further notice.", 20, yPos);
    yPos += 5;
    
    // Line 6
    doc.text("6. This renewal agreement is effective from the date signed below and supersedes the original due date.", 20, yPos);
    yPos += 8;

    // Signatures section (tightened spacing)
    if (yPos > 185) {
      doc.addPage();
      addWatermarkToCurrentPage(doc, 'agreement');
      yPos = 20;
    } else {
      yPos += 2;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...COLORS.primaryBlue);
    doc.text('SIGNATURES', 105, yPos, { align: 'center' });
    yPos += 8;

    doc.setFontSize(10);
    doc.setTextColor(...COLORS.textDark);
    doc.setFont('helvetica', 'bold');
    doc.text('CLIENT:', 20, yPos);
    yPos += 5;
    
    doc.setFont('helvetica', 'normal');
    doc.text(`Name: ${loanData.name || '___________________'}`, 25, yPos);
    yPos += 4.5;
    doc.text('Signature: ___________________', 25, yPos);
    yPos += 4.5;
    doc.text(`Date: ${formattedDate}`, 25, yPos);
    yPos += 8;

    const leftX = 20;
    const rightX = 20 + 95; // half of 190

    doc.setFont('helvetica', 'bold');
    doc.text('CONFIRMED BY:', 20, yPos);
    yPos += 6;

    doc.setFont('helvetica', 'bold');
    doc.text('Shadrack Kesumet', leftX, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text('Director', leftX, yPos + 5);
    doc.text('Sign: ___________________', leftX, yPos + 10);

    doc.setFont('helvetica', 'bold');
    doc.text('Name: _________________________', rightX, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text('Livestock Valuer', rightX, yPos + 5);
    doc.text('Sign: ___________________', rightX, yPos + 10);

    yPos += 18;

    // Stamp box
    const stampBoxWidth = 60;
    const stampBoxHeight = 30; // reduced height to save space
    const stampBoxX = (210 - stampBoxWidth) / 2;
    const stampBoxY = yPos;
    doc.setDrawColor(230, 235, 245);
    doc.setLineWidth(0.3);
    doc.roundedRect(stampBoxX, stampBoxY, stampBoxWidth, stampBoxHeight, 2, 2);
    doc.setTextColor(230, 235, 240);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.text('OFFICIAL COMPANY STAMP', stampBoxX + stampBoxWidth/2, stampBoxY + stampBoxHeight/2, { align: 'center' });

    // Footer (ensure it stays within page)
    const footerY = 285;
    doc.setTextColor(...COLORS.textLight);
    doc.setFontSize(8);
    doc.text(`Generated on: ${new Date().toLocaleDateString('en-GB')}`, 20, footerY);
    doc.setTextColor(...COLORS.textDark);
    doc.setFontSize(9);
    doc.text('Thank you for choosing Nagolie Enterprises!', 105, footerY + 5, { align: 'center' });

    const fileName = `Loan_Renewal_${loanData.name?.replace(/\s+/g, '_') || 'Client'}_${formattedDate.replace(/\//g, '-')}.pdf`;
    doc.save(fileName);
  } catch (error) {
    console.error('Error generating loan renewal agreement:', error);
    throw error;
  }
};

export const generateManualLoanRenewalAgreementPDF = async () => {
  try {
    const doc = new jsPDF();
    addOptimizedWatermark(doc, 'agreement');
    let yPos = await addHeader(doc, 8);  // reduced top margin

    // ---- Helper functions for thumbprint & checkboxes ----
    const drawThumbprintBox = (x, y, width = 40, height = 35) => {
      doc.setDrawColor(230, 235, 245);
      doc.setLineWidth(0.3);
      doc.roundedRect(x, y, width, height, 2, 2);
      doc.setTextColor(230, 235, 240);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.text('THUMB PRINT', x + width / 2, y + height / 2, { align: 'center' });
      doc.setTextColor(...COLORS.textDark);
      doc.setFont('helvetica', 'normal');
    };

    const drawRtLtCheckboxes = (x, y) => {
      doc.setTextColor(...COLORS.textDark);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.3);
      doc.rect(x, y, 4, 4);
      doc.text('R.T', x + 5, y + 3.5);
      doc.rect(x + 22, y, 4, 4);
      doc.text('L.T', x + 27, y + 3.5);
    };

    const currentDate = new Date();
    const formattedDate = currentDate.toLocaleDateString('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });

    doc.setTextColor(...COLORS.primaryBlue);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('LOAN RENEWAL AGREEMENT', 105, yPos, { align: 'center' });
    yPos += 6;
    yPos = addDivider(doc, yPos);

    // Borrower Information
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.textDark);
    doc.setFont('helvetica', 'bold');
    doc.text('Borrower Information:', 20, yPos);
    yPos += 4;
    
    doc.setFont('helvetica', 'normal');
    doc.text('Name: _________________________', 25, yPos);
    yPos += 4.5;
    doc.text('ID Number: _________________________', 25, yPos);
    yPos += 4.5;
    doc.text('Phone: _________________________', 25, yPos);
    yPos += 6;

    // Loan Details
    doc.setFont('helvetica', 'bold');
    doc.text('Loan Details:', 20, yPos);
    yPos += 4;
    
    doc.setFont('helvetica', 'normal');
    doc.text('Original Loan Amount: KES _________________________', 25, yPos);
    yPos += 4.5;
    doc.text('Outstanding Balance: KES _________________________', 25, yPos);
    yPos += 4.5;
    doc.text('Original Due Date: _________________________', 25, yPos);
    yPos += 6;

    // Renewal Terms heading
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.primaryBlue);
    doc.text('RENEWAL TERMS', 105, yPos, { align: 'center' });
    yPos += 6;
    
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.textDark);
    doc.setFont('helvetica', 'normal');

    const renewalTerms = [
      "1. The Borrower acknowledges that the original loan is overdue and that the Company has agreed to renew the loan",
      "   under the following terms.",
      "2. The Borrower shall repay the outstanding balance as follows:",
      "   New Principal: KES _________________________",
      "   Interest: __________ [   ]30% per week /   [   ]4.5% per day",
      "3. The interest will continue to accrue on the new principal according to the original loan's repayment plan.",
      "4. All terms and conditions of the original Livestock Advance Payment Agreement (including the collateral provisions)",
      "   remain in full force and effect.",
      "5. The Borrower agrees that failure to comply with this renewal agreement will constitute immediate default,",
      "   and the Company may take possession of the collateral livestock without further notice.",
      "6. This renewal agreement is effective from the date signed below and supersedes the original due date.",
      ""
    ];

    const addWrappedText = (text, x, y, maxWidth = 170) => {
      const lines = doc.splitTextToSize(text, maxWidth);
      lines.forEach(line => {
        doc.text(line, x, y);
        y += 4.0;
      });
      return y;
    };

    for (const term of renewalTerms) {
      if (term.trim() === "") continue;
      yPos = addWrappedText(term, 20, yPos);
    }

    // Signatures section
    if (yPos > 185) {
      doc.addPage();
      addWatermarkToCurrentPage(doc, 'agreement');
      yPos = 20;
    } else {
      yPos += 2;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...COLORS.primaryBlue);
    doc.text('SIGNATURES', 105, yPos, { align: 'center' });
    yPos += 8;

    doc.setFontSize(10);
    doc.setTextColor(...COLORS.textDark);
    doc.setFont('helvetica', 'bold');
    doc.text('CLIENT:', 20, yPos);
    yPos += 5;
    
    doc.setFont('helvetica', 'normal');
    doc.text('Name: _________________________', 25, yPos);
    yPos += 4;
    doc.text('Signature: ____________________', 25, yPos);
    yPos += 4;
    doc.text(`Date: _________________________`, 25, yPos);
    yPos += 8;

    const leftX = 20;
    const rightX = 20 + 95;

    doc.setFont('helvetica', 'bold');
    doc.text('CONFIRMED BY:', 20, yPos);
    yPos += 6;

    doc.setFont('helvetica', 'bold');
    doc.text('Shadrack Kesumet', leftX, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text('Director', leftX, yPos + 5);
    doc.text('Sign: ___________________', leftX, yPos + 9);

    doc.setFont('helvetica', 'bold');
    doc.text('Name: _________________________', rightX, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text('Livestock Valuer', rightX, yPos + 5);
    doc.text('Sign: ___________________', rightX, yPos + 9);

    yPos += 18;

    // ---- Stamp Box (left) and Thumbprint Box (right) ----
    const boxWidth = 60;
    const boxHeight = 35;
    const leftBoxX = 20;                 // stamp on left
    const rightBoxX = 210 - 20 - boxWidth; // thumbprint on right
    const boxesY = yPos;

    // Stamp box (left) – load manual stamp image
    let stampBase64 = null;
    try {
      stampBase64 = await getLogoBase64('/nagolie-stamp-manual.png');
    } catch (error) {
      console.warn('Failed to load stamp image:', error);
    }

    if (stampBase64) {
      doc.addImage(stampBase64, 'PNG', leftBoxX, boxesY, boxWidth, boxHeight);
    } else {
      // Fallback to drawn box
      doc.setDrawColor(230, 235, 245);
      doc.setLineWidth(0.3);
      doc.roundedRect(leftBoxX, boxesY, boxWidth, boxHeight, 2, 2);
      const stampCenterX = leftBoxX + boxWidth / 2;
      const stampCenterY = boxesY + boxHeight / 2;
      doc.setTextColor(230, 235, 240);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'italic');
      doc.text('OFFICIAL COMPANY STAMP', stampCenterX, stampCenterY - 3, { align: 'center' });
      doc.text('(To be affixed here)', stampCenterX, stampCenterY + 3, { align: 'center' });
    }

    // Thumbprint box (right)
    drawThumbprintBox(rightBoxX, boxesY, boxWidth, boxHeight);
    // Place checkboxes centered below the thumbprint box
    const checkY = boxesY + boxHeight + 4;
    const groupWidth = 50 + 5 + 20;
    const checkX = rightBoxX + (boxWidth / 2) - (groupWidth / 2);
    drawRtLtCheckboxes(checkX, checkY);

    // Advance yPos past the boxes (plus checkboxes)
    yPos = checkY + 12;

    // Footer
    const footerY = 285;
    doc.setTextColor(...COLORS.textLight);
    doc.setFontSize(8);
    doc.text(`Generated on: ${new Date().toLocaleDateString('en-GB')}`, 20, footerY);
    doc.setTextColor(...COLORS.textDark);
    doc.setFontSize(9);
    doc.text('Thank you for choosing Nagolie Enterprises!', 105, footerY + 5, { align: 'center' });

    const fileName = `Manual_Loan_Renewal_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
  } catch (error) {
    console.error('Error generating manual loan renewal agreement:', error);
    throw error;
  }
};

// ========== LETTER WRITER PDF (PREVIEW - opens in new tab) ==========
export const generateLetterPDF = async (data) => {
  const doc = new jsPDF();
  addOptimizedWatermark(doc, 'letter');
  let yPos = await addHeader(doc, 15);

  // Title
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.primaryBlue);
  doc.text(data.title.toUpperCase(), 105, yPos, { align: 'center' });
  yPos += 8;
  yPos = addDivider(doc, yPos);

  // Date
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.textDark);
  doc.text(`Date: ${data.date}`, 150, yPos - 6);

  // Recipient (multi‑line)
  doc.setFont('helvetica', 'bold');
  doc.text('TO:', 20, yPos);
  const toX = 20 + doc.getTextWidth('TO:');
  doc.setFont('helvetica', 'normal');
  const recipientLines = data.recipient.split(/\r?\n/);
  recipientLines.forEach((line, idx) => {
    if (idx === 0) {
      doc.text(line, toX, yPos);
    } else {
      yPos += 6;
      doc.text(line, toX, yPos);
    }
  });
  yPos += 8;

  // RE: – entire line bold
  if (data.re) {
    doc.setFont('helvetica', 'bold');
    doc.text(`RE: ${data.re}`, 20, yPos);
    yPos += 8;
  } else {
    yPos += 6;
  }

  // Reset font to normal before body
  doc.setFont('helvetica', 'normal');

  // ---------- MARKDOWN PARSER ----------
  const parseMarkdown = (text) => {
    const parts = [];
    let i = 0;
    const len = text.length;
    let currentStyle = 'normal';
    let buffer = '';

    const flushBuffer = () => {
      if (buffer) {
        parts.push({ text: buffer, style: currentStyle });
        buffer = '';
      }
    };

    while (i < len) {
      // Bold **
      if (text[i] === '*' && i + 1 < len && text[i+1] === '*') {
        flushBuffer();
        currentStyle = (currentStyle === 'normal' ? 'bold' : 'normal');
        i += 2;
        continue;
      }
      // Italic *
      if (text[i] === '*' && (i + 1 >= len || text[i+1] !== '*')) {
        flushBuffer();
        currentStyle = (currentStyle === 'normal' ? 'italic' : 'normal');
        i += 1;
        continue;
      }
      // Underline __
      if (text[i] === '_' && i + 1 < len && text[i+1] === '_') {
        flushBuffer();
        currentStyle = (currentStyle === 'normal' ? 'underline' : 'normal');
        i += 2;
        continue;
      }
      buffer += text[i];
      i++;
    }
    flushBuffer();
    return parts;
  };

  // CORRECTED styled line renderer – draws text for all styles
  const writeStyledLine = (lineParts, y) => {
    let x = 20;
    doc.setFontSize(10);
    lineParts.forEach(part => {
      switch (part.style) {
        case 'bold':
          doc.setFont('helvetica', 'bold');
          doc.text(part.text, x, y);
          x += doc.getTextWidth(part.text);
          break;
        case 'italic':
          doc.setFont('helvetica', 'italic');
          doc.text(part.text, x, y);
          x += doc.getTextWidth(part.text);
          break;
        case 'underline':
          doc.setFont('helvetica', 'normal');
          doc.setLineWidth(0.3);
          doc.setDrawColor(...COLORS.textDark);
          const tw = doc.getTextWidth(part.text);
          doc.text(part.text, x, y);
          doc.line(x, y + 1, x + tw, y + 1);
          x += tw;
          doc.setLineWidth(0.2);
          break;
        default:
          doc.setFont('helvetica', 'normal');
          doc.text(part.text, x, y);
          x += doc.getTextWidth(part.text);
      }
    });
    // Reset to normal after the line
    doc.setFont('helvetica', 'normal');
  };

  // Process body line by line
  const lines = data.body.split('\n');
  for (const line of lines) {
    if (yPos > 270) {
      doc.addPage();
      addWatermarkToCurrentPage(doc, 'letter');
      yPos = 20;
      doc.setFont('helvetica', 'normal');
    }
    const parts = parseMarkdown(line);
    if (parts.length === 0) {
      // Empty line – add spacing
      yPos += 5;
      continue;
    }
    // Check if the line contains only normal text
    const allNormal = parts.every(p => p.style === 'normal');
    if (allNormal) {
      doc.setFont('helvetica', 'normal');
      const plainText = parts.map(p => p.text).join('');
      const wrapped = doc.splitTextToSize(plainText, 170);
      wrapped.forEach(w => {
        if (yPos > 270) {
          doc.addPage();
          addWatermarkToCurrentPage(doc, 'letter');
          yPos = 20;
          doc.setFont('helvetica', 'normal');
        }
        doc.text(w, 20, yPos);
        yPos += 5;
      });
    } else {
      // Styled line – check if it fits, otherwise fallback to wrapped (styling lost)
      let fullText = '';
      parts.forEach(p => fullText += p.text);
      if (doc.getTextWidth(fullText) > 170) {
        doc.setFont('helvetica', 'normal');
        const wrapped = doc.splitTextToSize(fullText, 170);
        wrapped.forEach(w => {
          if (yPos > 270) {
            doc.addPage();
            addWatermarkToCurrentPage(doc, 'letter');
            yPos = 20;
            doc.setFont('helvetica', 'normal');
          }
          doc.text(w, 20, yPos);
          yPos += 5;
        });
      } else {
        writeStyledLine(parts, yPos);
        yPos += 5;
      }
    }
  }

  // Signature
  yPos += 15;
  doc.setFont('helvetica', 'bold');
  doc.text('Yours faithfully,', 20, yPos);
  yPos += 12;
  doc.setFont('helvetica', 'normal');
  const sign = getSignatureByUser(data.user);
  doc.text(sign.name, 20, yPos);
  yPos += 6;
  doc.text(sign.title, 20, yPos);

  addFooter(doc, yPos + 20);

  // Preview
  const pdfBlob = doc.output('blob');
  const url = URL.createObjectURL(pdfBlob);
  window.open(url, '_blank');
  URL.revokeObjectURL(url);
};

// ========== LETTER WRITER PDF (DOWNLOAD - saves file) ==========
export const downloadLetterPDF = async (data) => {
  const doc = new jsPDF();
  addOptimizedWatermark(doc, 'letter');
  let yPos = await addHeader(doc, 15);

  // Title
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.primaryBlue);
  doc.text(data.title.toUpperCase(), 105, yPos, { align: 'center' });
  yPos += 8;
  yPos = addDivider(doc, yPos);

  // Date
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.textDark);
  doc.text(`Date: ${data.date}`, 150, yPos - 6);

  // Recipient
  doc.setFont('helvetica', 'bold');
  doc.text('TO:', 20, yPos);
  const toX = 20 + doc.getTextWidth('TO:');
  doc.setFont('helvetica', 'normal');
  const recipientLines = data.recipient.split(/\r?\n/);
  recipientLines.forEach((line, idx) => {
    if (idx === 0) {
      doc.text(line, toX, yPos);
    } else {
      yPos += 6;
      doc.text(line, toX, yPos);
    }
  });
  yPos += 8;

  // RE:
  if (data.re) {
    doc.setFont('helvetica', 'bold');
    doc.text(`RE: ${data.re}`, 20, yPos);
    yPos += 8;
  } else {
    yPos += 6;
  }

  // Reset font to normal before body
  doc.setFont('helvetica', 'normal');

  // Same parser and renderer as preview
  const parseMarkdown = (text) => {
    const parts = [];
    let i = 0;
    const len = text.length;
    let currentStyle = 'normal';
    let buffer = '';
    const flushBuffer = () => {
      if (buffer) {
        parts.push({ text: buffer, style: currentStyle });
        buffer = '';
      }
    };
    while (i < len) {
      if (text[i] === '*' && i+1 < len && text[i+1] === '*') {
        flushBuffer();
        currentStyle = (currentStyle === 'normal' ? 'bold' : 'normal');
        i += 2;
        continue;
      }
      if (text[i] === '*' && (i+1 >= len || text[i+1] !== '*')) {
        flushBuffer();
        currentStyle = (currentStyle === 'normal' ? 'italic' : 'normal');
        i += 1;
        continue;
      }
      if (text[i] === '_' && i+1 < len && text[i+1] === '_') {
        flushBuffer();
        currentStyle = (currentStyle === 'normal' ? 'underline' : 'normal');
        i += 2;
        continue;
      }
      buffer += text[i];
      i++;
    }
    flushBuffer();
    return parts;
  };

  const writeStyledLine = (lineParts, y) => {
    let x = 20;
    doc.setFontSize(10);
    lineParts.forEach(part => {
      switch (part.style) {
        case 'bold':
          doc.setFont('helvetica', 'bold');
          doc.text(part.text, x, y);
          x += doc.getTextWidth(part.text);
          break;
        case 'italic':
          doc.setFont('helvetica', 'italic');
          doc.text(part.text, x, y);
          x += doc.getTextWidth(part.text);
          break;
        case 'underline':
          doc.setFont('helvetica', 'normal');
          doc.setLineWidth(0.3);
          doc.setDrawColor(...COLORS.textDark);
          const tw = doc.getTextWidth(part.text);
          doc.text(part.text, x, y);
          doc.line(x, y + 1, x + tw, y + 1);
          x += tw;
          doc.setLineWidth(0.2);
          break;
        default:
          doc.setFont('helvetica', 'normal');
          doc.text(part.text, x, y);
          x += doc.getTextWidth(part.text);
      }
    });
    doc.setFont('helvetica', 'normal');
  };

  const lines = data.body.split('\n');
  for (const line of lines) {
    if (yPos > 270) {
      doc.addPage();
      addWatermarkToCurrentPage(doc, 'letter');
      yPos = 20;
      doc.setFont('helvetica', 'normal');
    }
    const parts = parseMarkdown(line);
    if (parts.length === 0) {
      yPos += 5;
      continue;
    }
    const allNormal = parts.every(p => p.style === 'normal');
    if (allNormal) {
      doc.setFont('helvetica', 'normal');
      const plainText = parts.map(p => p.text).join('');
      const wrapped = doc.splitTextToSize(plainText, 170);
      wrapped.forEach(w => {
        if (yPos > 270) {
          doc.addPage();
          addWatermarkToCurrentPage(doc, 'letter');
          yPos = 20;
          doc.setFont('helvetica', 'normal');
        }
        doc.text(w, 20, yPos);
        yPos += 5;
      });
    } else {
      let fullText = '';
      parts.forEach(p => fullText += p.text);
      if (doc.getTextWidth(fullText) > 170) {
        doc.setFont('helvetica', 'normal');
        const wrapped = doc.splitTextToSize(fullText, 170);
        wrapped.forEach(w => {
          if (yPos > 270) {
            doc.addPage();
            addWatermarkToCurrentPage(doc, 'letter');
            yPos = 20;
            doc.setFont('helvetica', 'normal');
          }
          doc.text(w, 20, yPos);
          yPos += 5;
        });
      } else {
        writeStyledLine(parts, yPos);
        yPos += 5;
      }
    }
  }

  // Signature
  yPos += 15;
  doc.setFont('helvetica', 'bold');
  doc.text('Yours faithfully,', 20, yPos);
  yPos += 12;
  doc.setFont('helvetica', 'normal');
  const sign = getSignatureByUser(data.user);
  doc.text(sign.name, 20, yPos);
  yPos += 6;
  doc.text(sign.title, 20, yPos);

  addFooter(doc, yPos + 20);

  const fileName = `${data.title.replace(/\s+/g, '_')}_${data.date.replace(/\//g, '-')}.pdf`;
  doc.save(fileName);
};

const getSignatureByUser = (user) => {
  if (!user) return { name: 'Shadrack Kesumet', title: 'Director' };
  const role = user.role;
  const username = (user.username || '').toLowerCase();

  // Director
  if (role === 'director') {
    if (username === 'director') return { name: 'Shadrack Kesumet', title: 'Director' };
    if (username === 'millicent') return { name: 'Millicent Mantaine', title: 'Deputy Director' };
    return { name: 'Shadrack Kesumet', title: 'Director' };
  }
  // Deputy Director (also role director)
  if (role === 'deputy_director') {
    return { name: 'Millicent Mantaine', title: 'Deputy Director' };
  }
  // Secretary
  if (role === 'secretary') {
    return { name: 'Florence Wacuka', title: 'Secretary' };
  }
  // Accountant
  if (role === 'accountant') {
    return { name: 'Gideon Matunta', title: 'Head Accountant' };
  }
  // Head of IT
  if (role === 'head_of_it') {
    return { name: 'Joseph Ngugi', title: 'Head of I.T' };
  }
  // Valuer
  if (role === 'valuer') {
    if (username === 'robert') return { name: 'Robert Kalama', title: 'Valuer' };
    if (username === 'george') return { name: 'George Marite', title: 'Senior Valuer' };
    return { name: 'George Marite', title: 'Senior Valuer' };
  }
  // Default
  return { name: 'Shadrack Kesumet', title: 'Director' };
};

const formatCurrency = (amount) => {
  return `KES ${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
};

// generate loan invoice pdf
export const generateLoanInvoicePDF = async (loan, transactions = []) => {
  const initialPrincipal = loan.principal_amount || 0;
  const currentPrincipal = loan.current_principal || 0;
  const currentPeriodInterest = Number(loan.current_period_interest) || 0;
  const periodPrepaid = Number(loan.period_interest_prepaid) || 0;
  const periodFullyPaid = loan.period_interest_fully_paid === true;
  const isWeekly = loan.repayment_plan === 'weekly';

  // Total outstanding interest (same logic as before)
  let totalOutstandingInterest;
  if (isWeekly) {
    const owedInterest = periodFullyPaid ? 0 : Math.max(0, currentPeriodInterest - periodPrepaid);
    totalOutstandingInterest = owedInterest;
  } else {
    totalOutstandingInterest = Number(loan.accrued_interest) || 0;
  }

  const totalBalance = currentPrincipal + totalOutstandingInterest;
  const loanPeriod = getLoanPeriod(loan.disbursement_date, loan.repayment_plan);

  const formatMoney = (amount) => `KES ${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  const formatDate = (dateStr) => dateStr ? new Date(dateStr).toLocaleDateString('en-GB') : 'N/A';

  const doc = new jsPDF();
  addOptimizedWatermark(doc, 'invoice');

  let yPos = await addHeader(doc, 15);

  // Title
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.primaryBlue);
  doc.text('LOAN PAYMENT INVOICE', 105, yPos, { align: 'center' });
  yPos += 8;
  yPos = addDivider(doc, yPos);

  // Invoice basic info
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.textDark);
  const invoiceNumber = `INV-LOAN-${loan.id}-${Date.now()}`;
  doc.text(`Invoice Number: ${invoiceNumber}`, 20, yPos);
  doc.text(`Date: ${new Date().toLocaleDateString('en-GB')}`, 150, yPos);
  yPos += 8;
  doc.text(`Client: ${loan.name}`, 20, yPos);
  yPos += 6;
  doc.text(`Phone: ${loan.contacts || 'N/A'}`, 20, yPos);
  yPos += 6;
  doc.text(`ID Number: ${loan.id_number || 'N/A'}`, 20, yPos);
  yPos += 6;
  doc.text(`Loan Disbursement Date: ${formatDate(loan.disbursement_date)}`, 20, yPos);
  yPos += 6;
  doc.text(`Payment Plan: ${loan.repayment_plan === 'daily' ? 'Daily (4.5% per day)' : 'Weekly (30% per week)'}`, 20, yPos);
  yPos += 6;
  doc.text(`Loan Period: ${loanPeriod}`, 20, yPos);
  yPos += 12;

  // ========== PAYMENT HISTORY ==========
  const startX = 20;
  if (transactions && transactions.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.primaryBlue);
    doc.text('PAYMENT HISTORY', 20, yPos);
    yPos += 8;

    const sortedTxns = [...transactions].sort((a, b) => new Date(a.date || a.created_at) - new Date(b.date || b.created_at));

    doc.setFillColor(...COLORS.primaryBlue);
    doc.setTextColor(...COLORS.white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.rect(startX, yPos, 170, 8, 'F');
    doc.text('Date', startX + 2, yPos + 5.5);
    doc.text('Type', startX + 50, yPos + 5.5);
    doc.text('Amount (KES)', startX + 100, yPos + 5.5);
    yPos += 8;

    doc.setTextColor(...COLORS.textDark);
    doc.setFont('helvetica', 'normal');

    sortedTxns.forEach((txn, idx) => {
      if (yPos > 250) {
        doc.addPage();
        addWatermarkToCurrentPage(doc, 'invoice');
        yPos = 20;
        doc.setFillColor(...COLORS.primaryBlue);
        doc.setTextColor(...COLORS.white);
        doc.setFont('helvetica', 'bold');
        doc.rect(startX, yPos, 170, 8, 'F');
        doc.text('Date', startX + 2, yPos + 5.5);
        doc.text('Type', startX + 50, yPos + 5.5);
        doc.text('Amount (KES)', startX + 100, yPos + 5.5);
        yPos += 8;
        doc.setTextColor(...COLORS.textDark);
        doc.setFont('helvetica', 'normal');
      }
      if (idx % 2 === 0) {
        doc.setFillColor(...COLORS.border);
        doc.rect(startX, yPos, 170, 7, 'F');
      }
      const date = formatDate(txn.date || txn.created_at);
      let type = txn.transaction_type || txn.type || '';
      if (type === 'payment') {
        type = txn.payment_type ? `${txn.payment_type} Payment` : 'Payment';
      } else if (type === 'disbursement') {
        type = 'Disbursement';
      } else if (type === 'topup') {
        type = 'Top-up';
      } else if (type === 'adjustment') {
        type = 'Adjustment';
      }
      const amount = txn.amount || 0;
      doc.text(date, startX + 2, yPos + 4.5);
      doc.text(type, startX + 50, yPos + 4.5);
      doc.text(formatMoney(amount), startX + 100, yPos + 4.5);
      yPos += 7;
    });
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(...COLORS.textLight);
    doc.text('No payment history available for this loan.', 20, yPos);
    yPos += 8;
  }

  // ========== LOAN BREAKDOWN ==========
  yPos += 8;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.primaryBlue);
  doc.text('LOAN BREAKDOWN', 20, yPos);
  yPos += 8;

  const colWidths = [90, 80];
  doc.setFillColor(...COLORS.primaryBlue);
  doc.setTextColor(...COLORS.white);
  doc.setFont('helvetica', 'bold');
  doc.rect(startX, yPos, 170, 8, 'F');
  doc.text('Description', startX + 2, yPos + 5.5);
  doc.text('Amount (KES)', startX + colWidths[0] + 2, yPos + 5.5);
  yPos += 8;

  doc.setTextColor(...COLORS.textDark);
  doc.setFont('helvetica', 'normal');

  const breakdown = [
    { label: 'Initial Principal Borrowed', amount: initialPrincipal },
    { label: 'Current Principal Owed', amount: currentPrincipal },
    { label: (isWeekly ? 'Current Period Interest' : 'Accrued Interest'), amount: isWeekly ? currentPeriodInterest : totalOutstandingInterest },
    { label: 'Total Balance Due', amount: totalBalance, bold: true },
  ];

  breakdown.forEach((item, idx) => {
    if (yPos > 250) {
      doc.addPage();
      addWatermarkToCurrentPage(doc, 'invoice');
      yPos = 20;
      doc.setFillColor(...COLORS.primaryBlue);
      doc.setTextColor(...COLORS.white);
      doc.setFont('helvetica', 'bold');
      doc.rect(startX, yPos, 170, 8, 'F');
      doc.text('Description', startX + 2, yPos + 5.5);
      doc.text('Amount (KES)', startX + colWidths[0] + 2, yPos + 5.5);
      yPos += 8;
      doc.setTextColor(...COLORS.textDark);
      doc.setFont('helvetica', 'normal');
    }
    if (idx % 2 === 0) {
      doc.setFillColor(...COLORS.border);
      doc.rect(startX, yPos, 170, 7, 'F');
    }
    if (item.bold) {
      doc.setFont('helvetica', 'bold');
    } else {
      doc.setFont('helvetica', 'normal');
    }
    doc.text(item.label, startX + 2, yPos + 4.5);
    doc.text(formatMoney(item.amount), startX + colWidths[0] + 2, yPos + 4.5);
    yPos += 7;
  });

  // ========== PAYMENT INSTRUCTIONS ==========
  yPos += 8;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.primaryBlue);
  doc.text('PAYMENT METHOD', 20, yPos);
  yPos += 6;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.textDark);
  doc.text('Paybill No: 247247', 22, yPos);
  yPos += 5;
  doc.text('Account No: 651259', 22, yPos);
  yPos += 5;
  doc.text('Account Name: NAGOLIE ENTERPRISES', 22, yPos);

  addFooter(doc, yPos + 15);
  addPageNumbers(doc, 'page %d');

  const fileName = `Loan_Invoice_${loan.name?.replace(/\s+/g, '_') || 'Client'}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
};

// generate loan waiver agreement pdf
export const generateLoanWaiverAgreementAutoPDF = async (loanData, newPrincipal, durationDays) => {
  try {
    const doc = new jsPDF();
    addOptimizedWatermark(doc, 'agreement');
    let yPos = await addHeader(doc, 10);

    // ---- Helper functions (thumbprint & checkboxes) ----
    const drawThumbprintBox = (x, y, width = 40, height = 35) => {
      doc.setDrawColor(230, 235, 245);
      doc.setLineWidth(0.3);
      doc.roundedRect(x, y, width, height, 2, 2);
      doc.setTextColor(230, 235, 240);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.text('THUMB PRINT', x + width / 2, y + height / 2, { align: 'center' });
      doc.setTextColor(...COLORS.textDark);
      doc.setFont('helvetica', 'normal');
    };

    const drawRtLtCheckboxes = (x, y) => {
      doc.setTextColor(...COLORS.textDark);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.3);
      doc.rect(x, y, 4, 4);
      doc.text('R.T', x + 5, y + 3.5);
      doc.rect(x + 22, y, 4, 4);
      doc.text('L.T', x + 27, y + 3.5);
    };

    const currentDate = new Date();
    const formattedDate = currentDate.toLocaleDateString('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
    const dueDate = new Date(Date.now() + durationDays * 86400000).toLocaleDateString('en-GB');

    // ---- Title ----
    doc.setTextColor(...COLORS.primaryBlue);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('LOAN WAIVER AGREEMENT', 105, yPos, { align: 'center' });
    yPos += 8;
    yPos = addDivider(doc, yPos);

    // ---- Borrower Information ----
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.textDark);
    doc.setFont('helvetica', 'bold');
    doc.text('Borrower Information:', 20, yPos);
    yPos += 6;
    
    doc.setFont('helvetica', 'normal');
    doc.text('Name: ', 25, yPos);
    doc.setFont('helvetica', 'bold');
    doc.text(loanData.name || '___________________', 25 + doc.getTextWidth('Name: '), yPos);
    yPos += 5.5;
    
    doc.setFont('helvetica', 'normal');
    doc.text('ID Number: ', 25, yPos);
    doc.setFont('helvetica', 'bold');
    doc.text(loanData.idNumber || '___________________', 25 + doc.getTextWidth('ID Number: '), yPos);
    yPos += 5.5;
    
    doc.setFont('helvetica', 'normal');
    doc.text('Phone: ', 25, yPos);
    doc.setFont('helvetica', 'bold');
    doc.text(loanData.phone || '___________________', 25 + doc.getTextWidth('Phone: '), yPos);
    yPos += 10;

    // ---- Original Loan Details ----
    doc.setFont('helvetica', 'bold');
    doc.text('Original Loan Details:', 20, yPos);
    yPos += 6;
    
    doc.setFont('helvetica', 'normal');
    doc.text('Original Loan Amount: ', 25, yPos);
    doc.setFont('helvetica', 'bold');
    doc.text(`KES ${(loanData.borrowedAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      25 + doc.getTextWidth('Original Loan Amount: '), yPos);
    yPos += 5.5;
    
    doc.setFont('helvetica', 'normal');
    doc.text('Outstanding Balance before Waiver: ', 25, yPos);
    doc.setFont('helvetica', 'bold');
    doc.text(`KES ${(loanData.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      25 + doc.getTextWidth('Outstanding Balance before Waiver: '), yPos);
    yPos += 10;

    // ---- Waiver Terms heading ----
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.primaryBlue);
    doc.text('WAIVER TERMS', 105, yPos, { align: 'center' });
    yPos += 8;

    // ---- Waiver Terms list ----
    doc.setFontSize(10.5);
    doc.setTextColor(...COLORS.textDark);
    doc.setFont('helvetica', 'normal');

    const addWrappedLine = (text, y) => {
      const lines = doc.splitTextToSize(text, 170);
      lines.forEach(line => {
        doc.text(line, 20, y);
        y += 5;
      });
      return y;
    };

    yPos = addWrappedLine("1. The Borrower acknowledges that the original loan has become difficult to repay due to genuine challenges.", yPos);
    yPos = addWrappedLine("2. The Company, in good faith, agrees to waive a portion of the outstanding balance.", yPos);

    // Clause 3 (with bold amount)
    const clause3Prefix = "3. The Borrower shall now repay an agreed amount of ";
    doc.setFont('helvetica', 'normal');
    doc.text(clause3Prefix, 20, yPos);
    const xAfter = 20 + doc.getTextWidth(clause3Prefix);
    doc.setFont('helvetica', 'bold');
    const amountText = `KES ${newPrincipal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    doc.text(amountText, xAfter, yPos);
    doc.setFont('helvetica', 'normal');
    yPos += 5;

    // Clause 4 (with bold due date)
    const clause4Prefix = `4. The agreed amount must be repaid within ${durationDays} days from the date of this agreement (due date: `;
    doc.setFont('helvetica', 'normal');
    doc.text(clause4Prefix, 20, yPos);
    const xAfter4 = 20 + doc.getTextWidth(clause4Prefix);
    doc.setFont('helvetica', 'bold');
    doc.text(`${dueDate})`, xAfter4, yPos);
    doc.setFont('helvetica', 'normal');
    yPos += 5;

    // Remaining clauses
    yPos = addWrappedLine("5. No further interest will accrue on this waived amount. The new loan carries 0% interest.", yPos);
    yPos = addWrappedLine("6. All other terms of the original Livestock Advance Payment Agreement (collateral, ownership, etc.) remain in full force.", yPos);
    yPos = addWrappedLine("7. Failure to repay the agreed amount by the due date will constitute default, and the Company may take possession of the collateral livestock without further notice.", yPos);
    yPos = addWrappedLine("8. This waiver agreement is effective from the date signed below.", yPos);
    yPos += 8;

    // ---- Signatures section ----
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...COLORS.primaryBlue);
    doc.text('SIGNATURES', 105, yPos, { align: 'center' });
    yPos += 8;

    doc.setFontSize(10);
    doc.setTextColor(...COLORS.textDark);
    doc.setFont('helvetica', 'bold');
    doc.text('CLIENT:', 20, yPos);
    yPos += 5;
    
    doc.setFont('helvetica', 'normal');
    doc.text(`Name: ${loanData.name || '___________________'}`, 25, yPos);
    yPos += 4.5;
    doc.text('Signature: ___________________', 25, yPos);
    yPos += 4.5;
    doc.text(`Date: ${formattedDate}`, 25, yPos);
    yPos += 8;

    const leftX = 20;
    const rightX = 20 + 95;

    doc.setFont('helvetica', 'bold');
    doc.text('CONFIRMED BY:', 20, yPos);
    yPos += 6;

    doc.setFont('helvetica', 'bold');
    doc.text('Shadrack Kesumet', leftX, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text('Director', leftX, yPos + 5);
    doc.text('Sign: ___________________', leftX, yPos + 10);

    doc.setFont('helvetica', 'bold');
    doc.text('Name: _________________________', rightX, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text('Livestock Valuer', rightX, yPos + 5);
    doc.text('Sign: ___________________', rightX, yPos + 10);

    yPos += 18;

    // ---- Stamp Box (left) and Thumbprint Box (right) ----
    const boxWidth = 60;
    const boxHeight = 35;
    const leftBoxX = 20;                 // stamp on left
    const rightBoxX = 210 - 20 - boxWidth; // thumbprint on right
    const boxesY = yPos;

    // Stamp box (left)
    doc.setDrawColor(230, 235, 245);
    doc.setLineWidth(0.3);
    doc.roundedRect(leftBoxX, boxesY, boxWidth, boxHeight, 2, 2);
    const stampCenterX = leftBoxX + boxWidth / 2;
    const stampCenterY = boxesY + boxHeight / 2;
    doc.setTextColor(230, 235, 240);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.text('OFFICIAL COMPANY STAMP', stampCenterX, stampCenterY - 3, { align: 'center' });
    doc.text('(To be affixed here)', stampCenterX, stampCenterY + 3, { align: 'center' });

    // Thumbprint box (right)
    drawThumbprintBox(rightBoxX, boxesY, boxWidth, boxHeight);
    // Place checkboxes centered below the thumbprint box
    const checkY = boxesY + boxHeight + 4;
    const groupWidth = 50 + 5 + 20; // approximate width of both checkboxes + labels
    const checkX = rightBoxX + (boxWidth / 2) - (groupWidth / 2);
    drawRtLtCheckboxes(checkX, checkY);

    // Advance yPos past the boxes (plus checkboxes)
    yPos = checkY + 12;

    // ---- Footer ----
    const footerY = 285;
    doc.setTextColor(...COLORS.textLight);
    doc.setFontSize(8);
    doc.text(`Generated on: ${new Date().toLocaleDateString('en-GB')}`, 20, footerY);
    doc.setTextColor(...COLORS.textDark);
    doc.setFontSize(9);
    doc.text('Thank you for choosing Nagolie Enterprises!', 105, footerY + 5, { align: 'center' });

    const fileName = `Loan_Waiver_${loanData.name?.replace(/\s+/g, '_') || 'Client'}_${formattedDate.replace(/\//g, '-')}.pdf`;
    doc.save(fileName);

  } catch (error) {
    console.error('Error generating loan waiver agreement:', error);
    throw error;
  }
};

//generate manual loan waiver agreement pdf
export const generateManualLoanWaiverAgreementPDF = async () => {
  try {
    const doc = new jsPDF();
    addOptimizedWatermark(doc, 'agreement');
    let yPos = await addHeader(doc, 10);

    // ---- Helper functions (thumbprint & checkboxes) ----
    const drawThumbprintBox = (x, y, width = 40, height = 35) => {
      doc.setDrawColor(230, 235, 245);
      doc.setLineWidth(0.3);
      doc.roundedRect(x, y, width, height, 2, 2);
      doc.setTextColor(230, 235, 240);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.text('THUMB PRINT', x + width / 2, y + height / 2, { align: 'center' });
      doc.setTextColor(...COLORS.textDark);
      doc.setFont('helvetica', 'normal');
    };

    const drawRtLtCheckboxes = (x, y) => {
      doc.setTextColor(...COLORS.textDark);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.3);
      doc.rect(x, y, 4, 4);
      doc.text('R.T', x + 5, y + 3.5);
      doc.rect(x + 22, y, 4, 4);
      doc.text('L.T', x + 27, y + 3.5);
    };

    const currentDate = new Date();
    const formattedDate = currentDate.toLocaleDateString('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });

    // ---- Title ----
    doc.setTextColor(...COLORS.primaryBlue);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('LOAN WAIVER AGREEMENT', 105, yPos, { align: 'center' });
    yPos += 8;
    yPos = addDivider(doc, yPos);

    // ---- Borrower Information (blank fields) ----
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.textDark);
    doc.setFont('helvetica', 'bold');
    doc.text('Borrower Information:', 20, yPos);
    yPos += 6;
    
    doc.setFont('helvetica', 'normal');
    doc.text('Name: _______________________________', 25, yPos);
    yPos += 5.5;
    
    doc.text('ID Number: _______________________________', 25, yPos);
    yPos += 5.5;
    
    doc.text('Phone: _______________________________', 25, yPos);
    yPos += 10;

    // ---- Original Loan Details (blank fields) ----
    doc.setFont('helvetica', 'bold');
    doc.text('Original Loan Details:', 20, yPos);
    yPos += 6;
    
    doc.setFont('helvetica', 'normal');
    doc.text('Original Loan Amount: KES _________________', 25, yPos);
    yPos += 5.5;
    
    doc.text('Outstanding Balance before Waiver: KES _________________', 25, yPos);
    yPos += 10;

    // ---- Waiver Terms heading ----
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.primaryBlue);
    doc.text('WAIVER TERMS', 105, yPos, { align: 'center' });
    yPos += 8;

    // ---- Waiver Terms list (plain text, no auto‑filled values) ----
    doc.setFontSize(10.5);
    doc.setTextColor(...COLORS.textDark);
    doc.setFont('helvetica', 'normal');

    const addWrappedLine = (text, y) => {
      const lines = doc.splitTextToSize(text, 170);
      lines.forEach(line => {
        doc.text(line, 20, y);
        y += 5;
      });
      return y;
    };

    yPos = addWrappedLine("1. The Borrower acknowledges that the original loan has become difficult to repay due to genuine challenges.", yPos);
    yPos = addWrappedLine("2. The Company, in good faith, agrees to waive a portion of the outstanding balance.", yPos);

    // Clause 3 – with blank for amount
    doc.setFont('helvetica', 'normal');
    doc.text("3. The Borrower shall now repay an agreed amount of KES ____________________.", 20, yPos);
    yPos += 5;

    // Clause 4 – with blanks for duration and due date
    doc.setFont('helvetica', 'normal');
    doc.text("4. The agreed amount must be repaid within ____ days from the date of this agreement (due date: ____________).", 20, yPos);
    yPos += 5;

    // Remaining clauses
    yPos = addWrappedLine("5. No further interest will accrue on this waived amount. The new loan carries 0% interest.", yPos);
    yPos = addWrappedLine("6. All other terms of the original Livestock Advance Payment Agreement (collateral, ownership, etc.) remain in full force.", yPos);
    yPos = addWrappedLine("7. Failure to repay the agreed amount by the due date will constitute default, and the Company may take possession of the collateral livestock without further notice.", yPos);
    yPos = addWrappedLine("8. This waiver agreement is effective from the date signed below.", yPos);
    yPos += 8;

    // ---- Signatures section ----
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...COLORS.primaryBlue);
    doc.text('SIGNATURES', 105, yPos, { align: 'center' });
    yPos += 8;

    doc.setFontSize(10);
    doc.setTextColor(...COLORS.textDark);
    doc.setFont('helvetica', 'bold');
    doc.text('CLIENT:', 20, yPos);
    yPos += 5;
    
    doc.setFont('helvetica', 'normal');
    doc.text('Name: _________________________', 25, yPos);
    yPos += 4.5;
    doc.text('Signature: ___________________', 25, yPos);
    yPos += 4.5;
    doc.text(`Date: ___________________`, 25, yPos);
    yPos += 8;

    const leftX = 20;
    const rightX = 20 + 95;

    doc.setFont('helvetica', 'bold');
    doc.text('CONFIRMED BY:', 20, yPos);
    yPos += 6;

    doc.setFont('helvetica', 'bold');
    doc.text('Shadrack Kesumet', leftX, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text('Director', leftX, yPos + 5);
    doc.text('Sign: ___________________', leftX, yPos + 10);

    doc.setFont('helvetica', 'bold');
    doc.text('Name: _________________________', rightX, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text('Livestock Valuer', rightX, yPos + 5);
    doc.text('Sign: ___________________', rightX, yPos + 10);

    yPos += 18;

    // ---- Stamp Box (left) with image, Thumbprint Box (right) ----
    const boxWidth = 60;
    const boxHeight = 35;
    const leftBoxX = 20;                 // stamp on left
    const rightBoxX = 210 - 20 - boxWidth; // thumbprint on right
    const boxesY = yPos;

    // Stamp box (left) – load manual stamp image
    let stampBase64 = null;
    try {
      stampBase64 = await getLogoBase64('/nagolie-stamp-manual.png');
    } catch (error) {
      console.warn('Failed to load stamp image:', error);
    }

    if (stampBase64) {
      doc.addImage(stampBase64, 'PNG', leftBoxX, boxesY, boxWidth, boxHeight);
    } else {
      // Fallback to drawn box
      doc.setDrawColor(230, 235, 245);
      doc.setLineWidth(0.3);
      doc.roundedRect(leftBoxX, boxesY, boxWidth, boxHeight, 2, 2);
      const stampCenterX = leftBoxX + boxWidth / 2;
      const stampCenterY = boxesY + boxHeight / 2;
      doc.setTextColor(230, 235, 240);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'italic');
      doc.text('OFFICIAL COMPANY STAMP', stampCenterX, stampCenterY - 3, { align: 'center' });
      doc.text('(To be affixed here)', stampCenterX, stampCenterY + 3, { align: 'center' });
    }

    // Thumbprint box (right)
    drawThumbprintBox(rightBoxX, boxesY, boxWidth, boxHeight);
    // Place checkboxes centered below the thumbprint box
    const checkY = boxesY + boxHeight + 4;
    const groupWidth = 50 + 5 + 20;
    const checkX = rightBoxX + (boxWidth / 2) - (groupWidth / 2);
    drawRtLtCheckboxes(checkX, checkY);

    // Advance yPos past the boxes (plus checkboxes)
    yPos = checkY + 12;

    // ---- Footer ----
    const footerY = 285;
    doc.setTextColor(...COLORS.textLight);
    doc.setFontSize(8);
    doc.text(`Generated on: ${new Date().toLocaleDateString('en-GB')}`, 20, footerY);
    doc.setTextColor(...COLORS.textDark);
    doc.setFontSize(9);
    doc.text('Thank you for choosing Nagolie Enterprises!', 105, footerY + 5, { align: 'center' });

    const fileName = `Manual_Loan_Waiver_Agreement_${formattedDate.replace(/\//g, '-')}.pdf`;
    doc.save(fileName);

  } catch (error) {
    console.error('Error generating manual loan waiver agreement:', error);
    throw error;
  }
};

// ========== SECRETARY EMPLOYMENT CONTRACT PDF ==========
export const generateSecretaryContractPDF = async () => {
  try {
    const doc = new jsPDF();
    addOptimizedWatermark(doc, 'agreement');

    let yPos = await addHeader(doc, 10);

    // Main Title
    doc.setTextColor(...COLORS.primaryBlue);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('EMPLOYMENT CONTRACT', 105, yPos, { align: 'center' });
    yPos += 6;
    doc.setFontSize(13);
    doc.text('SECRETARY EMPLOYMENT AGREEMENT', 105, yPos, { align: 'center' });
    yPos += 8;
    yPos = addDivider(doc, yPos);

    // Parties
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.textDark);
    doc.text('This Employment Agreement is made between:', 20, yPos);
    yPos += 8;

    doc.setFont('helvetica', 'normal');
    doc.text('Nagolie Enterprises (hereinafter referred to as “the Employer”)', 25, yPos);
    yPos += 6;
    doc.text('and', 25, yPos);
    yPos += 6;
    doc.text('_________________________ (hereinafter referred to as “the Employee”)', 25, yPos);
    yPos += 12;

    // 1. Position
    doc.setFont('helvetica', 'bold');
    doc.text('1. Position', 20, yPos);
    yPos += 5;
    doc.setFont('helvetica', 'normal');
    doc.text('The Employee is hereby employed as an Office Secretary based at the Isinya Office,', 20, yPos);
    yPos += 4.5;
    doc.text('with responsibilities that include coordination with other company branches.', 20, yPos);
    yPos += 8;

    // 2. Duties and Responsibilities
    doc.setFont('helvetica', 'bold');
    doc.text('2. Duties and Responsibilities', 20, yPos);
    yPos += 5;
    doc.setFont('helvetica', 'normal');
    const duties = [
      'Receive and attend to clients visiting the office',
      'Manage and update the recovery module in line with directives from the Director',
      'Conduct client follow-ups through calls and other communication channels',
      'Prepare reports on payments, client issues, and operational updates',
      'Coordinate communication between the main office and branch offices',
      'Manage petty cash and maintain proper accountability',
      'Support general office operations, including maintaining a conducive working environment',
      'Perform any other reasonable administrative duties assigned by the Employer'
    ];
    duties.forEach(duty => {
      if (yPos > 270) {
        doc.addPage();
        addWatermarkToCurrentPage(doc, 'agreement');
        doc.setFont('helvetica', 'normal');
        yPos = 20;
      }
      doc.text(`• ${duty}`, 25, yPos);
      yPos += 4.5;
    });
    yPos += 4;

    // 3. Working Hours
    if (yPos > 270) {
      doc.addPage();
      addWatermarkToCurrentPage(doc, 'agreement');
      yPos = 20;
    }
    doc.setFont('helvetica', 'bold');
    doc.text('3. Working Hours', 20, yPos);
    yPos += 5;
    doc.setFont('helvetica', 'normal');
    doc.text('The Employee shall work from 8:00 AM to 5:00 PM, Monday to Friday.', 20, yPos);
    yPos += 5;
    doc.text('Due to the Company’s 24-hour operational nature, the Employee may be required to work on weekends', 20, yPos);
    yPos += 4.5;
    doc.text('to support business operations as needed.', 20, yPos);
    yPos += 5;
    doc.text('Any changes to working hours shall be communicated by the Employer.', 20, yPos);
    yPos += 8;

    // 4. Salary
    if (yPos > 270) {
      doc.addPage();
      addWatermarkToCurrentPage(doc, 'agreement');
      yPos = 20;
    }
    doc.setFont('helvetica', 'bold');
    doc.text('4. Salary', 20, yPos);
    yPos += 5;
    doc.setFont('helvetica', 'normal');
    doc.text('The Employee shall receive a monthly salary of KES 13,000 (Thirteen Thousand Only).', 20, yPos);
    yPos += 4.5;
    doc.text('Salary shall be paid at the end of each month.', 20, yPos);
    yPos += 8;

    // 5. Growth and Role Development
    if (yPos > 270) {
      doc.addPage();
      addWatermarkToCurrentPage(doc, 'agreement');
      yPos = 20;
    }
    doc.setFont('helvetica', 'bold');
    doc.text('5. Growth and Role Development', 20, yPos);
    yPos += 5;
    doc.setFont('helvetica', 'normal');
    doc.text('The Employee acknowledges that this role carries potential for advancement into a Head', 20, yPos);
    yPos += 4.5;
    doc.text('Secretary position as the company expands. Additional responsibilities may be assigned', 20, yPos);
    yPos += 4.5;
    doc.text('in line with company growth.', 20, yPos);
    yPos += 8;

    // 6. Conduct and Performance
    if (yPos > 270) {
      doc.addPage();
      addWatermarkToCurrentPage(doc, 'agreement');
      yPos = 20;
    }
    doc.setFont('helvetica', 'bold');
    doc.text('6. Conduct and Performance', 20, yPos);
    yPos += 5;
    doc.setFont('helvetica', 'normal');
    doc.text('The Employee is expected to work with minimal supervision, demonstrate professionalism,', 20, yPos);
    yPos += 4.5;
    doc.text('and align with the company’s mission and objectives. The Employee shall perform duties', 20, yPos);
    yPos += 4.5;
    doc.text('diligently, honestly, and in the best interest of the Employer.', 20, yPos);
    yPos += 8;

    // 7. Confidentiality
    if (yPos > 270) {
      doc.addPage();
      addWatermarkToCurrentPage(doc, 'agreement');
      yPos = 20;
    }
    doc.setFont('helvetica', 'bold');
    doc.text('7. Confidentiality', 20, yPos);
    yPos += 5;
    doc.setFont('helvetica', 'normal');
    doc.text('The Employee shall not disclose any confidential company or client information', 20, yPos);
    yPos += 4.5;
    doc.text('during or after employment.', 20, yPos);
    yPos += 8;

    // 8. Termination
    if (yPos > 270) {
      doc.addPage();
      addWatermarkToCurrentPage(doc, 'agreement');
      yPos = 20;
    }
    doc.setFont('helvetica', 'bold');
    doc.text('8. Termination', 20, yPos);
    yPos += 5;
    doc.setFont('helvetica', 'normal');
    doc.text('Either party may terminate this agreement by giving 14 days notice or payment in lieu', 20, yPos);
    yPos += 4.5;
    doc.text('of notice. The Employer reserves the right to terminate employment in cases of', 20, yPos);
    yPos += 4.5;
    doc.text('misconduct or breach of contract.', 20, yPos);
    yPos += 8;

    // 9. Commencement Date
    if (yPos > 270) {
      doc.addPage();
      addWatermarkToCurrentPage(doc, 'agreement');
      yPos = 20;
    }
    doc.setFont('helvetica', 'bold');
    doc.text('9. Commencement Date', 20, yPos);
    yPos += 5;
    doc.setFont('helvetica', 'normal');
    doc.text('This agreement shall take effect from _______________________.', 20, yPos);
    yPos += 10;

    // Signatures
    if (yPos > 230) {
      doc.addPage();
      addWatermarkToCurrentPage(doc, 'agreement');
      yPos = 20;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...COLORS.primaryBlue);
    doc.text('10. Acceptance', 105, yPos, { align: 'center' });
    yPos += 8;

    doc.setFontSize(10);
    doc.setTextColor(...COLORS.textDark);

    // Employer signature block
    doc.setFont('helvetica', 'bold');
    doc.text('FOR NAGOLIE ENTERPRISES (Employer):', 20, yPos);
    yPos += 6;
    doc.setFont('helvetica', 'normal');
    doc.text('Name: Shadrack Kesumet', 25, yPos);
    yPos += 5;
    doc.text('Title: Director', 25, yPos);
    yPos += 5;
    doc.text('Signature: _________________________', 25, yPos);
    yPos += 5;
    doc.text('Date: _________________________', 25, yPos);
    yPos += 10;

    // Employee signature block
    doc.setFont('helvetica', 'bold');
    doc.text('EMPLOYEE:', 20, yPos);
    yPos += 6;
    doc.setFont('helvetica', 'normal');
    doc.text('Name: _________________________', 25, yPos);
    yPos += 5;
    doc.text('Signature: _________________________', 25, yPos);
    yPos += 5;
    doc.text('Date: _________________________', 25, yPos);

    // Footer
    addFooter(doc, yPos + 15);

    const fileName = `Secretary_Employment_Contract_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
  } catch (error) {
    console.error('Error generating secretary contract:', error);
    throw error;
  }
};

// ========== LEAVE REQUEST PDF (AUTO‑FILLED) ==========
export const generateLeaveRequestPDF = async (data, preview = true) => {
  const doc = new jsPDF();
  addOptimizedWatermark(doc, 'leaveForm');
  let yPos = await addHeader(doc, 15);

  const formatDateToDDMMYYYY = (dateStr) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  };

  // Title
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.primaryBlue);
  doc.text('LEAVE REQUEST FORM', 105, yPos, { align: 'center' });
  yPos += 8;
  yPos = addDivider(doc, yPos);
  yPos += 4;

  // Date
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.textDark);
  doc.text(`Date: ${data.date || new Date().toLocaleDateString('en-GB')}`, 150, yPos - 6);

  // Requester details
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Requested by:', 20, yPos);
  doc.setFont('helvetica', 'normal');
  doc.text(data.requesterName, 55, yPos);
  yPos += 8;
  doc.setFont('helvetica', 'bolditalic');
  doc.text(`Role: ${data.requesterRole}`, 55, yPos);
  yPos += 10;

  // Leave dates
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Leave Dates:', 20, yPos);
  doc.setFont('helvetica', 'normal');
  doc.text(`From: ${formatDateToDDMMYYYY(data.fromDate)}`, 55, yPos);
  yPos += 8;
  doc.text(`To: ${formatDateToDDMMYYYY(data.toDate)}`, 55, yPos);
  yPos += 10;

  // Reason – render only the actual content, no fixed maximum, then add a blank line
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Reason for leave:', 20, yPos);
  yPos += 6;
  doc.setFont('helvetica', 'normal');
  const reasonLines = doc.splitTextToSize(data.reason, 170);
  for (let i = 0; i < reasonLines.length; i++) {
    doc.text(reasonLines[i], 20, yPos);
    yPos += 7;
  }
  // Add extra spacing after the reason (skip a line)
  if (reasonLines.length > 0) {
    yPos += 7;
  } else {
    yPos += 7; // still add some space even if empty
  }
  yPos += 4; // small additional gap before approval

  // Approval section
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...COLORS.primaryBlue);
  doc.text('APPROVAL', 105, yPos, { align: 'center' });
  yPos += 8;
  doc.setTextColor(...COLORS.textDark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Approved by: Shadrack Kesumet', 20, yPos);
  yPos += 6;
  doc.setFont('helvetica', 'bolditalic');
  doc.text('                        Director', 20, yPos);
  yPos += 10;
  doc.setFont('helvetica', 'normal');
  doc.text('Signature: _________________________', 20, yPos);
  yPos += 14;
  doc.text('Date: _________________________', 20, yPos);
  yPos += 12;

  // Stamp box
  const stampBoxWidth = 60;
  const stampBoxHeight = 35;
  const stampBoxX = (210 - stampBoxWidth) / 2;
  const stampBoxY = yPos;
  doc.setDrawColor(230, 235, 245);
  doc.setLineWidth(0.3);
  doc.roundedRect(stampBoxX, stampBoxY, stampBoxWidth, stampBoxHeight, 2, 2);
  doc.setTextColor(230, 235, 240);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'italic');
  doc.text('OFFICIAL COMPANY STAMP', stampBoxX + stampBoxWidth/2, stampBoxY + stampBoxHeight/2 - 3, { align: 'center' });
  doc.text('(To be affixed here)', stampBoxX + stampBoxWidth/2, stampBoxY + stampBoxHeight/2 + 3, { align: 'center' });

  addFooter(doc, stampBoxY + stampBoxHeight + 10);

  if (preview) {
    const pdfBlob = doc.output('blob');
    const url = URL.createObjectURL(pdfBlob);
    window.open(url, '_blank');
    URL.revokeObjectURL(url);
  } else {
    const fileName = `Leave_Request_${data.requesterName.replace(/\s+/g, '_')}_${(data.date || new Date().toLocaleDateString('en-GB')).replace(/\//g, '-')}.pdf`;
    doc.save(fileName);
  }
};

// ========== MANUAL LEAVE REQUEST PDF (BLANK – DOWNLOAD ONLY) ==========
export const generateManualLeaveRequestPDF = async () => {
  const doc = new jsPDF();
  addOptimizedWatermark(doc, 'leaveForm');
  let yPos = await addHeader(doc, 15);

  // Title
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.primaryBlue);
  doc.text('LEAVE REQUEST FORM', 105, yPos, { align: 'center' });
  yPos += 8;
  yPos = addDivider(doc, yPos);
  yPos += 4;

  // Date of application – blank line
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.textDark);
  doc.text(`Date: ________________`, 150, yPos - 6);
  yPos += 2;

  // Requester details – name and role separate
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Requested by:', 20, yPos);
  doc.setFont('helvetica', 'normal');
  doc.text('____________________________', 55, yPos);
  yPos += 8;
  doc.setFont('helvetica', 'bolditalic');
  doc.text('Role: __________________', 55, yPos);
  yPos += 10;

  // Leave dates (blanks)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Leave Dates:', 20, yPos);
  doc.setFont('helvetica', 'normal');
  doc.text('From: __________________', 55, yPos);
  yPos += 8;
  doc.text('To: __________________', 55, yPos);
  yPos += 10;

  // Reason – 10 blank lines with long underscores (no text)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Reason for leave:', 20, yPos);
  yPos += 6;
  doc.setFont('helvetica', 'normal');
  for (let i = 0; i < 10; i++) {
    doc.text('__________________________________________________________________________', 20, yPos);
    yPos += 7;
  }
  yPos += 8;

  // Approval section
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...COLORS.primaryBlue);
  doc.text('APPROVAL', 105, yPos, { align: 'center' });
  yPos += 8;
  doc.setTextColor(...COLORS.textDark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Approved by: Shadrack Kesumet', 20, yPos);
  yPos += 6;
  doc.setFont('helvetica', 'bolditalic');
  doc.text('                        Director', 20, yPos);
  yPos += 10;
  doc.setFont('helvetica', 'normal');
  doc.text('Signature: ', 20, yPos);
  yPos += 14;
  doc.text('Date: _________________________', 20, yPos);
  yPos += 12;

  // Stamp box
  const stampBoxWidth = 60;
  const stampBoxHeight = 35;
  const stampBoxX = (210 - stampBoxWidth) / 2;
  const stampBoxY = yPos;
  doc.setDrawColor(230, 235, 245);
  doc.setLineWidth(0.3);
  doc.roundedRect(stampBoxX, stampBoxY, stampBoxWidth, stampBoxHeight, 2, 2);
  doc.setTextColor(230, 235, 240);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'italic');
  doc.text('OFFICIAL COMPANY STAMP', stampBoxX + stampBoxWidth/2, stampBoxY + stampBoxHeight/2 - 3, { align: 'center' });
  doc.text('(To be affixed here)', stampBoxX + stampBoxWidth/2, stampBoxY + stampBoxHeight/2 + 3, { align: 'center' });

  addFooter(doc, stampBoxY + stampBoxHeight + 10);

  const fileName = `Manual_Leave_Request_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
};

// ========== INVOICE PDF (supports preview and download) ==========
export const generateInvoicePDF = async (data, preview = false) => {
  const doc = new jsPDF();
  addOptimizedWatermark(doc, 'invoice');
  let yPos = await addHeader(doc, 15);

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.primaryBlue);
  doc.text('INVOICE', 105, yPos, { align: 'center' });
  yPos += 8;
  yPos = addDivider(doc, yPos);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.textDark);
  doc.text(`Invoice Number: ${data.invoiceNumber}`, 20, yPos);
  doc.text(`Date: ${data.date}`, 150, yPos);
  yPos += 8;
  doc.text(`Client: ${data.clientName}`, 20, yPos);
  if (data.clientEmail) {
    yPos += 5;
    doc.text(`Email: ${data.clientEmail}`, 20, yPos);
  }
  yPos += 12;

  const startX = 20;
  const colWidths = [70, 25, 35, 40];
  doc.setFillColor(...COLORS.primaryBlue);
  doc.setTextColor(...COLORS.white);
  doc.setFont('helvetica', 'bold');
  doc.rect(startX, yPos, 170, 8, 'F');
  doc.text('Description', startX + 2, yPos + 5.5);
  doc.text('Qty', startX + colWidths[0] + 2, yPos + 5.5);
  doc.text('Unit Price', startX + colWidths[0] + colWidths[1] + 2, yPos + 5.5);
  doc.text('Total', startX + colWidths[0] + colWidths[1] + colWidths[2] + 2, yPos + 5.5);
  yPos += 8;

  doc.setTextColor(...COLORS.textDark);
  doc.setFont('helvetica', 'normal');
  data.items.forEach((item, idx) => {
    if (yPos > 250) {
      doc.addPage();
      addWatermarkToCurrentPage(doc, 'invoice');
      yPos = 20;
      doc.setFillColor(...COLORS.primaryBlue);
      doc.setTextColor(...COLORS.white);
      doc.setFont('helvetica', 'bold');
      doc.rect(startX, yPos, 170, 8, 'F');
      doc.text('Description', startX + 2, yPos + 5.5);
      doc.text('Qty', startX + colWidths[0] + 2, yPos + 5.5);
      doc.text('Unit Price', startX + colWidths[0] + colWidths[1] + 2, yPos + 5.5);
      doc.text('Total', startX + colWidths[0] + colWidths[1] + colWidths[2] + 2, yPos + 5.5);
      yPos += 8;
      doc.setTextColor(...COLORS.textDark);
      doc.setFont('helvetica', 'normal');
    }
    if (idx % 2 === 0) {
      doc.setFillColor(...COLORS.border);
      doc.rect(startX, yPos, 170, 7, 'F');
    }
    let desc = item.description;
    if (doc.getTextWidth(desc) > colWidths[0] - 4) {
      while (doc.getTextWidth(desc + '...') > colWidths[0] - 4 && desc.length > 0) {
        desc = desc.slice(0, -1);
      }
      desc = desc + '...';
    }
    doc.text(desc, startX + 2, yPos + 4.5);
    doc.text(item.quantity.toString(), startX + colWidths[0] + 2, yPos + 4.5);
    doc.text(formatCurrency(item.unitPrice), startX + colWidths[0] + colWidths[1] + 2, yPos + 4.5);
    doc.text(formatCurrency(item.total), startX + colWidths[0] + colWidths[1] + colWidths[2] + 2, yPos + 4.5);
    yPos += 7;
  });

  yPos += 5;
  doc.setFont('helvetica', 'bold');
  doc.text(`Subtotal: ${formatCurrency(data.subtotal)}`, 140, yPos);
  yPos += 6;
  if (data.discountAmount > 0) {
    doc.text(`Discount: -${formatCurrency(data.discountAmount)}`, 140, yPos);
    yPos += 6;
  }
  if (data.taxRate > 0) {
    doc.text(`Tax (${data.taxRate}%): ${formatCurrency(data.taxAmount)}`, 140, yPos);
    yPos += 6;
  }
  doc.setFontSize(12);
  doc.setTextColor(...COLORS.primaryBlue);
  doc.text(`Total Due: ${formatCurrency(data.total)}`, 140, yPos);

  // ========== PAYMENT INSTRUCTIONS ==========
  yPos += 8;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.primaryBlue);
  doc.text('PAYMENT METHOD', 20, yPos);
  yPos += 6;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.textDark);
  doc.text('Paybill No: 247247', 20, yPos);
  yPos += 5;
  doc.text('Account No: 651259', 20, yPos);
  yPos += 5;
  doc.text('Account Name: NAGOLIE ENTERPRISES', 20, yPos);

  addFooter(doc, yPos + 20);

  if (preview) {
    const pdfBlob = doc.output('blob');
    const url = URL.createObjectURL(pdfBlob);
    window.open(url, '_blank');
    URL.revokeObjectURL(url);
  } else {
    const fileName = `Invoice_${data.invoiceNumber}.pdf`;
    doc.save(fileName);
  }
};

// ========== DELIVERY NOTE PDF ==========
export const generateDeliveryNotePDF = async (data, preview = false) => {
  const doc = new jsPDF();
  addOptimizedWatermark(doc, 'deliveryNote');
  let yPos = await addHeader(doc, 15);

  // Title
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.primaryBlue);
  doc.text('DELIVERY NOTE', 105, yPos, { align: 'center' });
  yPos += 8;
  yPos = addDivider(doc, yPos);

  // Delivery Note Number and Date
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.textDark);
  doc.text(`Delivery Note No: ${data.deliveryNumber}`, 20, yPos);
  doc.text(`Date: ${data.date}`, 150, yPos);
  yPos += 8;
  doc.text(`Client: ${data.clientName}`, 20, yPos);
  if (data.clientEmail) {
    yPos += 5;
    doc.text(`Email: ${data.clientEmail}`, 20, yPos);
  }
  yPos += 12;

  // Table headers
  const startX = 20;
  const colWidths = [70, 25, 35, 40];
  doc.setFillColor(...COLORS.primaryBlue);
  doc.setTextColor(...COLORS.white);
  doc.setFont('helvetica', 'bold');
  doc.rect(startX, yPos, 170, 8, 'F');
  doc.text('Description', startX + 2, yPos + 5.5);
  doc.text('Qty', startX + colWidths[0] + 2, yPos + 5.5);
  doc.text('Unit Price', startX + colWidths[0] + colWidths[1] + 2, yPos + 5.5);
  doc.text('Total', startX + colWidths[0] + colWidths[1] + colWidths[2] + 2, yPos + 5.5);
  yPos += 8;

  doc.setTextColor(...COLORS.textDark);
  doc.setFont('helvetica', 'normal');
  // Table drawing loop with text wrapping
  data.items.forEach((item, idx) => {
    // Split description into lines that fit in column width
    const descLines = doc.splitTextToSize(item.description, colWidths[0] - 4);
    const lineCount = descLines.length;
    const rowHeight = 7 * lineCount; // each line takes ~7 units

    // Check page break
    if (yPos + rowHeight > 270) {
      doc.addPage();
      addWatermarkToCurrentPage(doc, 'deliveryNote');
      yPos = 20;
      // Re‑draw table header on new page
      doc.setFillColor(...COLORS.primaryBlue);
      doc.setTextColor(...COLORS.white);
      doc.setFont('helvetica', 'bold');
      doc.rect(startX, yPos, 170, 8, 'F');
      doc.text('Description', startX + 2, yPos + 5.5);
      doc.text('Qty', startX + colWidths[0] + 2, yPos + 5.5);
      doc.text('Unit Price', startX + colWidths[0] + colWidths[1] + 2, yPos + 5.5);
      doc.text('Total', startX + colWidths[0] + colWidths[1] + colWidths[2] + 2, yPos + 5.5);
      yPos += 8;
      doc.setTextColor(...COLORS.textDark);
      doc.setFont('helvetica', 'normal');
    }

    // Alternate row background
    if (idx % 2 === 0) {
      doc.setFillColor(...COLORS.border);
      doc.rect(startX, yPos, 170, rowHeight, 'F');
    }

    // Draw description lines
    let descY = yPos + 4.5;
    descLines.forEach(line => {
      doc.text(line, startX + 2, descY);
      descY += 7;
    });

    // Quantity (single line, centered vertically)
    const qtyY = yPos + (rowHeight / 2) + 2;
    doc.text(item.quantity.toString(), startX + colWidths[0] + 2, qtyY);

    // Unit Price
    doc.text(formatCurrency(item.unitPrice), startX + colWidths[0] + colWidths[1] + 2, qtyY);

    // Total
    doc.text(formatCurrency(item.total), startX + colWidths[0] + colWidths[1] + colWidths[2] + 2, qtyY);

    yPos += rowHeight;
  });

  yPos += 5;
  doc.setFont('helvetica', 'bold');
  doc.text(`Subtotal: ${formatCurrency(data.subtotal)}`, 140, yPos);
  yPos += 6;
  if (data.discountAmount > 0) {
    doc.text(`Discount: -${formatCurrency(data.discountAmount)}`, 140, yPos);
    yPos += 6;
  }
  if (data.taxRate > 0) {
    doc.text(`Tax (${data.taxRate}%): ${formatCurrency(data.taxAmount)}`, 140, yPos);
    yPos += 6;
  }
  doc.setFontSize(12);
  doc.setTextColor(...COLORS.primaryBlue);
  doc.text(`Total: ${formatCurrency(data.total)}`, 140, yPos);

  // ========== PAYMENT INSTRUCTIONS ==========
  yPos += 8;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.primaryBlue);
  doc.text('PAYMENT METHOD', 20, yPos);
  yPos += 6;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.textDark);
  doc.text('Paybill No: 247247', 20, yPos);
  yPos += 5;
  doc.text('Account No: 651259', 20, yPos);
  yPos += 5;
  doc.text('Account Name: NAGOLIE ENTERPRISES', 20, yPos);
  yPos = 10;

  // Signature section – ensure enough space
  yPos += 15;
  if (yPos > 260) {
    doc.addPage();
    addWatermarkToCurrentPage(doc, 'deliveryNote');
    yPos = 20;
  }

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.primaryBlue);
  doc.text('DELIVERY CONFIRMATION', 105, yPos, { align: 'center' });
  yPos += 10;

  doc.setFontSize(12);
  doc.setTextColor(...COLORS.textDark);

  // Client signature
  doc.setFont('helvetica', 'bold');
  doc.text('Client:', 30, yPos);
  doc.setFont('helvetica', 'normal');
  doc.text(data.clientName, 70, yPos);
  doc.text('Signature: ___________________', 130, yPos);
  yPos += 12;

  // Director signature
  doc.setFont('helvetica', 'bold');
  doc.text('Director:', 30, yPos);
  doc.setFont('helvetica', 'normal');
  doc.text('SHADRACK KESUMET', 70, yPos);
  doc.text('Signature: ___________________', 130, yPos);
  yPos += 12;  

  // Date line for both
  doc.text('Date: ___________________', 30, yPos);
  doc.text('Date: ___________________', 130, yPos);

  // Footer
  addFooter(doc, yPos + 15);
  addPageNumbers(doc, 'page %d');

  if (preview) {
    const pdfBlob = doc.output('blob');
    const url = URL.createObjectURL(pdfBlob);
    window.open(url, '_blank');
    URL.revokeObjectURL(url);
  } else {
    const fileName = `DeliveryNote_${data.deliveryNumber}.pdf`;
    doc.save(fileName);
  }
};

// ========== MANUAL INVOICE PDF (blank, download only) ==========
export const generateManualInvoicePDF = async () => {
  const doc = new jsPDF();
  addOptimizedWatermark(doc, 'invoice');
  let yPos = await addHeader(doc, 15);

  // Title
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.primaryBlue);
  doc.text('INVOICE', 105, yPos, { align: 'center' });
  yPos += 8;
  yPos = addDivider(doc, yPos);

  // Invoice details (blank fields)
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.textDark);
  doc.text('Invoice Number: ____________________', 20, yPos);
  doc.text('Date: ________________', 150, yPos);
  yPos += 8;
  doc.text('Client: ____________________', 20, yPos);
  yPos += 7;
  doc.text('Email: ____________________', 20, yPos);
  yPos += 10;

  const startX = 20;
  const colWidths = [85, 31, 31, 31]; // total 178? Wait: 85+31+31+31 = 178, too wide. Fix: 85+30+30+30=175, need 170. Adjust:
  // Actually 80 + 30 + 30 + 30 = 170. I'll use 80,30,30,30 for perfect fit.
  const fixedColWidths = [80, 30, 30, 30];
  const tableWidth = 170;
  const tableStartY = yPos;
  const headerHeight = 8;
  const rowHeight = 7;
  const numRows = 12;
  const tableHeight = headerHeight + (numRows * rowHeight);
  const radius = 3;

  // Draw outer rounded rectangle border (no fill)
  doc.setDrawColor(...COLORS.primaryBlue);
  doc.setLineWidth(0.5);
  doc.roundedRect(startX, tableStartY, tableWidth, tableHeight, radius, radius);

  // Draw header background (rounded top corners only, but we use a full rounded rect with fill)
  doc.setFillColor(...COLORS.primaryBlue);
  doc.roundedRect(startX, tableStartY, tableWidth, headerHeight, radius, radius, 'F');

  // Draw header text
  doc.setTextColor(...COLORS.white);
  doc.setFont('helvetica', 'bold');
  doc.text('Description', startX + 4, tableStartY + 5.5);
  doc.text('Qty', startX + fixedColWidths[0] + 4, tableStartY + 5.5);
  doc.text('Unit Price', startX + fixedColWidths[0] + fixedColWidths[1] + 4, tableStartY + 5.5);
  doc.text('Total', startX + fixedColWidths[0] + fixedColWidths[1] + fixedColWidths[2] + 4, tableStartY + 5.5);

  // Draw rows
  let currentY = tableStartY + headerHeight;
  doc.setTextColor(...COLORS.textDark);
  doc.setFont('helvetica', 'normal');
  for (let i = 0; i < numRows; i++) {
    if (i % 2 === 0) {
      doc.setFillColor(...COLORS.border);
      doc.rect(startX, currentY, tableWidth, rowHeight, 'F');
    }
    // Vertical lines (cell borders)
    let x = startX;
    for (let w of fixedColWidths) {
      doc.setDrawColor(...COLORS.primaryBlue);
      doc.setLineWidth(0.2);
      doc.line(x, currentY, x, currentY + rowHeight);
      x += w;
    }
    currentY += rowHeight;
  }

  yPos = tableStartY + tableHeight + 10;

  // Totals section
  doc.setFont('helvetica', 'bold');
  doc.text('Subtotal: ____________________', 140, yPos);
  yPos += 7;
  doc.text('Discount: ____________________', 140, yPos);
  yPos += 7;
  doc.text('Tax ( ___%): _________________', 140, yPos);
  yPos += 7;
  doc.setFontSize(12);
  doc.setTextColor(...COLORS.primaryBlue);
  doc.text('Total Due: ________________', 140, yPos);

  // Payment Instructions
  yPos += 10;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.primaryBlue);
  doc.text('PAYMENT METHOD', 20, yPos);
  yPos += 6;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.textDark);
  doc.text('Paybill No: 247247', 20, yPos);
  yPos += 5;
  doc.text('Account No: 651259', 20, yPos);
  yPos += 5;
  doc.text('Account Name: NAGOLIE ENTERPRISES', 20, yPos);

  addFooter(doc, yPos + 20);
  const fileName = `Manual_Invoice_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
};

// ========== MANUAL DELIVERY NOTE PDF (blank, download only) ==========
export const generateManualDeliveryNotePDF = async () => {
  const doc = new jsPDF();
  addOptimizedWatermark(doc, 'deliveryNote');
  let yPos = await addHeader(doc, 15);

  // Title
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.primaryBlue);
  doc.text('DELIVERY NOTE', 105, yPos, { align: 'center' });
  yPos += 8;
  yPos = addDivider(doc, yPos);

  // Delivery Note details
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.textDark);
  doc.text('Delivery Note No: ____________________', 20, yPos);
  doc.text('Date: ________________', 150, yPos);
  yPos += 8;
  doc.text('Client: ____________________', 20, yPos);
  yPos += 7;
  doc.text('Email: ____________________', 20, yPos);
  yPos += 8;

  const startX = 20;
  const colWidths = [80, 30, 30, 30]; // exactly 170 total
  const tableWidth = 170;
  const tableStartY = yPos;
  const headerHeight = 8;
  const rowHeight = 7;
  const numRows = 12;
  const tableHeight = headerHeight + (numRows * rowHeight);
  const radius = 3;

  // Outer rounded rectangle border
  doc.setDrawColor(...COLORS.primaryBlue);
  doc.setLineWidth(0.5);
  doc.roundedRect(startX, tableStartY, tableWidth, tableHeight, radius, radius);

  // Header background (rounded)
  doc.setFillColor(...COLORS.primaryBlue);
  doc.roundedRect(startX, tableStartY, tableWidth, headerHeight, radius, radius, 'F');

  // Header text
  doc.setTextColor(...COLORS.white);
  doc.setFont('helvetica', 'bold');
  doc.text('Description', startX + 4, tableStartY + 5.5);
  doc.text('Qty', startX + colWidths[0] + 4, tableStartY + 5.5);
  doc.text('Unit Price', startX + colWidths[0] + colWidths[1] + 4, tableStartY + 5.5);
  doc.text('Total', startX + colWidths[0] + colWidths[1] + colWidths[2] + 4, tableStartY + 5.5);

  // Rows
  let currentY = tableStartY + headerHeight;
  doc.setTextColor(...COLORS.textDark);
  doc.setFont('helvetica', 'normal');
  for (let i = 0; i < numRows; i++) {
    if (i % 2 === 0) {
      doc.setFillColor(...COLORS.border);
      doc.rect(startX, currentY, tableWidth, rowHeight, 'F');
    }
    let x = startX;
    for (let w of colWidths) {
      doc.setDrawColor(...COLORS.primaryBlue);
      doc.setLineWidth(0.2);
      doc.line(x, currentY, x, currentY + rowHeight);
      x += w;
    }
    currentY += rowHeight;
  }

  yPos = tableStartY + tableHeight + 10;

  // Totals
  doc.setFont('helvetica', 'bold');
  doc.text('Subtotal:  __________________', 140, yPos);
  yPos += 7;
  doc.text('Discount:  __________________', 140, yPos);
  yPos += 7;
  doc.text('Tax ( ___%): ________________', 140, yPos);
  yPos += 7;
  doc.setFontSize(12);
  doc.setTextColor(...COLORS.primaryBlue);
  doc.text('Total:  ____________________', 140, yPos);

  // Payment Instructions
  yPos += 10;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.primaryBlue);
  doc.text('PAYMENT METHOD', 20, yPos);
  yPos += 6;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.textDark);
  doc.text('Paybill No: 247247', 20, yPos);
  yPos += 5;
  doc.text('Account No: 651259', 20, yPos);
  yPos += 5;
  doc.text('Account Name: NAGOLIE ENTERPRISES', 20, yPos);

  // Delivery confirmation section
  yPos += 15;
  if (yPos > 260) {
    doc.addPage();
    addWatermarkToCurrentPage(doc, 'deliveryNote');
    yPos = 20;
  }
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.primaryBlue);
  doc.text('DELIVERY CONFIRMATION', 105, yPos, { align: 'center' });
  yPos += 8;
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.textDark);
  doc.setFont('helvetica', 'bold');
  doc.text('Client:', 30, yPos);
  doc.setFont('helvetica', 'normal');
  doc.text('____________________', 50, yPos);
  doc.text('Signature: ____________________', 130, yPos);
  yPos += 12;
  doc.setFont('helvetica', 'bold');
  doc.text('Director:', 30, yPos);
  doc.setFont('helvetica', 'normal');
  doc.text('SHADRACK KESUMET', 50, yPos);
  doc.text('Signature: ____________________', 130, yPos);
  yPos += 10;
  doc.text('Date:         ____________________', 30, yPos);
  doc.text('Date:         ____________________', 130, yPos);

  addFooter(doc, yPos + 15);
  addPageNumbers(doc, 'page %d');

  const fileName = `Manual_DeliveryNote_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
};

export { COMPANY_INFO, COLORS };