// frontend/src/components/utilities/DocumentGenerator.jsx
import { useState, useEffect, useRef } from 'react';
import { showToast } from '../common/Toast';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import {
  addHeader,
  addDivider,
  addFooter,
  COLORS,
} from '../admin/ReceiptPDF';

const DocumentGenerator = ({ userRole }) => {
  const [title, setTitle] = useState('');
  const [contentHtml, setContentHtml] = useState('');
  const [hasDraft, setHasDraft] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingType, setGeneratingType] = useState(null);
  const [isBoldActive, setIsBoldActive] = useState(false);
  const [isItalicActive, setIsItalicActive] = useState(false);
  const [isUnderlineActive, setIsUnderlineActive] = useState(false);
  const editorRef = useRef(null);
  const isInternalUpdate = useRef(false);

  const getDraftKey = () => {
    const userId = userRole?.id || userRole?.username || 'anonymous';
    return `docDraft_${userId}`;
  };

  useEffect(() => {
    const saved = localStorage.getItem(getDraftKey());
    if (saved) {
      try {
        const draft = JSON.parse(saved);
        setTitle(draft.title || '');
        setContentHtml(draft.contentHtml || '');
        setHasDraft(true);
      } catch (e) {}
    }
  }, [userRole]);

  useEffect(() => {
    if (title || contentHtml) {
      const draft = { title, contentHtml, lastSaved: new Date().toISOString() };
      localStorage.setItem(getDraftKey(), JSON.stringify(draft));
      setHasDraft(true);
    } else {
      setHasDraft(false);
    }
  }, [title, contentHtml, userRole]);

  useEffect(() => {
    if (editorRef.current && !isInternalUpdate.current) {
      if (editorRef.current.innerHTML !== contentHtml) {
        editorRef.current.innerHTML = contentHtml;
      }
    }
  }, [contentHtml]);

  useEffect(() => {
    const updateFormatState = () => {
      if (!editorRef.current) return;
      setIsBoldActive(document.queryCommandState('bold'));
      setIsItalicActive(document.queryCommandState('italic'));
      setIsUnderlineActive(document.queryCommandState('underline'));
    };
    document.addEventListener('selectionchange', updateFormatState);
    return () => document.removeEventListener('selectionchange', updateFormatState);
  }, []);

  const clearDraft = () => {
    setTitle('');
    setContentHtml('');
    if (editorRef.current) editorRef.current.innerHTML = '';
    localStorage.removeItem(getDraftKey());
    setHasDraft(false);
    showToast.success('Draft cleared');
  };

  const loadDraft = () => {
    const saved = localStorage.getItem(getDraftKey());
    if (saved) {
      try {
        const draft = JSON.parse(saved);
        setTitle(draft.title || '');
        setContentHtml(draft.contentHtml || '');
        if (editorRef.current) editorRef.current.innerHTML = draft.contentHtml || '';
        showToast.success('Draft loaded');
      } catch (e) {
        showToast.error('Failed to load draft');
      }
    } else {
      showToast.info('No saved draft found');
    }
  };

  const execFormat = (command, value = null) => {
    document.execCommand(command, false, value);
    if (editorRef.current) {
      isInternalUpdate.current = true;
      setContentHtml(editorRef.current.innerHTML);
      setTimeout(() => { isInternalUpdate.current = false; }, 0);
    }
    setTimeout(() => {
      setIsBoldActive(document.queryCommandState('bold'));
      setIsItalicActive(document.queryCommandState('italic'));
      setIsUnderlineActive(document.queryCommandState('underline'));
    }, 10);
  };

  const setTextColor = (color) => {
    document.execCommand('foreColor', false, color);
    if (editorRef.current) {
      isInternalUpdate.current = true;
      setContentHtml(editorRef.current.innerHTML);
      setTimeout(() => { isInternalUpdate.current = false; }, 0);
    }
  };

  const setFontSize = (sizeInPt) => {
    const sizeValue = `${sizeInPt}pt`;
    document.execCommand('styleWithCSS', false, true);
    document.execCommand('fontSize', false, sizeValue);
    if (editorRef.current) {
      isInternalUpdate.current = true;
      setContentHtml(editorRef.current.innerHTML);
      setTimeout(() => { isInternalUpdate.current = false; }, 0);
    }
  };

  const setAlignment = (align) => {
    document.execCommand('justify' + align, false, null);
    if (editorRef.current) {
      isInternalUpdate.current = true;
      setContentHtml(editorRef.current.innerHTML);
      setTimeout(() => { isInternalUpdate.current = false; }, 0);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!editorRef.current || document.activeElement !== editorRef.current) return;
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'b':
            e.preventDefault();
            execFormat('bold');
            break;
          case 'i':
            e.preventDefault();
            execFormat('italic');
            break;
          case 'u':
            e.preventDefault();
            execFormat('underline');
            break;
          default:
            break;
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleEditorInput = () => {
    if (editorRef.current) {
      isInternalUpdate.current = true;
      setContentHtml(editorRef.current.innerHTML);
      setTimeout(() => { isInternalUpdate.current = false; }, 0);
    }
  };

  const generatePDF = async (download = true) => {
    if (!title.trim()) {
      showToast.error('Please enter a document title');
      return;
    }
    setGeneratingType(download ? 'download' : 'preview');
    setIsGenerating(true);

    try {
      const tempDiv = document.createElement('div');
      tempDiv.style.position = 'absolute';
      tempDiv.style.top = '-9999px';
      tempDiv.style.left = '-9999px';
      tempDiv.style.width = '600px';
      tempDiv.style.padding = '20px';
      tempDiv.style.backgroundColor = 'white';
      tempDiv.style.fontFamily = 'Arial, sans-serif';
      tempDiv.style.fontSize = '12pt';
      tempDiv.style.lineHeight = '1.5';
      tempDiv.style.color = '#2d3748';
      tempDiv.innerHTML = contentHtml || '';
      document.body.appendChild(tempDiv);

      const canvas = await html2canvas(tempDiv, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
      });
      document.body.removeChild(tempDiv);

      const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      const marginLeft = 20;
      const marginRight = 20;
      const contentWidth = pageWidth - marginLeft - marginRight;

      const { addOptimizedWatermark } = await import('../admin/ReceiptPDF');
      addOptimizedWatermark(doc, 'letter');

      let yPos = await addHeader(doc, 15);

      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...COLORS.primaryBlue);
      doc.text(title.toUpperCase(), pageWidth / 2, yPos, { align: 'center' });
      yPos += 8;

      yPos = addDivider(doc, yPos, COLORS.primaryBlue);
      yPos += 2;

      const imgWidthPx = canvas.width;
      const imgHeightPx = canvas.height;
      const imgWidthMm = contentWidth;
      const imgHeightMm = (imgHeightPx * imgWidthMm) / imgWidthPx;

      let remainingHeight = imgHeightMm;
      let currentY = yPos;
      let currentPage = 1;
      let startY = 0;

      const bottomReserved = 45;

      while (remainingHeight > 0) {
        if (currentPage > 1) {
          doc.addPage();
          addOptimizedWatermark(doc, 'letter');
          currentY = 15;
        }

        const availableHeight = pageHeight - currentY - bottomReserved;
        let cropHeight = Math.min(remainingHeight, availableHeight);
        const overlap = 2;
        if (remainingHeight > availableHeight && cropHeight > overlap) {
          cropHeight -= overlap;
        }

        const cropStartRatio = startY / imgHeightMm;
        const cropEndRatio = (startY + cropHeight) / imgHeightMm;
        const cropStartPx = cropStartRatio * imgHeightPx;
        const cropEndPx = cropEndRatio * imgHeightPx;
        const croppedHeightPx = cropEndPx - cropStartPx;

        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = imgWidthPx;
        cropCanvas.height = croppedHeightPx;
        const ctx = cropCanvas.getContext('2d');
        ctx.drawImage(canvas, 0, cropStartPx, imgWidthPx, croppedHeightPx, 0, 0, imgWidthPx, croppedHeightPx);
        const croppedImgData = cropCanvas.toDataURL('image/png');

        doc.addImage(croppedImgData, 'PNG', marginLeft, currentY, imgWidthMm, cropHeight);

        remainingHeight -= cropHeight;
        startY += cropHeight;
        currentPage++;
      }

      const lastPage = doc.getNumberOfPages();
      doc.setPage(lastPage);
      let sigY = pageHeight - 35;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...COLORS.textDark);
      doc.text('Yours faithfully,', marginLeft, sigY);
      sigY += 10;
      doc.setFont('helvetica', 'normal');
      doc.text('_________________________', marginLeft, sigY);
      sigY += 6;
      doc.setFont('helvetica', 'bold');
      doc.text('Authorised Signatory', marginLeft, sigY);

      const currentDate = new Date().toLocaleDateString('en-GB');
      addFooter(doc, pageHeight - 15, currentDate);

      if (download) {
        doc.save(`${title.replace(/\s+/g, '_')}.pdf`);
        showToast.success('Document downloaded');
      } else {
        const blob = doc.output('blob');
        const url = URL.createObjectURL(blob);
        window.open(url);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error(error);
      showToast.error('Failed to generate PDF');
    } finally {
      setIsGenerating(false);
      setGeneratingType(null);
    }
  };

  const companyColors = [
    { name: 'Primary Blue', value: `rgb(${COLORS.primaryBlue[0]}, ${COLORS.primaryBlue[1]}, ${COLORS.primaryBlue[2]})` },
    { name: 'Secondary Blue', value: `rgb(${COLORS.secondaryBlue[0]}, ${COLORS.secondaryBlue[1]}, ${COLORS.secondaryBlue[2]})` },
    { name: 'Text Dark', value: `rgb(${COLORS.textDark[0]}, ${COLORS.textDark[1]}, ${COLORS.textDark[2]})` },
    { name: 'Text Light', value: `rgb(${COLORS.textLight[0]}, ${COLORS.textLight[1]}, ${COLORS.textLight[2]})` },
    { name: 'Red', value: '#dc2626' },
    { name: 'Green', value: '#16a34a' },
    { name: 'White', value: '#ffffff' }
  ];

  const [customFontSize, setCustomFontSize] = useState(12);
  const applyCustomFontSize = () => {
    if (customFontSize >= 6 && customFontSize <= 72) {
      setFontSize(customFontSize);
    } else {
      showToast.error('Font size must be between 6 and 72');
    }
  };

  const isLoading = isGenerating;

  return (
    <div className="document-generator">
      <div className="row">
        <div className="col-md-12 mb-4">
          <label className="form-label fw-bold">Document Title</label>
          <input
            type="text"
            className="form-control"
            placeholder="e.g., Travel Budget, Project Proposal, etc."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isLoading}
          />
        </div>

        <div className="col-md-12 mb-2">
          <label className="form-label fw-bold">Formatting</label>
          <div className="d-flex flex-wrap gap-2 mb-2 align-items-center">
            <button
              type="button"
              className={`btn btn-outline-secondary ${isBoldActive ? 'active bg-secondary text-white' : ''}`}
              onClick={() => execFormat('bold')}
              disabled={isLoading}
            >
              <i className="fas fa-bold"></i>
            </button>
            <button
              type="button"
              className={`btn btn-outline-secondary ${isItalicActive ? 'active bg-secondary text-white' : ''}`}
              onClick={() => execFormat('italic')}
              disabled={isLoading}
            >
              <i className="fas fa-italic"></i>
            </button>
            <button
              type="button"
              className={`btn btn-outline-secondary ${isUnderlineActive ? 'active bg-secondary text-white' : ''}`}
              onClick={() => execFormat('underline')}
              disabled={isLoading}
            >
              <i className="fas fa-underline"></i>
            </button>

            <div className="dropdown d-inline-block">
              <button className="btn btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" disabled={isLoading}>
                <i className="fas fa-palette"></i> Color
              </button>
              <ul className="dropdown-menu p-2" style={{ minWidth: '160px' }}>
                {companyColors.map((color) => (
                  <li key={color.value}>
                    <a
                      className="dropdown-item d-flex align-items-center gap-2"
                      href="#"
                      onClick={(e) => { e.preventDefault(); setTextColor(color.value); }}
                      style={{ padding: '6px 12px' }}
                    >
                      <span style={{ display: 'inline-block', width: '20px', height: '20px', backgroundColor: color.value, borderRadius: '4px', border: '1px solid #ccc' }}></span>
                      {color.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div className="dropdown d-inline-block">
              <button className="btn btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" disabled={isLoading}>
                <i className="fas fa-text-height"></i> Size
              </button>
              <ul className="dropdown-menu">
                <li><a className="dropdown-item" href="#" onClick={(e) => { e.preventDefault(); setFontSize(8); }}>8pt</a></li>
                <li><a className="dropdown-item" href="#" onClick={(e) => { e.preventDefault(); setFontSize(9); }}>9pt</a></li>
                <li><a className="dropdown-item" href="#" onClick={(e) => { e.preventDefault(); setFontSize(10); }}>10pt</a></li>
                <li><a className="dropdown-item" href="#" onClick={(e) => { e.preventDefault(); setFontSize(11); }}>11pt</a></li>
                <li><a className="dropdown-item" href="#" onClick={(e) => { e.preventDefault(); setFontSize(12); }}>12pt</a></li>
                <li><a className="dropdown-item" href="#" onClick={(e) => { e.preventDefault(); setFontSize(14); }}>14pt</a></li>
                <li><a className="dropdown-item" href="#" onClick={(e) => { e.preventDefault(); setFontSize(16); }}>16pt</a></li>
                <li><a className="dropdown-item" href="#" onClick={(e) => { e.preventDefault(); setFontSize(18); }}>18pt</a></li>
                <li><a className="dropdown-item" href="#" onClick={(e) => { e.preventDefault(); setFontSize(24); }}>24pt</a></li>
                <li><hr className="dropdown-divider" /></li>
                <li className="px-3 py-2">
                  <div className="input-group input-group-sm">
                    <input
                      type="number"
                      className="form-control"
                      value={customFontSize}
                      onChange={(e) => setCustomFontSize(parseInt(e.target.value) || 12)}
                      min="6"
                      max="72"
                      step="1"
                      style={{ width: '70px' }}
                      disabled={isLoading}
                    />
                    <span className="input-group-text">pt</span>
                    <button className="btn btn-sm btn-primary" onClick={applyCustomFontSize} disabled={isLoading}>Set</button>
                  </div>
                </li>
              </ul>
            </div>

            <div className="btn-group">
              <button type="button" className="btn btn-outline-secondary" onClick={() => setAlignment('Left')} disabled={isLoading}>
                <i className="fas fa-align-left"></i>
              </button>
              <button type="button" className="btn btn-outline-secondary" onClick={() => setAlignment('Center')} disabled={isLoading}>
                <i className="fas fa-align-center"></i>
              </button>
              <button type="button" className="btn btn-outline-secondary" onClick={() => setAlignment('Right')} disabled={isLoading}>
                <i className="fas fa-align-right"></i>
              </button>
            </div>
          </div>
          <small className="text-muted">
            Use Ctrl+B (bold), Ctrl+I (italic), Ctrl+U (underline). Select text to format.
          </small>
        </div>

        <div className="col-md-12 mb-4">
          <label className="form-label fw-bold">Document Body</label>
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            className="form-control rich-editor"
            style={{
              minHeight: '300px',
              overflowY: 'auto',
              backgroundColor: '#fafafa',
              padding: '12px',
              fontSize: '12pt',
              fontFamily: 'Arial, sans-serif',
              direction: 'ltr',
              textAlign: 'left',
              color: '#2d3748'
            }}
            onInput={handleEditorInput}
          />
        </div>

        <div className="col-md-12 d-flex flex-wrap gap-2 justify-content-end">
          {hasDraft && (
            <button className="btn btn-outline-info" onClick={loadDraft} disabled={isLoading}>
              <i className="fas fa-undo me-2"></i>Load Draft
            </button>
          )}
          <button className="btn btn-secondary" onClick={clearDraft} disabled={isLoading}>
            <i className="fas fa-trash me-2"></i>Clear Draft
          </button>
          <button className="btn btn-primary" onClick={() => generatePDF(false)} disabled={isLoading}>
            {isLoading && generatingType === 'preview' ? (
              <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Generating...</>
            ) : (
              <><i className="fas fa-eye me-2"></i>Preview Document</>
            )}
          </button>
          <button className="btn btn-success" onClick={() => generatePDF(true)} disabled={isLoading}>
            {isLoading && generatingType === 'download' ? (
              <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Downloading...</>
            ) : (
              <><i className="fas fa-download me-2"></i>Download PDF Document</>
            )}
          </button>
        </div>
      </div>

      <style>{`
        .rich-editor:focus {
          outline: none;
          border-color: #86b7fe;
          box-shadow: 0 0 0 0.25rem rgba(13,110,253,.25);
        }
        .rich-editor strong, .rich-editor b { font-weight: bold; }
        .rich-editor em, .rich-editor i { font-style: italic; }
        .rich-editor u { text-decoration: underline; }
        .btn.active {
          background-color: #6c757d !important;
          color: white !important;
          border-color: #6c757d !important;
        }
      `}</style>
    </div>
  );
};

export default DocumentGenerator;