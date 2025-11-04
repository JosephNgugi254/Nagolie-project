// 



import jsPDF from 'jspdf';

// Company constants (branded info)
const COMPANY_INFO = {
  name: 'NAGOLIE ENTERPRISES LTD',
  tagline: 'Livestock-Backed Lending Solutions',
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
  border: [229, 231, 235] // #e5e7eb
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
    doc.setTextColor(...COLORS.textDark);
    doc.setFontSize(10);
    
    const details = [
      { label: 'Transaction ID:', value: String(transaction.id || 'N/A') },
      { label: 'Date:', value: transaction.date ? new Date(transaction.date).toLocaleDateString('en-GB') : 'N/A' },
      { label: 'Client Name:', value: transaction.clientName || 'N/A' },
      { label: 'Transaction Type:', value: formatTransactionType(transaction.type) },
      { label: 'Amount:', value: `KES ${Number(transaction.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
      { label: 'Payment Method:', value: formatPaymentMethod(transaction.method) },
      { label: 'Status:', value: formatStatus(transaction.status) }
    ];

    // Render details with proper spacing
    details.forEach(({ label, value }) => {
      doc.setFont('helvetica', 'bold');
      doc.text(label, 25, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(String(value), 70, yPos);
      yPos += 8;
    });

    // Add M-Pesa reference if applicable
    if (transaction.method?.toLowerCase() === 'mpesa' && transaction.mpesa_receipt) {
      yPos += 5;
      doc.setFont('helvetica', 'bold');
      doc.text('M-Pesa Receipt No:', 25, yPos);
      doc.setFont('helvetica', 'normal');
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
        new Date(b.date || b.createdAt || b.created_at) - new Date(a.date || a.createdAt || a.created_a)
      );
      
      // Table headers with background
      doc.setFillColor(...COLORS.primaryBlue);
      doc.setTextColor(...COLORS.white);
      doc.setFont('helvetica', 'bold');
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
        const type = formatTransactionType(transaction.type);
        const method = formatPaymentMethod(transaction.method);
        const amount = `KES ${Number(transaction.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        const reference = getTransactionReference(transaction);
        
        doc.setTextColor(...COLORS.textDark);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text(date, 25, yPos + 4.5);
        doc.text(type, 55, yPos + 4.5);
        doc.text(method, 85, yPos + 4.5);
        doc.text(amount, 115, yPos + 4.5);
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

    // Confirmed By Section with proper alignment
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('CONFIRMED BY:', 20, yPos);
    yPos += 12;

    const leftX = 25;
    const rightX = 110; // Adjusted for better alignment

    // Livestock Valuer Column - George Marite
    const valuerY = yPos;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('George Marite', leftX, valuerY);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Livestock Valuer', leftX, valuerY + 5);
    
    doc.text('Sign: ___________________', leftX, valuerY + 12);

    // Director Column - Shadrack Kesumet
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Shadrack Kesumet', rightX, valuerY);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Director', rightX, valuerY + 5);
    
    doc.text('Sign: ___________________', rightX, valuerY + 12);

    yPos = valuerY + 20;

    // Footer - properly positioned at bottom
    const footerY = 270;
    doc.setTextColor(...COLORS.textLight);
    doc.setFontSize(8);
    doc.text(`Generated on: ${new Date().toLocaleDateString('en-GB')} at ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`, 20, footerY);
    
    doc.setTextColor(...COLORS.textDark);
    doc.setFontSize(9);
    doc.text('Thank you for choosing Nagolie Enterprises!', 105, footerY + 6, { align: 'center' });



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
const formatTransactionType = (type) => {
  if (!type) return 'N/A';
  const typeMap = {
    'topup': 'Top-up',
    'adjustment': 'Adjustment',
    'payment': 'Payment',
    'disbursement': 'Disbursement'
  };
  return typeMap[type.toLowerCase()] || type.charAt(0).toUpperCase() + type.slice(1);
};

const formatPaymentMethod = (method) => {
  if (!method) return 'N/A';
  return method.toUpperCase();
};

const formatStatus = (status) => {
  if (!status) return 'N/A';
  return status.charAt(0).toUpperCase() + status.slice(1);
};

const getTransactionReference = (transaction) => {
  const method = (transaction.method || '').toUpperCase();
  if (method === 'MPESA' && transaction.mpesa_receipt) {
    return transaction.mpesa_receipt;
  } else if (method === 'CASH') {
    return 'CASH PAYMENT';
  } else {
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