import { useState, useEffect } from 'react';
import { generateInvoicePDF } from '../admin/ReceiptPDF';
import { showToast } from '../common/Toast';
import { useAuth } from '../../context/AuthContext';

const InvoiceGenerator = () => {
  const { user } = useAuth();
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [items, setItems] = useState([
    { description: '', quantity: '', unitPrice: '', total: 0 },
  ]);
  const [taxRate, setTaxRate] = useState(0);
  const [discountType, setDiscountType] = useState('percentage');
  const [discountValue, setDiscountValue] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);

  // User-specific draft key
  const getDraftKey = () => {
    const userId = user?.id || user?.username || 'anonymous';
    return `invoiceDraft_${userId}`;
  };

  // Auto-generate invoice number on mount
  useEffect(() => {
    const generateInvoiceNumber = () => {
      const now = new Date();
      const year = now.getFullYear().toString().slice(-2);
      const month = (now.getMonth() + 1).toString().padStart(2, '0');
      let counter = parseInt(localStorage.getItem('invoiceCounter') || '0', 10);
      counter++;
      localStorage.setItem('invoiceCounter', counter.toString());
      return `INV-${counter}-${year}${month}`;
    };
    setInvoiceNumber(generateInvoiceNumber());
  }, []);

  // Load draft from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(getDraftKey());
    if (saved) {
      try {
        const draft = JSON.parse(saved);
        setClientName(draft.clientName || '');
        setClientEmail(draft.clientEmail || '');
        setItems(draft.items || [{ description: '', quantity: '', unitPrice: '', total: 0 }]);
        setTaxRate(draft.taxRate || 0);
        setDiscountType(draft.discountType || 'percentage');
        setDiscountValue(draft.discountValue || 0);
        setHasDraft(true);
      } catch (e) {}
    }
  }, [user]);

  // Save draft on changes (auto-save)
  useEffect(() => {
    const hasData = clientName || clientEmail || items.some(i => i.description || i.quantity || i.unitPrice) || taxRate || discountValue;
    if (hasData) {
      const draft = { clientName, clientEmail, items, taxRate, discountType, discountValue, lastSaved: new Date().toISOString() };
      localStorage.setItem(getDraftKey(), JSON.stringify(draft));
      setHasDraft(true);
    } else {
      setHasDraft(false);
    }
  }, [clientName, clientEmail, items, taxRate, discountType, discountValue, user]);

  const clearDraft = () => {
    setClientName('');
    setClientEmail('');
    setItems([{ description: '', quantity: '', unitPrice: '', total: 0 }]);
    setTaxRate(0);
    setDiscountType('percentage');
    setDiscountValue(0);
    localStorage.removeItem(getDraftKey());
    setHasDraft(false);
    showToast.success('Draft cleared');
  };

  const loadDraft = () => {
    const saved = localStorage.getItem(getDraftKey());
    if (saved) {
      try {
        const draft = JSON.parse(saved);
        setClientName(draft.clientName || '');
        setClientEmail(draft.clientEmail || '');
        setItems(draft.items || [{ description: '', quantity: '', unitPrice: '', total: 0 }]);
        setTaxRate(draft.taxRate || 0);
        setDiscountType(draft.discountType || 'percentage');
        setDiscountValue(draft.discountValue || 0);
        showToast.success('Draft loaded');
      } catch (e) {
        showToast.error('Failed to load draft');
      }
    } else {
      showToast.info('No saved draft found');
    }
  };

  const updateItem = (index, field, value) => {
    const newItems = [...items];
    newItems[index][field] = value;
    if (field === 'quantity' || field === 'unitPrice') {
      const qty = parseFloat(newItems[index].quantity) || 0;
      const price = parseFloat(newItems[index].unitPrice) || 0;
      newItems[index].total = qty * price;
    }
    setItems(newItems);
  };

  const addItem = () => {
    setItems([...items, { description: '', quantity: '', unitPrice: '', total: 0 }]);
  };

  const removeItem = (index) => {
    if (items.length === 1) return;
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
  };

  const calculateSubtotal = () => {
    return items.reduce((sum, item) => sum + (item.total || 0), 0);
  };

  const calculateDiscountAmount = () => {
    const subtotal = calculateSubtotal();
    if (discountType === 'percentage') {
      return subtotal * (discountValue / 100);
    } else {
      return discountValue;
    }
  };

  const calculateTaxableAmount = () => {
    return calculateSubtotal() - calculateDiscountAmount();
  };

  const calculateTax = () => {
    return calculateTaxableAmount() * (taxRate / 100);
  };

  const calculateTotal = () => {
    return calculateTaxableAmount() + calculateTax();
  };

  const handleGeneratePreview = async () => {
    if (!clientName.trim()) {
      showToast.error('Client name is required');
      return;
    }
    if (items.length === 0 || items.every(i => !i.description)) {
      showToast.error('Add at least one line item');
      return;
    }
    setIsGenerating(true);
    try {
      await generateInvoicePDF({
        invoiceNumber,
        clientName: clientName.trim(),
        clientEmail: clientEmail.trim(),
        date: new Date().toLocaleDateString('en-GB'),
        items: items.map(item => ({
          description: item.description,
          quantity: parseFloat(item.quantity) || 0,
          unitPrice: parseFloat(item.unitPrice) || 0,
          total: item.total,
        })),
        subtotal: calculateSubtotal(),
        discountAmount: calculateDiscountAmount(),
        discountType,
        discountValue,
        taxableAmount: calculateTaxableAmount(),
        taxRate,
        taxAmount: calculateTax(),
        total: calculateTotal(),
      }, true); // preview = true      
    } catch (error) {
      console.error(error);
      showToast.error('Failed to generate invoice preview');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async () => {
    if (!clientName.trim()) {
      showToast.error('Client name is required');
      return;
    }
    if (items.length === 0 || items.every(i => !i.description)) {
      showToast.error('Add at least one line item');
      return;
    }
    setIsGenerating(true);
    try {
      await generateInvoicePDF({
        invoiceNumber,
        clientName: clientName.trim(),
        clientEmail: clientEmail.trim(),
        date: new Date().toLocaleDateString('en-GB'),
        items: items.map(item => ({
          description: item.description,
          quantity: parseFloat(item.quantity) || 0,
          unitPrice: parseFloat(item.unitPrice) || 0,
          total: item.total,
        })),
        subtotal: calculateSubtotal(),
        discountAmount: calculateDiscountAmount(),
        discountType,
        discountValue,
        taxableAmount: calculateTaxableAmount(),
        taxRate,
        taxAmount: calculateTax(),
        total: calculateTotal(),
      }, false); // download
      showToast.success('Invoice downloaded');
    } catch (error) {
      console.error(error);
      showToast.error('Failed to download invoice');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="invoice-generator">
      <div className="row mb-4">
        <div className="col-md-6">
          <label className="form-label fw-bold">Client Name *</label>
          <input
            type="text"
            className="form-control"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="Full name or company name"
          />
        </div>
        <div className="col-md-6">
          <label className="form-label fw-bold">Client Email (optional)</label>
          <input
            type="email"
            className="form-control"
            value={clientEmail}
            onChange={(e) => setClientEmail(e.target.value)}
            placeholder="client@example.com"
          />
        </div>
      </div>

      <div className="row mb-4">
        <div className="col-md-6">
          <label className="form-label fw-bold">Invoice Number</label>
          <input
            type="text"
            className="form-control"
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
          />
        </div>
        <div className="col-md-6">
          <label className="form-label fw-bold">Tax Rate (%)</label>
          <input
            type="number"
            className="form-control"
            value={taxRate}
            onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
            min="0"
            step="0.1"
          />
        </div>
      </div>

      <div className="row mb-4">
        <div className="col-md-6">
          <label className="form-label fw-bold">Discount</label>
          <div className="input-group">
            <select
              className="form-select"
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value)}
              style={{ maxWidth: '120px' }}
            >
              <option value="percentage">%</option>
              <option value="fixed">KES</option>
            </select>
            <input
              type="number"
              className="form-control"
              value={discountValue}
              onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
              min="0"
              step={discountType === 'percentage' ? 0.1 : 1}
            />
          </div>
        </div>
      </div>

      <div className="table-responsive mb-4">
        <table className="table table-bordered">
          <thead className="table-light">
            <tr>
              <th style={{ width: '50%' }}>Description</th>
              <th style={{ width: '15%' }}>Quantity</th>
              <th style={{ width: '20%' }}>Unit Price (KES)</th>
              <th style={{ width: '15%' }}>Total (KES)</th>
              <th style={{ width: '5%' }}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={idx}>
                <td>
                  <input
                    type="text"
                    className="form-control"
                    value={item.description}
                    onChange={(e) => updateItem(idx, 'description', e.target.value)}
                    placeholder="Item / service description"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    className="form-control"
                    value={item.quantity}
                    onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                    min="0"
                    step="1"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    className="form-control"
                    value={item.unitPrice}
                    onChange={(e) => updateItem(idx, 'unitPrice', e.target.value)}
                    min="0"
                    step="0.01"
                  />
                </td>
                <td className="text-end fw-bold">
                  {(item.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </td>
                <td className="text-center">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-danger"
                    onClick={() => removeItem(idx)}
                  >
                    <i className="fas fa-trash"></i>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan="3" className="text-end fw-bold">Subtotal:</td>
              <td className="text-end">
                {calculateSubtotal().toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </td>
              <td></td>
            </tr>
            {discountValue > 0 && (
              <tr>
                <td colSpan="3" className="text-end fw-bold">
                  Discount ({discountType === 'percentage' ? `${discountValue}%` : `KES ${discountValue}`}):
                </td>
                <td className="text-end text-danger">
                  -{calculateDiscountAmount().toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </td>
                <td></td>
              </tr>
            )}
            <tr>
              <td colSpan="3" className="text-end fw-bold">Taxable Amount:</td>
              <td className="text-end">
                {calculateTaxableAmount().toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </td>
              <td></td>
            </tr>
            {taxRate > 0 && (
              <tr>
                <td colSpan="3" className="text-end fw-bold">Tax ({taxRate}%):</td>
                <td className="text-end">
                  {calculateTax().toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </td>
                <td></td>
              </tr>
            )}
            <tr className="table-primary">
              <td colSpan="3" className="text-end fw-bold">Total Amount Due:</td>
              <td className="text-end fw-bold">
                {calculateTotal().toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="d-flex flex-wrap gap-2 justify-content-end">
        <button type="button" className="btn btn-secondary" onClick={addItem}>
          <i className="fas fa-plus me-2"></i>Add Item
        </button>
        {hasDraft && (
          <button type="button" className="btn btn-outline-info" onClick={loadDraft}>
            <i className="fas fa-undo me-2"></i>Load Draft
          </button>
        )}
        <button type="button" className="btn btn-outline-danger" onClick={clearDraft}>
          <i className="fas fa-trash me-2"></i>Clear Draft
        </button>
        <button className="btn btn-info" onClick={handleDownload} disabled={isGenerating}>
          <i className="fas fa-download me-2"></i>Download PDF
        </button>
        <button className="btn btn-primary btn-lg" onClick={handleGeneratePreview} disabled={isGenerating}>
          {isGenerating ? (
            <><span className="spinner-border spinner-border-sm me-2"></span>Generating...</>
          ) : (
            <><i className="fas fa-eye me-2"></i>Generate & Preview</>
          )}
        </button>
      </div>
    </div>
  );
};

export default InvoiceGenerator;