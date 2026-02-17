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
const addOptimizedWatermark = (doc, type = 'agreement') => {
  const totalPages = doc.getNumberOfPages();
  const DOC_LABELS = {
    receipt: 'RECEIPT',
    statement: 'STATEMENT',
    agreement: 'AGREEMENT',
    investor: 'INVESTMENT AGREEMENT'
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
        doc.text('NAGOLIE ENTERPRISES LTD', pos.x, pos.y, { align: 'center', angle });
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
      doc.text('NAGOLIE ENTERPRISES LTD', pos.x, pos.y, { align: 'center', angle });
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

// Generate Client Statement PDF
export const generateClientStatement = async (client, allTransactions) => {
  try {
    const clientTransactions = allTransactions.filter(t =>
      t.loan_id === client.loan_id ||
      (client.loan_id && t.loan_id === client.loan_id.toString())
    );
  
    const doc = new jsPDF();
    
    // ADD OPTIMIZED WATERMARK FIRST
    addOptimizedWatermark(doc, 'statement');
    
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
          // Add watermark to new page FIRST, before any content
          addWatermarkToCurrentPage(doc, 'statement');
          // Reset font state after watermark
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
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

// Generate Professional Loan Agreement PDF
export const generateLoanAgreementPDF = async (application) => {
  try {
    const doc = new jsPDF();
    
    // ADD OPTIMIZED WATERMARK FIRST (before any content)
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
    doc.setTextColor(...COLORS.textDark);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`Agreement Date: ${formattedDate}`, 20, yPos);
    yPos += 12; // Reduced from 15
    
    // Simplified Agreement Body - Adjusted spacing
    doc.setFontSize(11.5); // Reduced from 12
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
    yPos += 5; // Reduced from 6
    
    const secondLineParts = [
      { text: "acknowledge/agree and therefore receive Ksh: ", style: 'normal' },
      { text: `${application.loanAmount ? application.loanAmount.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '__________'}`, style: 'bold' }
    ];
    writeStyledLine(doc, secondLineParts, 20, yPos, 11.5);
    yPos += 5; // Reduced from 6
    
    const thirdLineParts = [
      { text: "for payment of ", style: 'normal' },
      { text: `${application.livestockType || '__________'}`, style: 'bold' },
      { text: " (No. of livestock ", style: 'normal' },
      { text: `${application.livestockCount || '____'}`, style: 'bold' },
      { text: ") by Nagolie enterprises.", style: 'normal' }
    ];
    writeStyledLine(doc, thirdLineParts, 20, yPos, 11.5);
    yPos += 10; // Reduced from 12
    
    // Add Terms and Conditions heading
    doc.setTextColor(...COLORS.primaryBlue);
    doc.setFontSize(13); // Reduced from 14
    doc.setFont('helvetica', 'bold');
    doc.text('TERMS AND CONDITIONS', 105, yPos, { align: 'center' });
    yPos += 8; // Reduced from 8
    
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
      // Group 2: Ownership Transfer and Custody (UPDATED)
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
        "",
        "2.1. Absolute Right of Claim Upon Default:",
        "In the event of default, the Company reserves the absolute right to claim, take",
        "possession of, and remove the collateral livestock without further notice.",
        "This right extends to claiming the livestock:",
        "- In the presence OR absence of the Recipient",
        "- In the presence OR absence of the Next of Kin or any family members",
        "- Without requirement for additional consent or permission from any party",
        "",
        "2.2. Immediate Action for Recovery:",
        "The Company shall not be delayed or hindered in its recovery efforts by the",
        "unavailability, resistance, or objections of the Recipient, Next of Kin, or any",
        "related parties. The Company's representatives, including livestock valuers and",
        "security personnel, are authorized to take immediate action to secure the",
        "Company's property and recover losses without legal impediment.",
        ""
      ],
      // ========== VALUER COMMENT SECTION ==========
      [
        { text: "2.3. Valuer's Comment:", bold: true },
        "_____________________________________________________________________________",
        "_____________________________________________________________________________",
        "_____________________________________________________________________________",
        "",
        "Date: ________/________/________   Valuer's Signature: _______________",
        ""
      ],
      // ========== END VALUER COMMENT SECTION ==========
      // Group 3: Repayment Terms
      [
        { text: "3. Repayment Terms and Interest", bold: true },
        "The loan is typically repayable within seven (7) days from the date of disbursement",
        "with an interest of 30%(negotiable) of the disbursed funds.",
        "The interest for this loan is Ksh________",
        "",
        "Recognizing the circumstances of local communities, the CEO of Nagolie",
        "Enterprises Ltd may, at their discretion, grant an extension of the repayment",
        "period after consultation with the Recipient. Any extension must be agreed",
        "upon in writing by both parties, specifying the new repayment date.",
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
        "- Charge compounded interest on the outstanding amount after every seven (7) days until full repayment",
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
    
    // IMPORTANT: Set font size and style explicitly before terms
    doc.setFontSize(10); // Reduced from 10.5
    doc.setFont('helvetica', 'normal');
    
    termGroups.forEach((group, groupIndex) => {
      // Calculate group height - reduced line spacing
      const groupHeight = group.length * 4.2; // Reduced from 4.5
      
      // Check if we need a new page for this group
      if (yPos + groupHeight > 250 && groupIndex > 0) {
        doc.addPage();
        // Add watermark to new page FIRST, before any content
        addWatermarkToCurrentPage(doc, 'agreement');
        // Reset font state after watermark
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        yPos = 20;
      }
      
      // Render the group
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
        yPos += 4.2; // Reduced from 4.5
      });
    });
    
    yPos += 8;
    
    // Add a new page if needed for signatures
    if (yPos > 180) {
      doc.addPage();
      // Add watermark to new page FIRST, before any content
      addWatermarkToCurrentPage(doc, 'agreement');
      // Reset font state after watermark
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(12);
      yPos = 20;
    }
    
    // Signature Section with reduced spacing
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('SIGNATURES', 105, yPos, { align: 'center' });
    yPos += 10; // Reduced from 12
    
    // ========== UPDATED SIGNATURE SECTION ==========
    
    // Signature Row Section Title
    doc.setFontSize(11);
    doc.text('PARTIES TO THIS AGREEMENT:', 20, yPos);
    yPos += 10; // Reduced from 12
    
    // CLIENT SECTION
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('CLIENT', 20, yPos);
    
    doc.setFontSize(10);
    doc.text('Name:', 25, yPos + 7);
    doc.setFont('helvetica', 'normal');
    doc.text(`${application.name || '___________________'}`, 55, yPos + 7);
    
    doc.setFont('helvetica', 'bold');
    doc.text('ID No:', 25, yPos + 14);
    doc.setFont('helvetica', 'normal');
    doc.text(`${application.idNumber || '___________________'}`, 55, yPos + 14);
    
    doc.setFont('helvetica', 'bold');
    doc.text('Signature:', 25, yPos + 21);
    doc.setFont('helvetica', 'normal');
    doc.text('___________________', 65, yPos + 21);
    
    yPos += 35; // Adjusted spacing
    
    // Confirmed By Section - ALL THREE IN ONE ROW
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('CONFIRMED BY:', 20, yPos);
    yPos += 10;
    
    // Calculate positions for three columns in one row
    const pageWidth = 190; // Total width from left margin 20 to right margin 190
    const columnWidth = pageWidth / 3;
    const leftX = 20;
    const middleX = 20 + columnWidth;
    const rightX = 20 + (columnWidth * 2);
    const signatoryY = yPos;
    
    // Director - Shadrack Kesumet (First Column)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Shadrack Kesumet', leftX, signatoryY);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Director', leftX, signatoryY + 5);
    doc.text('Sign: ___________________', leftX, signatoryY + 12);
    
    // Livestock Valuer - George Marite (Second Column)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('George Marite', middleX, signatoryY);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Livestock Valuer', middleX, signatoryY + 5);
    doc.text('Sign: ___________________', middleX, signatoryY + 12);
    
    // Accountant - Gideon Matunta (Third Column)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Gideon Matunta', rightX, signatoryY);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Accountant', rightX, signatoryY + 5);
    doc.text('Sign: ___________________', rightX, signatoryY + 12);
    
    yPos = signatoryY + 25;
    
    // Company Stamp Box - Creative and faint
    const stampBoxY = Math.min(yPos, 210); // Adjusted position
    const stampBoxWidth = 60;
    const stampBoxHeight = 35;
    const stampBoxX = (210 - stampBoxWidth) / 2;
    
    // Outer border - very subtle
    doc.setDrawColor(230, 235, 245);
    doc.setLineWidth(0.3);
    doc.roundedRect(stampBoxX, stampBoxY, stampBoxWidth, stampBoxHeight, 2, 2);
    
    // Calculate the exact center of the stamp box
    const stampBoxCenterX = stampBoxX + (stampBoxWidth / 2);
    const stampBoxCenterY = stampBoxY + (stampBoxHeight / 2);
    
    // Stamp placeholder text - perfectly centered
    doc.setTextColor(230, 235, 240);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.text('OFFICIAL COMPANY STAMP', stampBoxCenterX, stampBoxCenterY, { align: 'center' });
    
    // Footer - properly positioned at bottom
    const footerY = 280; // Moved to bottom
    doc.setTextColor(...COLORS.textLight);
    doc.setFontSize(8);
    doc.text(`Generated on: ${new Date().toLocaleDateString('en-GB')}`, 20, footerY);
    
    doc.setTextColor(...COLORS.textDark);
    doc.setFontSize(9);
    doc.text('Thank you for choosing Nagolie Enterprises!', 105, footerY + 5, { align: 'center' });
    
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
    doc.text('1. NAGOLIE ENTERPRISES LTD (hereinafter referred to as "the Company"):', 20, yPos);
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
        "This Investment Agreement (\"Agreement\") is entered into between Nagolie Enterprises Ltd",
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
    doc.text('FOR AND ON BEHALF OF NAGOLIE ENTERPRISES LTD:', 20, yPos);
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

    // Save PDF
    const fileName = `Investment_Agreement_${(investor.name || '').replace(/\s+/g, '_') || 'Investor'}_${formattedDate.replace(/\//g, '-')}.pdf`;
    doc.save(fileName);

  } catch (error) {
    console.error('Error generating investor agreement:', error);
    throw error;
  }
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

// export const generateNextOfKinConsentPDF = async (loanData) => {
//   try {
//     const doc = new jsPDF();
    
//     // ADD OPTIMIZED WATERMARK FIRST
//     addOptimizedWatermark(doc, 'agreement');
    
//     let yPos = await addHeader(doc, 10);

//     const currentDate = new Date();
//     const formattedDate = currentDate.toLocaleDateString('en-GB', {
//       day: '2-digit', month: '2-digit', year: 'numeric'
//     });
    
//     // Main Title
//     doc.setTextColor(...COLORS.primaryBlue);
//     doc.setFontSize(16);
//     doc.setFont('helvetica', 'bold');
//     doc.text('NEXT OF KIN CONSENT FORM', 105, yPos, { align: 'center' });
//     yPos += 10;
    
//     yPos = addDivider(doc, yPos);
    
//     // Loan Reference Information Header
//     doc.setTextColor(...COLORS.primaryBlue);
//     doc.setFontSize(12);
//     doc.setFont('helvetica', 'bold');
//     doc.text('LOAN REFERENCE INFORMATION', 105, yPos, { align: 'center' });
//     yPos += 12;
    
//     // Loan Reference Information in two rows
//     doc.setFontSize(11);
//     doc.setTextColor(...COLORS.textDark);
    
//     // First row: Borrower's Name and ID Number
//     doc.setFont('helvetica', 'bold');
//     doc.text("Borrower's Name:", 20, yPos);
//     doc.setFont('helvetica', 'normal');
//     doc.text("__________________________", 55, yPos);
    
//     doc.setFont('helvetica', 'bold');
//     doc.text("ID Number:", 120, yPos);
//     doc.setFont('helvetica', 'normal');
//     doc.text("_________________", 150, yPos);
    
//     yPos += 10;
    
//     // Second row: Loan Amount and Loan Date
//     doc.setFont('helvetica', 'bold');
//     doc.text("Loan Amount:", 20, yPos);
//     doc.setFont('helvetica', 'normal');
//     doc.text("___________________", 55, yPos);
    
//     doc.setFont('helvetica', 'bold');
//     doc.text("Loan Date:", 120, yPos);
//     doc.setFont('helvetica', 'normal');
//     doc.text("_________________", 150, yPos);
    
//     yPos += 10;
    
//     // Consent Statement Header
//     doc.setTextColor(...COLORS.primaryBlue);
//     doc.setFontSize(12);
//     doc.setFont('helvetica', 'bold');
//     doc.text('CONSENT AND ACKNOWLEDGEMENT STATEMENT', 105, yPos, { align: 'center' });
//     yPos += 12;
    
//     // Consent Statement as a paragraph
//     doc.setFontSize(11);
//     doc.setFont('helvetica', 'normal');
//     doc.setTextColor(...COLORS.textDark);
    
//     const consentParagraph = "I, the undersigned Next of Kin to the above-named Borrower, hereby acknowledge and consent that:\n\n" +
//       "1. I am fully aware that the Borrower is taking a livestock financing loan from Nagolie Enterprises Ltd.\n" +
//       "2. I have read, understood, and consent to all the terms and conditions of the loan agreement between the Borrower and Nagolie Enterprises Ltd.\n" +
//       "3. I acknowledge that the livestock specified in the loan agreement will serve as collateral for this loan.\n" +
//       "4. I understand the implications of default as outlined in the loan agreement.\n" +
//       "5. I agree to act as a point of contact in matters relating to this loan.\n" +
//       "6. In the event of default, I understand that Nagolie Enterprises Ltd has the absolute right to claim, take possession of, and remove the collateral livestock without further notice, whether I am present or not.\n" +
//       "7. I will cooperate with Nagolie Enterprises Ltd in their recovery efforts should the need arise.";
    
//     // Split the paragraph into lines that fit the page width
//     const consentLines = doc.splitTextToSize(consentParagraph, 170);
//     consentLines.forEach(line => {
//       // Check if we need a new page
//       if (yPos > 250) {
//         doc.addPage();
//         addWatermarkToCurrentPage(doc, 'agreement');
//         doc.setFont('helvetica', 'normal');
//         doc.setFontSize(11);
//         yPos = 20;
//       }
//       doc.text(line, 20, yPos);
//       yPos += 6;
//     });
    
//     yPos += 8;
    
//     // Next of Kin Details Header
//     doc.setTextColor(...COLORS.primaryBlue);
//     doc.setFontSize(12);
//     doc.setFont('helvetica', 'bold');
//     doc.text('NEXT OF KIN DETAILS', 105, yPos, { align: 'center' });
//     yPos += 10;
    
//     // Next of Kin Information in two rows
//     doc.setFontSize(11);
//     doc.setTextColor(...COLORS.textDark);
    
//     // First row: Full Name and ID Number
//     doc.setFont('helvetica', 'bold');
//     doc.text("Full Name:", 20, yPos);
//     doc.setFont('helvetica', 'normal');
//     doc.text("__________________________", 55, yPos);
    
//     doc.setFont('helvetica', 'bold');
//     doc.text("ID Number:", 120, yPos);
//     doc.setFont('helvetica', 'normal');
//     doc.text("_________________", 150, yPos);
    
//     yPos += 10;
    
//     // Second row: Relationship and Phone Number
//     doc.setFont('helvetica', 'bold');
//     doc.text("Relationship:", 20, yPos);
//     doc.setFont('helvetica', 'normal');
//     doc.text("__________________________", 55, yPos);
    
//     doc.setFont('helvetica', 'bold');
//     doc.text("Phone Number:", 120, yPos);
//     doc.setFont('helvetica', 'normal');
//     doc.text("_________________", 150, yPos);
    
//     yPos += 10;
        
//     // Third row: signature and date
//     doc.setFont('helvetica', 'bold');
//     doc.text("Signature:", 20, yPos);
//     doc.setFont('helvetica', 'normal');
//     doc.text("__________________________", 55, yPos);
    
//     doc.setFont('helvetica', 'bold');
//     doc.text("Date:", 120, yPos);
//     doc.setFont('helvetica', 'normal');
//     doc.text("_________________", 150, yPos);
    
//     yPos += 9;
    
//     // Company Stamp Box
//     const stampBoxY = Math.max(yPos, 200); // Ensure stamp box is positioned properly
//     const stampBoxWidth = 60;
//     const stampBoxHeight = 35;
//     const stampBoxX = (210 - stampBoxWidth) / 2;
    
//     // Outer border
//     doc.setDrawColor(230, 235, 245);
//     doc.setLineWidth(0.3);
//     doc.roundedRect(stampBoxX, stampBoxY, stampBoxWidth, stampBoxHeight, 2, 2);
    
//     // Stamp placeholder text
//     const stampBoxCenterX = stampBoxX + (stampBoxWidth / 2);
//     const stampBoxCenterY = stampBoxY + (stampBoxHeight / 2);
    
//     doc.setTextColor(230, 235, 240);
//     doc.setFontSize(9);
//     doc.setFont('helvetica', 'italic');
//     doc.text('OFFICIAL COMPANY STAMP', stampBoxCenterX, stampBoxCenterY - 3, { align: 'center' });
//     doc.text('(To be affixed here)', stampBoxCenterX, stampBoxCenterY + 3, { align: 'center' });
    
    
//     // Footer
//     doc.setTextColor(...COLORS.textLight);
//     doc.setFontSize(8);
//     doc.text(`Generated on: ${new Date().toLocaleDateString('en-GB')}`, 20, 280);
    
//     doc.setTextColor(...COLORS.textDark);
//     doc.setFontSize(9);
//     doc.text(COMPANY_INFO.tagline, 105, 285, { align: 'center' });
    
//     // ========== PAGE 2: TERMS AND CONDITIONS ONLY ==========
//     doc.addPage();
    
//     // Add watermark to the new page
//     addWatermarkToCurrentPage(doc, 'agreement');
    
//     // Reset yPos for new page
//     yPos = 20;
    
//     // Terms and Conditions Title
//     doc.setTextColor(...COLORS.primaryBlue);
//     doc.setFontSize(16);
//     doc.setFont('helvetica', 'bold');
//     doc.text('LOAN AGREEMENT TERMS AND CONDITIONS', 105, yPos, { align: 'center' });
//     yPos += 8;
    
//     yPos = addDivider(doc, yPos);
    
//     // Simple note
//     doc.setFontSize(10);
//     doc.setFont('helvetica', 'italic');
//     doc.setTextColor(...COLORS.textDark);
//     doc.text("Reference copy for Next of Kin review", 105, yPos, { align: 'center' });
//     yPos += 15;
    
//     // Terms and Conditions heading
//     doc.setTextColor(...COLORS.primaryBlue);
//     doc.setFontSize(13);
//     doc.setFont('helvetica', 'bold');
//     doc.text('TERMS AND CONDITIONS', 105, yPos, { align: 'center' });
//     yPos += 8;
    
//     // Terms and Conditions groups (simplified, without valuer comment)
//     const termGroups = [
//       // Group 1: Agreement Overview
//       [
//         { text: "1. Agreement Overview", bold: true },
//         "This Livestock Financing Agreement (\"Agreement\") is entered into between the",
//         "applicant (\"Recipient\") and Nagolie Enterprises Ltd (\"Company\"). The Recipient",
//         "acknowledges receipt of a loan from Nagolie Enterprises Ltd, secured by the",
//         "specified livestock, which shall become the property of Nagolie Enterprises Ltd",
//         "until the loan is fully repaid.",
//         ""
//       ],
//       // Group 2: Ownership Transfer and Custody
//       [
//         { text: "2. Ownership Transfer and Custody", bold: true },
//         "Upon disbursement of the loan, legal ownership of the specified livestock transfers",
//         "to Nagolie Enterprises Ltd, with the Recipient maintaining physical custody. The",
//         "Recipient agrees to:",
//         "- Provide proper care and maintenance for the livestock",
//         "- Ensure the livestock are kept in good health",
//         "- Not sell, transfer, or dispose of the livestock without prior written consent",
//         " from the Company",
//         "- Allow Company representatives access to inspect the livestock at reasonable times",
//         "",
//         "2.1. Absolute Right of Claim Upon Default:",
//         "In the event of default, the Company reserves the absolute right to claim, take",
//         "possession of, and remove the collateral livestock without further notice.",
//         "This right extends to claiming the livestock:",
//         "- In the presence OR absence of the Recipient",
//         "- In the presence OR absence of the Next of Kin or any family members",
//         "- Without requirement for additional consent or permission from any party",
//         "",
//         "2.2. Immediate Action for Recovery:",
//         "The Company shall not be delayed or hindered in its recovery efforts by the",
//         "unavailability, resistance, or objections of the Recipient, Next of Kin, or any",
//         "related parties. The Company's representatives, including livestock valuers and",
//         "security personnel, are authorized to take immediate action to secure the",
//         "Company's property and recover losses without legal impediment.",
//         ""
//       ],
//       // Group 3: Repayment Terms
//       [
//         { text: "3. Repayment Terms and Interest", bold: true },
//         "The loan is typically repayable within seven (7) days from the date of disbursement",
//         "with an interest of 30%(negotiable) of the disbursed funds.",
//         "The interest for this loan is KSh________",
//         "",
//         "Recognizing the circumstances of local communities, the CEO of Nagolie",
//         "Enterprises Ltd may, at their discretion, grant an extension of the repayment",
//         "period after consultation with the Recipient. Any extension must be agreed",
//         "upon in writing by both parties, specifying the new repayment date.",
//         ""
//       ],
//       // Group 4: Loan Settlement and Ownership Return
//       [
//         { text: "4. Loan Settlement and Ownership Return", bold: true },
//         "Upon full repayment of the loan principal plus agreed interest:",
//         "- Legal ownership of the livestock reverts to the Recipient",
//         "- All rights and responsibilities regarding the livestock return to the Recipient",
//         ""
//       ],
//       // Group 5: Livestock Valuation
//       [
//         { text: "5. Livestock Valuation", bold: true },
//         "All livestock shall be valued by an authorized Livestock Valuer appointed by",
//         "Nagolie Enterprises Ltd. The valuation shall be final and binding for determining",
//         "the maximum loan amount.",
//         ""
//       ],
//       // Group 6: Default and Remedies
//       [
//         { text: "6. Default and Remedies", bold: true },
//         "Failure to repay the loan by the due date (including any agreed extension) shall",
//         "constitute default, entitling Nagolie Enterprises Ltd to:",
//         "- Charge compounded interest on the outstanding amount after every seven (7) days until full repayment",
//         "- Take immediate possession of the livestock",
//         "- Sell the livestock to recover the outstanding loan amount",
//         "- Initiate legal proceedings for recovery of any remaining balance",
//         "- Charge interest on overdue amounts at the prevailing market rate",
//         ""
//       ],
//       // Group 7: Governing Law
//       [
//         { text: "7. Governing Law", bold: true },
//         "This agreement shall be governed by and construed in accordance with the laws of",
//         "Kenya. Any disputes arising from this agreement shall be subject to the exclusive",
//         "jurisdiction of the courts of Kajiado County.",
//         ""
//       ],
//       // Group 8: Entire Agreement
//       [
//         { text: "8. Entire Agreement", bold: true },
//         "This document constitutes the entire agreement between the parties and supersedes",
//         "all prior discussions, negotiations, and agreements. No modification of this",
//         "agreement shall be effective unless in writing and signed by both parties."
//       ]
//     ];
    
//     // Set font size and style explicitly before terms
//     doc.setFontSize(10);
//     doc.setFont('helvetica', 'normal');
    
//     termGroups.forEach((group, groupIndex) => {
//       // Calculate group height
//       const groupHeight = group.length * 4.2;
      
//       // Check if we need a new page for this group
//       if (yPos + groupHeight > 250 && groupIndex > 0) {
//         doc.addPage();
//         // Add watermark to new page
//         addWatermarkToCurrentPage(doc, 'agreement');
//         // Reset font state after watermark
//         doc.setFont('helvetica', 'normal');
//         doc.setFontSize(10);
//         yPos = 20;
//       }
      
//       // Render the group
//       group.forEach(line => {
//         if (typeof line === 'object' && line.bold) {
//           doc.setFont('helvetica', 'bold');
//           doc.setTextColor(...COLORS.primaryBlue);
//           doc.text(line.text, 20, yPos);
//           // Reset to normal for next line
//           doc.setFont('helvetica', 'normal');
//           doc.setTextColor(...COLORS.textDark);
//         } else {
//           doc.setFont('helvetica', 'normal');
//           doc.setTextColor(...COLORS.textDark);
//           doc.text(line, 20, yPos);
//         }
//         yPos += 4.2;
//       });
//     });
    
//     // Save PDF
//     const fileName = `Next_of_Kin_Consent_${loanData?.name?.replace(/\s+/g, '_') || 'Client'}_${formattedDate.replace(/\//g, '-')}.pdf`;
//     doc.save(fileName);
    
//   } catch (error) {
//     console.error('Error generating next of kin consent form:', error);
//     throw error;
//   }
// };

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

// const investorTxns = filterInvestorTransactions(transactions, investor.id, investor.name);




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
