import jsPDF from 'jspdf';
// Company constants (branded info)
const COMPANY_INFO = {
  name: 'NAGOLIE ENTERPRISES LTD',
  tagline: 'Giving livestock farmers another chance',
  address: 'Target - Isinya, Kajiado County, Kenya',
  phone1: '+254 721 451 707',
  phone2: '+254 763 003 182',
  email: 'nagolie7@gmail.com',
  hours: 'Everyday: 8:00 AM - 6:00 PM',
  poBox: 'P.O BOX 359-01100',
  logoUrl: '/logo.png' // Your logo path
};
// Colors from your :root (converted to RGB for jsPDF)
const COLORS = {
  primaryBlue: [30, 64, 175], // #1e40af
  secondaryBlue: [59, 130, 246], // #3b82f6
  textDark: [31, 41, 55], // #1f2937
  textLight: [107, 114, 128], // #6b7280
  white: [255, 255, 255],
  border: [229, 231, 235], // #e5e7eb
  green: [17, 140, 79] // #30B54A for M-Pesa
};
// Helper to fetch logo as base64 with proper dimensions
const getLogoBase64 = async (url) => {
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
const addHeader = async (doc, yStart = 15) => {
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
const addDivider = (doc, yPos, color = COLORS.primaryBlue) => {
  doc.setLineWidth(0.5);
  doc.setDrawColor(...color);
  doc.line(20, yPos, 190, yPos);
  return yPos + 10;
};
// Generate Transaction Receipt PDF
export const generateTransactionReceipt = async (transaction) => {
  try {
    const doc = new jsPDF();
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
// Generate Client Statement PDF
export const generateClientStatement = async (client, allTransactions) => {
  try {
    const clientTransactions = allTransactions.filter(t =>
      t.loan_id === client.loan_id ||
      (client.loan_id && t.loan_id === client.loan_id.toString())
    );
  
    const doc = new jsPDF();
    let yPos = await addHeader(doc);
  
    // Title
    doc.setTextColor(...COLORS.primaryBlue);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('CLIENT PAYMENT STATEMENT', 105, yPos, { align: 'center' });
    yPos += 8;
  
    yPos = addDivider(doc, yPos);
  
    // Client Information Section
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
  
    // Loan Summary Section
    doc.setFont('helvetica', 'bold');
    doc.text('LOAN SUMMARY', 20, yPos);
    yPos += 8;
  
    const INTEREST_RATE = 30;
    const expectedAmount = (client.borrowedAmount || 0) * (1 + INTEREST_RATE / 100);
  
    const loanDetails = [
      { label: 'Principal Amount:', value: `KES ${Number(client.borrowedAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
      { label: 'Interest Rate:', value: `${INTEREST_RATE}%` },
      { label: 'Expected Total:', value: `KES ${expectedAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
      { label: 'Amount Paid:', value: `KES ${Number(client.amountPaid || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
      { label: 'Remaining Balance:', value: `KES ${Number(client.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
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
  
    // Transaction History Section
    if (clientTransactions.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.text('TRANSACTION HISTORY', 20, yPos);
      yPos += 10;
    
      const sortedTransactions = [...clientTransactions].sort((a, b) =>
        new Date(b.date || b.createdAt || b.created_at) - new Date(a.date || a.createdAt || a.created_at)
      );
    
      // Table headers with background (bold)
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
      sortedTransactions.forEach((transaction, index) => {
        if (yPos > 250) {
          doc.addPage();
          yPos = 20;
        }
      
        // Alternate row colors
        if (index % 2 === 0) {
          doc.setFillColor(...COLORS.border);
          doc.rect(20, yPos, 170, 7, 'F');
        }
      
        const date = new Date(transaction.date || transaction.createdAt || transaction.created_at).toLocaleDateString('en-GB');
        // Get payment_type from transaction - check multiple possible field names
        const paymentType = transaction.payment_type || transaction.paymentType || '';
        const type = formatTransactionType(transaction.type, paymentType);
        const method = formatPaymentMethod(transaction.method, transaction.type); // Pass transaction.type
        const amount = `KES ${Number(transaction.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        const reference = getTransactionReference(transaction);
      
        const methodLower = (transaction.method || '').toLowerCase();
        const isMpesa = methodLower === 'mpesa';
        const isCash = methodLower === 'cash';
        const isDisbursement = (transaction.type || '').toLowerCase() === 'disbursement';
      
        doc.setTextColor(...COLORS.textDark);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text(date, 25, yPos + 4.5);
        doc.text(type, 55, yPos + 4.5);
       
        // Color for method
        const methodColor = isMpesa ? COLORS.green :
                   isDisbursement ? COLORS.primaryBlue : // Blue for BANK
                   COLORS.textDark;
        doc.setTextColor(...methodColor);
        doc.text(method, 85, yPos + 4.5);
       
        // Reset for amount
        doc.setTextColor(...COLORS.textDark);
        doc.text(amount, 115, yPos + 4.5);
       
        // Color for reference
        const refColor = isMpesa ? COLORS.green : isDisbursement ? COLORS.primaryBlue : COLORS.textDark;
        doc.setTextColor(...refColor);
        doc.text(reference, 145, yPos + 4.5);
      
        yPos += 7;
      });
    } else {
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(...COLORS.textLight);
      doc.text('No transactions recorded yet.', 25, yPos);
      yPos += 10;
    }
  
    // Footer
    addFooter(doc, yPos);
  
    // Save PDF
    doc.save(`Statement_${client.name?.replace(/\s+/g, '_') || 'Client'}_${new Date().toISOString().split('T')[0]}.pdf`);
  } catch (error) {
    console.error('Error generating client statement:', error);
    throw error;
  }
};
// Generate Professional Loan Agreement PDF (Updated Signature Section with Stamp Box)
export const generateLoanAgreementPDF = async (application) => {
  try {
    const doc = new jsPDF();
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
    doc.setTextColor(...COLORS.textDark);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`Agreement Date: ${formattedDate}`, 20, yPos);
    yPos += 15;
    // Simplified Agreement Body - Reduced spacing
    doc.setFontSize(12);
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
    writeStyledLine(doc, firstLineParts, 20, yPos, 12);
    yPos += 6;
    const secondLineParts = [
      { text: "acknowledge/agree and therefore receive Ksh: ", style: 'normal' },
      { text: `${application.loanAmount ? application.loanAmount.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '__________'}`, style: 'bold' }
    ];
    writeStyledLine(doc, secondLineParts, 20, yPos, 12);
    yPos += 6;
    const thirdLineParts = [
      { text: "for payment of ", style: 'normal' },
      { text: `${application.livestockType || '__________'}`, style: 'bold' },
      { text: " (No. of livestock ", style: 'normal' },
      { text: `${application.livestockCount || '____'}`, style: 'bold' },
      { text: ") by Nagolie enterprises.", style: 'normal' }
    ];
    writeStyledLine(doc, thirdLineParts, 20, yPos, 12);
    yPos += 12;
    // Add Terms and Conditions heading
    doc.setTextColor(...COLORS.primaryBlue);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('TERMS AND CONDITIONS', 105, yPos, { align: 'center' });
    yPos += 8;
    // Group terms to ensure they stay together
    const termGroups = [
      // Group 1: Agreement Overview
      [
        { text: "1. Agreement Overview", bold: true },
        "This Livestock Financing Agreement (\"Agreement\") is entered into between the",
        "applicant (\"Recipient\") and Nagolie Enterprises Ltd (\"Company\"). The Recipient",
        "acknowledges receipt of a loan from Nagolie Enterprises Ltd, secured by the",
        "specified livestock, which shall become the property of Nagolie Enterprises Ltd",
        "until the loan is fully repaid.",
        ""
      ],
      // Group 2: Ownership Transfer and Custody
      [
        { text: "2. Ownership Transfer and Custody", bold: true },
        "Upon disbursement of the loan, legal ownership of the specified livestock transfers",
        "to Nagolie Enterprises Ltd, with the Recipient maintaining physical custody. The",
        "Recipient agrees to:",
        "- Provide proper care and maintenance for the livestock",
        "- Ensure the livestock are kept in good health",
        "- Not sell, transfer, or dispose of the livestock without prior written consent",
        " from the Company",
        "- Allow Company representatives access to inspect the livestock at reasonable times",
        ""
      ],
      // Group 3: Repayment Terms
      [
        { text: "3. Repayment Terms", bold: true },
        "The loan is typically repayable within seven (7) days from the date of",
        "disbursement. However, recognizing the circumstances of local communities, the CEO",
        "of Nagolie Enterprises Ltd may, at their discretion, grant an extension of the",
        "repayment period after consultation with the Recipient. Any extension must be",
        "agreed upon in writing by both parties, specifying the new repayment date.",
        ""
      ],
      // Group 4: Loan Settlement and Ownership Return
      [
        { text: "4. Loan Settlement and Ownership Return", bold: true },
        "Upon full repayment of the loan principal plus agreed interest:",
        "- Legal ownership of the livestock reverts to the Recipient",
        "- All rights and responsibilities regarding the livestock return to the Recipient",
        ""
      ],
      // Group 5: Livestock Valuation
      [
        { text: "5. Livestock Valuation", bold: true },
        "All livestock shall be valued by an authorized Livestock Valuer appointed by",
        "Nagolie Enterprises Ltd. The valuation shall be final and binding for determining",
        "the maximum loan amount.",
        ""
      ],
      // Group 6: Default and Remedies
      [
        { text: "6. Default and Remedies", bold: true },
        "Failure to repay the loan by the due date (including any agreed extension) shall",
        "constitute default, entitling Nagolie Enterprises Ltd to:",
        "- Take immediate possession of the livestock",
        "- Sell the livestock to recover the outstanding loan amount",
        "- Initiate legal proceedings for recovery of any remaining balance",
        "- Charge interest on overdue amounts at the prevailing market rate",
        ""
      ],
      // Group 7: Governing Law
      [
        { text: "7. Governing Law", bold: true },
        "This agreement shall be governed by and construed in accordance with the laws of",
        "Kenya. Any disputes arising from this agreement shall be subject to the exclusive",
        "jurisdiction of the courts of Kajiado County.",
        ""
      ],
      // Group 8: Entire Agreement
      [
        { text: "8. Entire Agreement", bold: true },
        "This document constitutes the entire agreement between the parties and supersedes",
        "all prior discussions, negotiations, and agreements. No modification of this",
        "agreement shall be effective unless in writing and signed by both parties."
      ]
    ];
    doc.setFontSize(10.5);
    termGroups.forEach((group, groupIndex) => {
      // Calculate group height
      const groupHeight = group.length * 4.5;
    
      // Check if we need a new page for this group
      if (yPos + groupHeight > 250 && groupIndex > 0) {
        doc.addPage();
        yPos = 20;
      }
    
      // Render the group
      group.forEach(line => {
        if (typeof line === 'object' && line.bold) {
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(...COLORS.primaryBlue);
          doc.text(line.text, 20, yPos);
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
      yPos = 20;
    }
    // Signature Section with reduced spacing
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('SIGNATURES', 105, yPos, { align: 'center' });
    yPos += 12;
    // Client Section - Simplified (removed ID number and date)
    doc.setFontSize(12);
    doc.text('CLIENT:', 20, yPos);
    yPos += 6;
    doc.setFont('helvetica', 'bold');
    doc.text('NAME:', 25, yPos);
    doc.text(`${application.name || '___________________'}`, 60, yPos);
    yPos += 6;
    doc.text('SIGN:', 25, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text('___________________', 60, yPos);
    yPos += 15;
    // Confirmed By Section - Three signatories in one row, evenly spaced
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('CONFIRMED BY:', 20, yPos);
    yPos += 12;
    // Calculate even spacing for three columns
    const pageWidth = 190; // Total width from left margin 20 to right margin 190
    const columnWidth = pageWidth / 3;
    const leftX = 20;
    const middleX = 20 + columnWidth;
    const rightX = 20 + (columnWidth * 2);
    const signatoryY = yPos;
    // Director - Shadrack Kesumet (First Column)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Shadrack Kesumet', leftX, signatoryY);
  
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Director', leftX, signatoryY + 5);
    doc.text('Sign: ___________________', leftX, signatoryY + 12);
    // Livestock Valuer - George Marite (Second Column)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('George Marite', middleX, signatoryY);
  
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Livestock Valuer', middleX, signatoryY + 5);
    doc.text('Sign: ___________________', middleX, signatoryY + 12);
    // Accountant - Gideon Matunta (Third Column)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Gideon Matunta', rightX, signatoryY);
  
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Accountant', rightX, signatoryY + 5);
    doc.text('Sign: ___________________', rightX, signatoryY + 12);
    yPos = signatoryY + 25;
    // Company Stamp Box - Creative and faint
    const stampBoxY = yPos;
    const stampBoxWidth = 60;
    const stampBoxHeight = 35;
    const stampBoxX = (210 - stampBoxWidth) / 2; // Center the box horizontally
    // Outer border - very subtle
    doc.setDrawColor(230, 235, 245); // Lighter blue-gray border
    doc.setLineWidth(0.3);
    doc.roundedRect(stampBoxX, stampBoxY, stampBoxWidth, stampBoxHeight, 2, 2);
    // Calculate the exact center of the stamp box
    const stampBoxCenterX = stampBoxX + (stampBoxWidth / 2);
    const stampBoxCenterY = stampBoxY + (stampBoxHeight / 2);
    // Stamp placeholder text - perfectly centered
    doc.setTextColor(230, 235, 240);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    // Main stamp text - perfectly centered in the box
    doc.text('OFFICIAL COMPANY STAMP', stampBoxCenterX, stampBoxCenterY, { align: 'center' });
      
    // Decorative elements around the stamp area
    doc.setDrawColor(230, 235, 240);
    doc.setLineWidth(0.2);
 
    yPos = stampBoxY + stampBoxHeight + 15;
    // Footer - properly positioned at bottom
    const footerY = 270;
    doc.setTextColor(...COLORS.textLight);
    doc.setFontSize(8);
    doc.text(`Generated on: ${new Date().toLocaleDateString('en-GB')} at ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`, 20, footerY);
  
    doc.setTextColor(...COLORS.textDark);
    doc.setFontSize(9);
    doc.text('Thank you for choosing Nagolie Enterprises!', 105, footerY + 6, { align: 'center' });
    // Save PDF
    const fileName = `Loan_Agreement_${application.name?.replace(/\s+/g, '_') || 'Client'}_${formattedDate.replace(/\//g, '-')}.pdf`;
    doc.save(fileName);
  } catch (error) {
    console.error('Error generating loan agreement:', error);
    throw error;
  }
};
// Helper function to write lines with mixed styles without overlapping
const writeStyledLine = (doc, parts, x, y, fontSize = 10) => {
  let currentX = x;
  parts.forEach(part => {
    doc.setFont('helvetica', part.style);
    doc.setFontSize(fontSize);
    const text = part.text;
    doc.text(text, currentX, y);
    currentX += doc.getTextWidth(text);
  });
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
const addFooter = (doc, yPos) => {
  if (yPos > 270) return;
  const footerY = Math.min(yPos + 20, 270);
  doc.setTextColor(...COLORS.textLight);
  doc.setFontSize(8);
  doc.text(`Generated on: ${new Date().toLocaleDateString('en-GB')} at ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`, 20, footerY);
  doc.setTextColor(...COLORS.textDark);
  doc.setFontSize(9);
  doc.text('Thank you for choosing Nagolie Enterprises!', 105, footerY + 10, { align: 'center' });
};
// Simple number to words conversion for Kenyan Shillings
const numberToWords = (num) => {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  if (num === 0) return 'Zero';
  if (num < 10) return ones[num];
  if (num < 20) return teens[num - 10];
  if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 !== 0 ? ' ' + ones[num % 10] : '');
  if (num < 1000) return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 !== 0 ? ' and ' + numberToWords(num % 100) : '');
  if (num < 100000) return numberToWords(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 !== 0 ? ' ' + numberToWords(num % 1000) : '');
  if (num < 10000000) return numberToWords(Math.floor(num / 100000)) + ' Lakh' + (num % 100000 !== 0 ? ' ' + numberToWords(num % 100000) : '');
  return numberToWords(Math.floor(num / 10000000)) + ' Crore' + (num % 10000000 !== 0 ? ' ' + numberToWords(num % 10000000) : '');
};