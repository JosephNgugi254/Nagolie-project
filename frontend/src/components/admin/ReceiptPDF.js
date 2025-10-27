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
  white: [255, 255, 255]
};

// Helper to fetch logo as base64
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

// Generate Transaction Receipt PDF
export const generateTransactionReceipt = async (transaction) => {
  try {
    const doc = new jsPDF();
    const logoBase64 = await getLogoBase64(COMPANY_INFO.logoUrl);
    
    let yPos = 20;
    
    // Header: Logo
    if (logoBase64) {
      doc.addImage(logoBase64, 'PNG', 20, yPos, 30, 15);
      yPos += 20;
    }
    
    // Company Name (bold, primary blue)
    doc.setTextColor(...COLORS.primaryBlue);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(COMPANY_INFO.name, 20, yPos);
    yPos += 8;
    
    // Tagline (secondary blue)
    doc.setTextColor(...COLORS.secondaryBlue);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(COMPANY_INFO.tagline, 20, yPos);
    yPos += 6;
    
    // Address (text dark)
    doc.setTextColor(...COLORS.textDark);
    doc.setFontSize(9);
    doc.text(COMPANY_INFO.address, 20, yPos);
    yPos += 5;
    
    // Contact Info (text light)
    doc.setTextColor(...COLORS.textLight);
    doc.text(`${COMPANY_INFO.phone1} | ${COMPANY_INFO.phone2}`, 20, yPos);
    yPos += 5;
    doc.text(COMPANY_INFO.email, 20, yPos);
    yPos += 5;
    doc.text(COMPANY_INFO.hours, 20, yPos);
    yPos += 5;
    doc.text(COMPANY_INFO.poBox, 20, yPos);
    yPos += 15;
    
    // Title: Transaction Receipt
    doc.setTextColor(...COLORS.primaryBlue);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Transaction Receipt', 20, yPos);
    yPos += 10;
    
    // Divider Line
    doc.setLineWidth(0.5);
    doc.setDrawColor(...COLORS.primaryBlue);
    doc.line(20, yPos, 190, yPos);
    yPos += 10;
    
    // Transaction Details (text dark, alternating bold/normal)
    doc.setTextColor(...COLORS.textDark);
    doc.setFontSize(11);
    
    const details = [
      { label: 'Transaction ID:', value: String(transaction.id || 'N/A') },
      { label: 'Date:', value: transaction.date ? new Date(transaction.date).toLocaleDateString() : 'N/A' },
      { label: 'Client:', value: transaction.clientName || 'N/A' },
      { label: 'Type:', value: (transaction.type || '').toUpperCase() },
      { label: 'Amount:', value: `KES ${Number(transaction.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
      { label: 'Method:', value: (transaction.method || '').toUpperCase() },
      { label: 'Status:', value: (transaction.status || '').toUpperCase() }
    ];

    // Render main details
    details.forEach(({ label, value }) => {
      doc.setFont('helvetica', 'bold');
      doc.text(label, 20, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(String(value), 60, yPos);
      yPos += 7;
    });

    // Add M-Pesa reference if method is MPESA (after main details for better flow)
    if (transaction.method?.toLowerCase() === 'mpesa' && transaction.mpesa_receipt) {
      doc.setFont('helvetica', 'bold');
      doc.text('M-Pesa Receipt:', 20, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(transaction.mpesa_receipt, 60, yPos);
      yPos += 7;
    }
    
    yPos += 10;
    
    // Generated On
    doc.setTextColor(...COLORS.textLight);
    doc.setFontSize(9);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 20, yPos);
    
    // Footer
    yPos = 270;
    doc.setTextColor(...COLORS.textDark);
    doc.setFontSize(8);
    doc.text('Thank you for choosing Nagolie Enterprises!', 20, yPos);
    
    // Save PDF
    doc.save(`Transaction_${transaction.id || 'Receipt'}.pdf`);
  } catch (error) {
    console.error('Error generating transaction receipt:', error);
    throw error; // Re-throw for caller to handle (e.g., show toast in AdminPanel)
  }
};

// Generate Client Statement PDF
export const generateClientStatement = async (client, allTransactions) => {
  try {
    // Filter transactions for this client using loan_id
    const clientTransactions = allTransactions.filter(t => 
      t.loan_id === client.loan_id || 
      (client.loan_id && t.loan_id === client.loan_id.toString())
    );
    
    const doc = new jsPDF();
    const logoBase64 = await getLogoBase64(COMPANY_INFO.logoUrl);
    
    let yPos = 20;
    
    // Header: Same as transaction (logo, company info)
    if (logoBase64) {
      doc.addImage(logoBase64, 'PNG', 20, yPos, 30, 15);
      yPos += 20;
    }
    
    doc.setTextColor(...COLORS.primaryBlue);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(COMPANY_INFO.name, 20, yPos);
    yPos += 8;
    
    doc.setTextColor(...COLORS.secondaryBlue);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(COMPANY_INFO.tagline, 20, yPos);
    yPos += 6;
    
    doc.setTextColor(...COLORS.textDark);
    doc.setFontSize(9);
    doc.text(COMPANY_INFO.address, 20, yPos);
    yPos += 5;
    
    doc.setTextColor(...COLORS.textLight);
    doc.text(`${COMPANY_INFO.phone1} | ${COMPANY_INFO.phone2}`, 20, yPos);
    yPos += 5;
    doc.text(COMPANY_INFO.email, 20, yPos);
    yPos += 5;
    doc.text(COMPANY_INFO.hours, 20, yPos);
    yPos += 5;
    doc.text(COMPANY_INFO.poBox, 20, yPos);
    yPos += 15;
    
    // Title: Payment Receipt / Statement
    doc.setTextColor(...COLORS.primaryBlue);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('CLIENT PAYMENT STATEMENT', 20, yPos);
    yPos += 10;
    
    // Divider
    doc.setLineWidth(0.5);
    doc.setDrawColor(...COLORS.primaryBlue);
    doc.line(20, yPos, 190, yPos);
    yPos += 10;
    
    // Client Details
    doc.setTextColor(...COLORS.textDark);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Client:', 20, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(client.name || 'N/A', 50, yPos);
    yPos += 7;
    
    doc.setFont('helvetica', 'bold');
    doc.text('Phone:', 20, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(client.phone || 'N/A', 50, yPos);
    yPos += 7;
    
    doc.setFont('helvetica', 'bold');
    doc.text('ID Number:', 20, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(String(client.idNumber || 'N/A'), 50, yPos);
    yPos += 15;
    
    // Loan Details Section
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Loan Summary:', 20, yPos);
    yPos += 8;
    
    const INTEREST_RATE = 30;
    const expectedAmount = (client.borrowedAmount || 0) * (1 + INTEREST_RATE / 100);
    
    const loanDetails = [
      { label: 'Amount Borrowed:', value: `KES ${Number(client.borrowedAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
      { label: 'Interest Rate:', value: `${INTEREST_RATE}%` },
      { label: 'Expected Amount:', value: `KES ${expectedAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
      { label: 'Amount Paid:', value: `KES ${Number(client.amountPaid || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
      { label: 'Balance:', value: `KES ${Number(client.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
      { label: 'Borrowed Date:', value: client.borrowedDate ? new Date(client.borrowedDate).toLocaleDateString() : 'N/A' },
      { label: 'Expected Return Date:', value: client.expectedReturnDate ? new Date(client.expectedReturnDate).toLocaleDateString() : 'N/A' }
    ];
    
    loanDetails.forEach(({ label, value }) => {
      doc.setFont('helvetica', 'bold');
      doc.text(label, 20, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(String(value), 70, yPos);
      yPos += 7;
    });
    
    yPos += 10;
    
    // Transaction History Section - FIXED: Show individual transactions
    if (clientTransactions.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('Transaction History:', 20, yPos);
      yPos += 8;
      
      // Sort by date descending (most recent first)
      const sortedTransactions = [...clientTransactions].sort((a, b) => 
        new Date(b.date || b.createdAt || b.created_at) - new Date(a.date || a.createdAt || a.created_at)
      );
      
      // Table headers
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('Date', 20, yPos);
      doc.text('Type', 50, yPos);
      doc.text('Method', 80, yPos);
      doc.text('Amount', 110, yPos);
      doc.text('Reference', 140, yPos);
      yPos += 5;
      
      // Divider line
      doc.setLineWidth(0.2);
      doc.setDrawColor(...COLORS.textLight);
      doc.line(20, yPos, 190, yPos);
      yPos += 7;
      
      // Transaction rows
      sortedTransactions.forEach((transaction) => {
        if (yPos > 250) {
          doc.addPage();
          yPos = 20;
        }
        
        const date = new Date(transaction.date || transaction.createdAt || transaction.created_at).toLocaleDateString();
        const type = (transaction.type || '').toUpperCase();
        const method = (transaction.method || '').toUpperCase();
        const amount = `KES ${Number(transaction.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        
        // Reference number (M-Pesa receipt for M-Pesa, Transaction ID for others)
        let reference = `TXN-${transaction.id}`;
        if (method === 'MPESA' && transaction.mpesa_receipt) {
          reference = transaction.mpesa_receipt;
        } else if (method === 'CASH') {
          reference = 'CASH PAYMENT';
        }
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text(date, 20, yPos);
        doc.text(type, 50, yPos);
        doc.text(method, 80, yPos);
        doc.text(amount, 110, yPos);
        doc.text(reference, 140, yPos);
        
        yPos += 6;
      });
    } else {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(10);
      doc.text('No transactions recorded yet.', 20, yPos);
      yPos += 7;
    }
    
    yPos += 10;
    
    // Generated On
    doc.setTextColor(...COLORS.textLight);
    doc.setFontSize(9);
    doc.text(`Generated on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`, 20, yPos);
    
    // Footer
    yPos = 270;
    doc.setTextColor(...COLORS.textDark);
    doc.setFontSize(8);
    doc.text('Thank you for choosing Nagolie Enterprises!', 20, yPos);
    
    // Save PDF
    doc.save(`Statement_${client.idNumber || client.name}_${new Date().toISOString().split('T')[0]}.pdf`);
  } catch (error) {
    console.error('Error generating client statement:', error);
    throw error; // Re-throw for caller to handle
  }
};