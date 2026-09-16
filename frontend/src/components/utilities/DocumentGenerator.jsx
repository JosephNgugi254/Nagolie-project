// frontend/src/components/utilities/DocumentGenerator.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { showToast } from '../common/Toast';
import jsPDF from 'jspdf';
import {
  addHeader, addDivider, addFooter, addOptimizedWatermark, COLORS,
} from '../admin/ReceiptPDF';

/* ------------------------------------------------------------------ *
 * Constants — Word-accurate A4
 * ------------------------------------------------------------------ */
const DEFAULT_FONT_PT     = 12;
const PDF_FONT_PT         = 12;
const DEFAULT_FONT_FAMILY = '"Times New Roman", Times, serif';
const DEFAULT_LINE_HEIGHT = 1.15;
const DEFAULT_COLOR       = [45, 55, 72];

const A4_WIDTH_MM    = 210;
const A4_HEIGHT_MM   = 297;
const A4_MARGIN_MM   = 25.4;                                     // 1 inch
const A4_CONTENT_WIDTH_MM = A4_WIDTH_MM - 2 * A4_MARGIN_MM;      // 159.2 mm
const A4_CONTENT_HEIGHT_MM = A4_HEIGHT_MM - 2 * A4_MARGIN_MM;    // 246.2 mm

const PT_TO_MM      = 0.352778;
const CSS_PX_PER_PT = 96 / 72;

const EDITOR_LINE_HEIGHT_PX =
  DEFAULT_FONT_PT * CSS_PX_PER_PT * DEFAULT_LINE_HEIGHT;         // 18.4 px
const PDF_LINE_HEIGHT_MM =
  PDF_FONT_PT * DEFAULT_LINE_HEIGHT * PT_TO_MM;                  // 4.87 mm

// Times metrics for baseline offset
const FONT_ASCENT_EM  = 0.683;
const FONT_DESCENT_EM = 0.217;
const FONT_CONTENT_EM = FONT_ASCENT_EM + FONT_DESCENT_EM;
const HALF_LEADING_PT = (PDF_FONT_PT * DEFAULT_LINE_HEIGHT - FONT_CONTENT_EM * PDF_FONT_PT) / 2;
const BASELINE_OFFSET_MM = (HALF_LEADING_PT + FONT_ASCENT_EM * PDF_FONT_PT) * PT_TO_MM;

const MIN_IMG_SIZE      = 20;
const MAX_IMG_SIZE      = 1200;
const DEFAULT_IMG_WIDTH = 180;
const MAX_IMG_BYTES     = 4 * 1024 * 1024;

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */
const parseColor = (str) => {
  if (!str) return DEFAULT_COLOR;
  str = String(str).trim();
  if (str === 'transparent') return DEFAULT_COLOR;
  if (str.startsWith('#')) {
    const hex = str.slice(1);
    if (hex.length === 3) return [parseInt(hex[0]+hex[0],16), parseInt(hex[1]+hex[1],16), parseInt(hex[2]+hex[2],16)];
    if (hex.length === 6) return [parseInt(hex.slice(0,2),16), parseInt(hex.slice(2,4),16), parseInt(hex.slice(4,6),16)];
  }
  const m = str.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const p = m[1].split(',').map((s) => parseFloat(s.trim()));
    return [p[0]||0, p[1]||0, p[2]||0];
  }
  return DEFAULT_COLOR;
};

const colorsEqual = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

/* ------------------------------------------------------------------ *
 * ★ Extract lines using the BROWSER'S OWN line breaking
 *
 *   Walk every character and use Range.getClientRects() to discover
 *   which line the browser put it on.  Group consecutive characters
 *   with the same `top` into one PDF line.  This makes PDF line
 *   breaks identical to editor line breaks — no re-measuring.
 * ------------------------------------------------------------------ */
const extractLinesFromEditor = (editor, scale = 1) => {
  const lines = [];
  let currentLine = [];
  let currentTop  = null;

  // Vertical jump threshold scales with the rendered line-height
  const jumpThreshold = Math.max(2, EDITOR_LINE_HEIGHT_PX * scale * 0.5);

  const flushLine = () => {
    lines.push(currentLine);
    currentLine = [];
    currentTop = null;
  };

  const pushInline = (text, ctx, top) => {
    if (!text) return;
    if (top !== null && currentTop !== null && Math.abs(top - currentTop) > jumpThreshold) {
      flushLine();
    }
    if (currentLine.length > 0) {
      const last = currentLine[currentLine.length - 1];
      if (
        last.bold === ctx.bold && last.italic === ctx.italic &&
        last.underline === ctx.underline && last.size === ctx.size &&
        colorsEqual(last.color, ctx.color)
      ) {
        last.text += text;
        if (top !== null) currentTop = top;
        return;
      }
    }
    currentLine.push({ text, ...ctx });
    if (top !== null) currentTop = top;
  };

  const pushSegment = (text, ctx, top) => {
    if (!text) return;
    if (text.indexOf('\n') !== -1) {
      const parts = text.split('\n');
      for (let i = 0; i < parts.length; i++) {
        if (i > 0 && currentLine.length > 0) flushLine();
        if (parts[i]) pushInline(parts[i], ctx, top);
      }
      return;
    }
    pushInline(text, ctx, top);
  };

  const SKIP_CLASS = ['doc-image-handle', 'doc-image-delete', 'doc-image-wrap'];
  const BLOCK_TAGS = new Set(['DIV','P','H1','H2','H3','H4','H5','H6','LI','BLOCKQUOTE','TR','PRE','UL','OL','SECTION','ARTICLE']);

  const walkTextNode = (node, ctx) => {
    const text = node.textContent;
    if (!text) return;

    const tokens = text.match(/\S+\s*|\s+/g) || [text];
    const range = document.createRange();
    let offset = 0;

    for (const tok of tokens) {
      const start = offset;
      const end   = offset + tok.length;
      offset = end;

      try {
        range.setStart(node, start);
        range.setEnd(node, end);
        const rects = range.getClientRects();

        if (rects.length === 0) {
          pushSegment(tok, ctx, null);
        } else if (rects.length === 1) {
          pushSegment(tok, ctx, Math.round(rects[0].top));
        } else {
          // Word straddles a line break → split per character
          for (let i = 0; i < tok.length; i++) {
            try {
              range.setStart(node, start + i);
              range.setEnd(node, start + i + 1);
              const cr = range.getClientRects()[0];
              pushSegment(tok[i], ctx, cr ? Math.round(cr.top) : null);
            } catch {
              pushSegment(tok[i], ctx, null);
            }
          }
        }
      } catch {
        pushSegment(tok, ctx, null);
      }
    }
  };

  const walk = (node, ctx) => {
    if (node.nodeType === 3) { walkTextNode(node, ctx); return; }
    if (node.nodeType !== 1) return;

    const cls = typeof node.className === 'string' ? node.className : '';
    if (SKIP_CLASS.some((c) => cls.includes(c))) return;

    const tag = node.tagName;
    if (tag === 'BR') {
      if (currentLine.length > 0) flushLine();
      lines.push([]); // blank line placeholder
      return;
    }

    const newCtx = { ...ctx };
    if (tag === 'B' || tag === 'STRONG') newCtx.bold = true;
    if (tag === 'I' || tag === 'EM')     newCtx.italic = true;
    if (tag === 'U')                     newCtx.underline = true;

    const style = node.style;
    if (style) {
      if (style.fontWeight) {
        const w = style.fontWeight;
        newCtx.bold = w === 'bold' || w === 'bolder' || parseInt(w, 10) >= 600;
      }
      if (style.fontStyle) {
        if (style.fontStyle === 'italic') newCtx.italic = true;
        else if (style.fontStyle === 'normal') newCtx.italic = false;
      }
      if (style.textDecoration && style.textDecoration.includes('underline')) newCtx.underline = true;
      if (style.textDecorationLine && style.textDecorationLine.includes('underline')) newCtx.underline = true;
      if (style.color) newCtx.color = parseColor(style.color);
    }

    if (tag === 'FONT') {
      const c = node.getAttribute('color');
      if (c) newCtx.color = parseColor(c);
    }

    const isBlock = BLOCK_TAGS.has(tag);
    if (isBlock && currentLine.length > 0) flushLine();

    for (const child of node.childNodes) walk(child, newCtx);

    if (isBlock && currentLine.length > 0) flushLine();
  };

  const initial = {
    bold: false, italic: false, underline: false,
    color: DEFAULT_COLOR, size: PDF_FONT_PT,
  };
  for (const child of editor.childNodes) walk(child, initial);
  if (currentLine.length > 0) flushLine();

  while (lines.length && lines[lines.length - 1].length === 0) lines.pop();
  while (lines.length && lines[0].length === 0) lines.shift();

  return lines;
};

/* ------------------------------------------------------------------ *
 * Collect absolutely-positioned images
 * ------------------------------------------------------------------ */
const collectImages = (editor) => {
  const images = [];
  const cs = window.getComputedStyle(editor);
  const padL = parseFloat(cs.paddingLeft) || 0;
  const padT = parseFloat(cs.paddingTop) || 0;

  editor.querySelectorAll('.doc-image-wrap').forEach((wrap) => {
    const img = wrap.querySelector('img');
    if (!img || !img.src) return;
    const x = parseFloat(wrap.dataset.x || wrap.style.left || '0') || 0;
    const y = parseFloat(wrap.dataset.y || wrap.style.top  || '0') || 0;
    const w = img.offsetWidth  || parseFloat(img.style.width) || DEFAULT_IMG_WIDTH;
    const h = img.offsetHeight ||
      (img.naturalWidth ? (img.naturalHeight * w) / img.naturalWidth : w);
    images.push({
      src: img.src,
      xPx: Math.max(0, x - padL),
      yPx: Math.max(0, y - padT),
      wPx: w, hPx: h,
    });
  });

  return {
    images,
    contentWidthPx: Math.max(1, editor.clientWidth - padL - (parseFloat(cs.paddingRight) || 0)),
  };
};

/* ------------------------------------------------------------------ *
 * Component
 * ------------------------------------------------------------------ */
const DocumentGenerator = ({ userRole }) => {
  const [title, setTitle]               = useState('');
  const [html, setHtml]                 = useState('');
  const [hasDraft, setHasDraft]         = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingType, setGeneratingType] = useState(null);
  const [formatState, setFormatState]   = useState({ bold: false, italic: false, underline: false });
  const [renderScale, setRenderScale]   = useState(1);

  const editorRef          = useRef(null);
  const pageWrapperRef     = useRef(null);
  const fileInputRef       = useRef(null);
  const selectedImageRef   = useRef(null);
  const interactionRef     = useRef(null);
  const savedRangeRef      = useRef(null);
  const renderScaleRef     = useRef(1);

  useEffect(() => { renderScaleRef.current = renderScale; }, [renderScale]);

  const getDraftKey = useCallback(() => {
    const uid = userRole?.id || userRole?.username || 'anonymous';
    return `docDraft_${uid}`;
  }, [userRole]);

  useEffect(() => {
    const saved = localStorage.getItem(getDraftKey());
    if (!saved) return;
    try {
      const d = JSON.parse(saved);
      setTitle(d.title || '');
      setHtml(d.html || '');
      if (editorRef.current) editorRef.current.innerHTML = d.html || '';
      setHasDraft(true);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!title && !html) { setHasDraft(false); return; }
    try {
      localStorage.setItem(getDraftKey(),
        JSON.stringify({ title, html, lastSaved: new Date().toISOString() }));
      setHasDraft(true);
    } catch {}
  }, [title, html, getDraftKey]);

  /* --------- responsive page scaling --------- */
  useEffect(() => {
    const naturalWidthPx = A4_WIDTH_MM * (96 / 25.4);
    const update = () => {
      const w = pageWrapperRef.current;
      if (!w) return;
      const avail = w.clientWidth - 16;
      setRenderScale(Math.min(1, Math.max(0.15, avail / naturalWidthPx)));
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    const update = () => {
      const editor = editorRef.current;
      if (!editor) return;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      if (!sel.anchorNode || !editor.contains(sel.anchorNode)) return;
      try {
        setFormatState({
          bold: document.queryCommandState('bold'),
          italic: document.queryCommandState('italic'),
          underline: document.queryCommandState('underline'),
        });
      } catch {}
    };
    document.addEventListener('selectionchange', update);
    return () => document.removeEventListener('selectionchange', update);
  }, []);

  const focusEditor = () => editorRef.current?.focus();

  const syncHtml = useCallback(() => {
    if (!editorRef.current) return;
    setHtml(editorRef.current.innerHTML);
  }, []);

  const refreshFormatState = useCallback(() => {
    try {
      setFormatState({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
      });
    } catch {}
  }, []);

  const exec = useCallback((cmd, val = null) => {
    focusEditor();
    try { document.execCommand(cmd, false, val); } catch {}
    syncHtml();
    refreshFormatState();
  }, [syncHtml, refreshFormatState]);

  const setTextColor = useCallback((color) => exec('foreColor', color), [exec]);

  useEffect(() => {
    const onKey = (e) => {
      const editor = editorRef.current;
      if (!editor) return;
      const focused = document.activeElement === editor || editor.contains(document.activeElement);
      if (!focused) return;

      if (selectedImageRef.current && (e.key === 'Delete' || e.key === 'Backspace')) {
        const sel = window.getSelection();
        const inside = sel && sel.anchorNode && selectedImageRef.current.contains(sel.anchorNode);
        if (!inside) {
          e.preventDefault();
          selectedImageRef.current.remove();
          selectedImageRef.current = null;
          syncHtml();
          return;
        }
      }

      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === 'b') { e.preventDefault(); exec('bold'); }
      else if (k === 'i') { e.preventDefault(); exec('italic'); }
      else if (k === 'u') { e.preventDefault(); exec('underline'); }
      else if (k === 'z' && !e.shiftKey) { e.preventDefault(); exec('undo'); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); exec('redo'); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [exec, syncHtml]);

  const deselectImage = useCallback(() => {
    const w = selectedImageRef.current;
    if (!w) return;
    w.classList.remove('selected');
    w.querySelectorAll('.doc-image-handle, .doc-image-delete').forEach((h) => h.remove());
    selectedImageRef.current = null;
  }, []);

  const selectImage = useCallback((wrapper) => {
    deselectImage();
    selectedImageRef.current = wrapper;
    wrapper.classList.add('selected');
    ['nw', 'ne', 'sw', 'se'].forEach((pos) => {
      const h = document.createElement('span');
      h.className = `doc-image-handle handle-${pos}`;
      h.dataset.handle = pos;
      h.setAttribute('contenteditable', 'false');
      wrapper.appendChild(h);
    });
    const del = document.createElement('span');
    del.className = 'doc-image-delete';
    del.setAttribute('contenteditable', 'false');
    del.setAttribute('title', 'Delete image');
    del.textContent = '×';
    del.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      wrapper.remove();
      selectedImageRef.current = null;
      syncHtml();
    });
    wrapper.appendChild(del);
  }, [deselectImage, syncHtml]);

  const insertImage = useCallback((dataUrl) => {
    const editor = editorRef.current;
    if (!editor) return;
    focusEditor();

    const scale = renderScaleRef.current || 1;
    const editorRect = editor.getBoundingClientRect();

    let left = 20;
    let top  = 20;

    const sel = window.getSelection();
    const range = savedRangeRef.current ||
      (sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null);

    if (range && editor.contains(range.commonAncestorContainer)) {
      const r = range.cloneRange();
      r.collapse(true);
      let rect = r.getBoundingClientRect();
      if (!rect || (rect.width === 0 && rect.height === 0 && rect.top === 0)) {
        const marker = document.createElement('span');
        marker.textContent = '\u200B';
        r.insertNode(marker);
        rect = marker.getBoundingClientRect();
        marker.parentNode.removeChild(marker);
      }
      left = (rect.left - editorRect.left) / scale;
      top  = (rect.top  - editorRect.top ) / scale;
    }

    left = Math.max(0, left);
    top  = Math.max(0, top);

    const wrapper = document.createElement('span');
    wrapper.className = 'doc-image-wrap';
    wrapper.setAttribute('contenteditable', 'false');
    wrapper.style.position = 'absolute';
    wrapper.style.left = `${left}px`;
    wrapper.style.top  = `${top}px`;
    wrapper.style.zIndex = '9999';
    wrapper.dataset.x = String(left);
    wrapper.dataset.y = String(top);

    const img = document.createElement('img');
    img.src = dataUrl;
    img.draggable = false;
    img.style.width = `${DEFAULT_IMG_WIDTH}px`;
    img.style.height = 'auto';
    img.style.display = 'block';
    img.style.userSelect = 'none';
    img.style.pointerEvents = 'none';
    wrapper.appendChild(img);

    editor.appendChild(wrapper);
    savedRangeRef.current = null;
    syncHtml();
    setTimeout(() => selectImage(wrapper), 0);
  }, [syncHtml, selectImage]);

  const handleAddImageClick = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    }
    fileInputRef.current?.click();
  };

  const onPickFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast.error('Please choose an image file'); return; }
    if (file.size > MAX_IMG_BYTES) { showToast.error('Image must be under 4 MB'); return; }
    const reader = new FileReader();
    reader.onload  = () => insertImage(reader.result);
    reader.onerror = () => showToast.error('Could not read the image');
    reader.readAsDataURL(file);
  };

  const onPaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type && item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => insertImage(reader.result);
        reader.readAsDataURL(file);
        return;
      }
    }
  };

  const onEditorPointerDown = (e) => {
    if (e.target.closest?.('.doc-image-delete')) return;

    const handle = e.target.closest?.('.doc-image-handle');
    if (handle && selectedImageRef.current) {
      e.preventDefault(); e.stopPropagation();
      const wrapper = selectedImageRef.current;
      const img = wrapper.querySelector('img');
      if (!img) return;
      const rect = img.getBoundingClientRect();
      const scale = renderScaleRef.current || 1;
      interactionRef.current = {
        mode: 'resize',
        corner: handle.dataset.handle || 'se',
        startX: e.clientX, startY: e.clientY,
        startW: rect.width / scale, startH: rect.height / scale,
        aspect: rect.width / rect.height || 1,
        wrapper, img,
      };
      return;
    }

    const wrapper = e.target.closest?.('.doc-image-wrap');
    if (wrapper) {
      e.preventDefault(); e.stopPropagation();
      if (selectedImageRef.current !== wrapper) selectImage(wrapper);
      interactionRef.current = {
        mode: 'drag',
        startX: e.clientX, startY: e.clientY,
        startDx: parseFloat(wrapper.dataset.x || '0'),
        startDy: parseFloat(wrapper.dataset.y || '0'),
        wrapper,
      };
      return;
    }

    if (selectedImageRef.current) deselectImage();
  };

  useEffect(() => {
    const onMove = (e) => {
      const s = interactionRef.current;
      if (!s) return;
      e.preventDefault();
      const scale = renderScaleRef.current || 1;
      if (s.mode === 'drag') {
        const dx = Math.max(0, s.startDx + (e.clientX - s.startX) / scale);
        const dy = Math.max(0, s.startDy + (e.clientY - s.startY) / scale);
        s.wrapper.dataset.x = String(dx);
        s.wrapper.dataset.y = String(dy);
        s.wrapper.style.left = `${dx}px`;
        s.wrapper.style.top  = `${dy}px`;
      } else if (s.mode === 'resize') {
        const dx = (e.clientX - s.startX) / scale;
        let newW = s.startW;
        if (s.corner.includes('e')) newW = s.startW + dx;
        else if (s.corner.includes('w')) newW = s.startW - dx;
        newW = Math.max(MIN_IMG_SIZE, Math.min(MAX_IMG_SIZE, newW));
        s.img.style.width = `${newW}px`;
        s.img.style.height = `${newW / s.aspect}px`;
      }
    };
    const onUp = () => {
      if (!interactionRef.current) return;
      interactionRef.current = null;
      syncHtml();
    };
    document.addEventListener('pointermove', onMove, { passive: false });
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
    };
  }, [syncHtml]);

  useEffect(() => {
    const handler = (e) => {
      if (!selectedImageRef.current) return;
      const editor = editorRef.current;
      if (!editor) return;
      if (!editor.contains(e.target)) deselectImage();
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [deselectImage]);

  const onEditorInput = () => {
    if (selectedImageRef.current && !editorRef.current?.contains(selectedImageRef.current)) {
      selectedImageRef.current = null;
    }
    syncHtml();
  };

  const clearDraft = () => {
    deselectImage();
    setTitle(''); setHtml('');
    if (editorRef.current) editorRef.current.innerHTML = '';
    localStorage.removeItem(getDraftKey());
    setHasDraft(false);
    showToast.success('Draft cleared');
  };

  const loadDraft = () => {
    const saved = localStorage.getItem(getDraftKey());
    if (!saved) { showToast.info('No saved draft found'); return; }
    try {
      const d = JSON.parse(saved);
      deselectImage();
      setTitle(d.title || '');
      setHtml(d.html || '');
      if (editorRef.current) editorRef.current.innerHTML = d.html || '';
      showToast.success('Draft loaded');
    } catch { showToast.error('Failed to load draft'); }
  };

  /* ================================================================== *
   * PDF GENERATION
   * ================================================================== */
  const generatePDF = async (download = true) => {
    if (!title.trim()) { showToast.error('Please enter a document title'); return; }
    setGeneratingType(download ? 'download' : 'preview');
    setIsGenerating(true);

    try {
      const editor = editorRef.current;
      if (!editor) throw new Error('Editor not ready');

      const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      const pageWidth   = doc.internal.pageSize.width;
      const pageHeight  = doc.internal.pageSize.height;
      const contentWidth = A4_CONTENT_WIDTH_MM;

      addOptimizedWatermark(doc, 'document');
      let yPos = await addHeader(doc, 15);

      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...COLORS.primaryBlue);
      doc.text(title.toUpperCase(), pageWidth / 2, yPos, { align: 'center' });
      yPos += 6;
      yPos = addDivider(doc, yPos, COLORS.primaryBlue);
      yPos += 4;

      const bodyStartY = yPos;

      /* ---- Extract lines using the browser's own wrapping ---- */
      const scale = renderScaleRef.current || 1;
      const lines = extractLinesFromEditor(editor, scale);
      console.log('[DocExport] lines:', lines.length);

      /* ---- Render each line ---- */
      let cursorY = bodyStartY;
      const maxY = pageHeight - 25;

      for (const line of lines) {
        let maxSize = PDF_FONT_PT;
        for (const seg of line) if (seg.size > maxSize) maxSize = seg.size;
        const lineH = maxSize * DEFAULT_LINE_HEIGHT * PT_TO_MM;

        if (cursorY + lineH > maxY) {
          doc.addPage();
          addOptimizedWatermark(doc, 'document');
          cursorY = A4_MARGIN_MM;
        }

        // Empty line → just advance (preserves paragraph gaps)
        if (line.length === 0) {
          cursorY += lineH;
          continue;
        }

        let x = A4_MARGIN_MM;
        for (const seg of line) {
          const style =
            seg.bold && seg.italic ? 'bolditalic'
            : seg.bold ? 'bold'
            : seg.italic ? 'italic'
            : 'normal';
          doc.setFont('times', style);
          doc.setFontSize(seg.size);
          doc.setTextColor(seg.color[0], seg.color[1], seg.color[2]);

          const w = doc.getTextWidth(seg.text);
          doc.text(seg.text, x, cursorY);

          if (seg.underline) {
            doc.setDrawColor(seg.color[0], seg.color[1], seg.color[2]);
            doc.setLineWidth(0.2);
            doc.line(
              x,
              cursorY + seg.size * 0.15 * PT_TO_MM,
              x + w,
              cursorY + seg.size * 0.15 * PT_TO_MM
            );
          }
          x += w;
        }
        cursorY += lineH;
      }

      /* ---- Images ---- */
      const { images, contentWidthPx } = collectImages(editor);
      const xScale = contentWidth / contentWidthPx;
      const yScale = PDF_LINE_HEIGHT_MM / EDITOR_LINE_HEIGHT_PX;
      console.log('[DocExport] images:', images.length, 'xScale:', xScale, 'yScale:', yScale);

      const imageBaseY = bodyStartY - BASELINE_OFFSET_MM;

      images.forEach((im) => {
        const xMm = A4_MARGIN_MM + im.xPx * xScale;
        const yMm = imageBaseY + im.yPx * yScale;
        const wMm = im.wPx * xScale;
        const hMm = im.hPx * xScale;
        try { doc.addImage(im.src, 'PNG', xMm, yMm, wMm, hMm); }
        catch (e) { console.warn('[DocExport] addImage failed', e); }
      });

      const totalPages = doc.getNumberOfPages();
      doc.setPage(totalPages);
      addFooter(doc, pageHeight - 15);

      if (download) {
        doc.save(`${title.replace(/\s+/g, '_')}.pdf`);
        showToast.success('Document downloaded');
      } else {
        const blob = doc.output('blob');
        const url  = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    } catch (error) {
      console.error('[DocExport] error:', error);
      showToast.error('Failed to generate PDF');
    } finally {
      setIsGenerating(false);
      setGeneratingType(null);
    }
  };

  const isLoading = isGenerating;

  const companyColors = [
    { name: 'Primary Blue',   value: `rgb(${COLORS.primaryBlue.join(',')})` },
    { name: 'Secondary Blue', value: `rgb(${COLORS.secondaryBlue.join(',')})` },
    { name: 'Text Dark',      value: `rgb(${COLORS.textDark.join(',')})` },
    { name: 'Text Light',     value: `rgb(${COLORS.textLight.join(',')})` },
    { name: 'Red',            value: '#dc2626' },
    { name: 'Green',          value: '#16a34a' },
    { name: 'Black',          value: '#000000' },
  ];

  const naturalPageWidthPx  = A4_WIDTH_MM  * (96 / 25.4);
  const naturalPageHeightPx = A4_HEIGHT_MM * (96 / 25.4);

  return (
    <div className="document-generator">
      <div className="row">
        <div className="col-md-12 mb-4">
          <label className="form-label fw-bold">Document Title</label>
          <input type="text" className="form-control"
            placeholder="e.g., Travel Budget, Project Proposal, etc."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isLoading} />
        </div>

        <div className="col-md-12 mb-2">
          <label className="form-label fw-bold">Formatting</label>
          <div className="d-flex flex-wrap gap-2 mb-2 align-items-center">
            <button type="button"
              className={`btn btn-outline-secondary ${formatState.bold ? 'active bg-secondary text-white' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => exec('bold')} disabled={isLoading} title="Bold (Ctrl+B)">
              <i className="fas fa-bold"></i>
            </button>
            <button type="button"
              className={`btn btn-outline-secondary ${formatState.italic ? 'active bg-secondary text-white' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => exec('italic')} disabled={isLoading} title="Italic (Ctrl+I)">
              <i className="fas fa-italic"></i>
            </button>
            <button type="button"
              className={`btn btn-outline-secondary ${formatState.underline ? 'active bg-secondary text-white' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => exec('underline')} disabled={isLoading} title="Underline (Ctrl+U)">
              <i className="fas fa-underline"></i>
            </button>
            <div className="dropdown d-inline-block">
              <button className="btn btn-outline-secondary dropdown-toggle" type="button"
                data-bs-toggle="dropdown"
                onMouseDown={(e) => e.preventDefault()}
                disabled={isLoading}>
                <i className="fas fa-palette"></i> Color
              </button>
              <ul className="dropdown-menu p-2" style={{ minWidth: '160px' }}>
                {companyColors.map((c) => (
                  <li key={c.value}>
                    <button type="button"
                      className="dropdown-item d-flex align-items-center gap-2"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setTextColor(c.value)}
                      style={{ padding: '6px 12px' }}>
                      <span style={{
                        display: 'inline-block', width: '20px', height: '20px',
                        backgroundColor: c.value, borderRadius: '4px', border: '1px solid #ccc',
                      }}></span>
                      {c.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <button type="button" className="btn btn-outline-primary"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleAddImageClick} disabled={isLoading}
              title="Insert image / signature / logo">
              <i className="fas fa-image"></i> Add Image
            </button>
            <input type="file" accept="image/*" ref={fileInputRef}
              onChange={onPickFile} style={{ display: 'none' }} />
            <button type="button" className="btn btn-outline-secondary"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => exec('undo')} disabled={isLoading} title="Undo (Ctrl+Z)">
              <i className="fas fa-undo"></i>
            </button>
            <button type="button" className="btn btn-outline-secondary"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => exec('redo')} disabled={isLoading} title="Redo (Ctrl+Y)">
              <i className="fas fa-redo"></i>
            </button>
          </div>
          <small className="text-muted">
            A4 page · 1-inch margins · Times New Roman 12 pt · single-spaced.
            Line breaks match the printed output exactly.
          </small>
        </div>

        {/* ---------- A4 page view ---------- */}
        <div className="col-md-12 mb-4">
          <label className="form-label fw-bold">Document Body (A4 view)</label>
          <div
            ref={pageWrapperRef}
            style={{
              display: 'flex',
              justifyContent: 'center',
              padding: '20px 8px',
              backgroundColor: '#e5e7eb',
              borderRadius: '6px',
              overflowX: 'auto',
              overflowY: 'auto',
            }}
          >
            <div
              style={{
                width: `${naturalPageWidthPx  * renderScale}px`,
                minHeight: `${naturalPageHeightPx * renderScale}px`,
                position: 'relative',
                flex: '0 0 auto',
              }}
            >
              <div
                style={{
                  width: `${A4_WIDTH_MM}mm`,
                  minHeight: `${A4_HEIGHT_MM}mm`,
                  padding: `${A4_MARGIN_MM}mm`,
                  backgroundColor: '#ffffff',
                  boxSizing: 'border-box',
                  boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
                  position: 'absolute',
                  top: 0, left: 0,
                  transform: `scale(${renderScale})`,
                  transformOrigin: 'top left',
                }}
              >
                <div
                  ref={editorRef}
                  contentEditable={!isLoading}
                  suppressContentEditableWarning
                  className="rich-editor"
                  style={{
                    width: '100%',
                    minHeight: `${A4_CONTENT_HEIGHT_MM}mm`,
                    padding: '0', margin: '0',
                    fontSize: `${DEFAULT_FONT_PT}pt`,
                    fontFamily: DEFAULT_FONT_FAMILY,
                    lineHeight: DEFAULT_LINE_HEIGHT,
                    color: '#2d3748',
                    position: 'relative',
                    outline: 'none',
                    whiteSpace: 'pre-wrap',
                    wordWrap: 'break-word',
                    overflowWrap: 'break-word',
                    fontKerning: 'none',
                    fontVariantLigatures: 'none',
                    textRendering: 'geometricPrecision',
                  }}
                  onInput={onEditorInput}
                  onPaste={onPaste}
                  onPointerDown={onEditorPointerDown}
                />
              </div>
            </div>
          </div>
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
        .rich-editor:focus { outline: none; }
        .rich-editor strong, .rich-editor b { font-weight: bold; }
        .rich-editor em, .rich-editor i { font-style: italic; }
        .rich-editor u { text-decoration: underline; }
        /* Kill default margins/padding on block children so browser
           line breaks match PDF line breaks exactly */
        .rich-editor p,
        .rich-editor > div,
        .rich-editor h1, .rich-editor h2, .rich-editor h3,
        .rich-editor h4, .rich-editor h5, .rich-editor h6,
        .rich-editor ul, .rich-editor ol, .rich-editor li,
        .rich-editor blockquote { margin: 0; padding: 0; }

        .rich-editor .doc-image-wrap {
          position: absolute;
          display: block;
          line-height: 0;
          z-index: 9999;
          cursor: move;
          touch-action: none;
          max-width: calc(100% - 8px);
        }
        .rich-editor .doc-image-wrap img {
          max-width: 100%;
          height: auto;
          display: block;
          pointer-events: none;
          user-select: none;
          -webkit-user-drag: none;
        }
        .rich-editor .doc-image-wrap.selected {
          outline: 2px solid #3b82f6;
          outline-offset: 2px;
        }
        .rich-editor .doc-image-handle {
          position: absolute;
          width: 12px; height: 12px;
          background: #3b82f6;
          border: 2px solid #ffffff;
          border-radius: 50%;
          box-sizing: border-box;
          z-index: 5;
          touch-action: none;
        }
        .rich-editor .handle-nw { top: -7px; left: -7px;  cursor: nwse-resize; }
        .rich-editor .handle-ne { top: -7px; right: -7px; cursor: nesw-resize; }
        .rich-editor .handle-sw { bottom: -7px; left: -7px;  cursor: nesw-resize; }
        .rich-editor .handle-se { bottom: -7px; right: -7px; cursor: nwse-resize; }

        .rich-editor .doc-image-delete {
          position: absolute;
          top: -14px; right: -14px;
          width: 22px; height: 22px;
          border-radius: 50%;
          background: #dc2626;
          color: #ffffff;
          font-size: 16px; line-height: 20px;
          text-align: center;
          font-family: Arial, sans-serif;
          font-weight: bold;
          cursor: pointer;
          z-index: 10;
          box-shadow: 0 1px 4px rgba(0,0,0,0.3);
          user-select: none;
          touch-action: none;
        }
        .rich-editor .doc-image-delete:hover { background: #b91c1c; }

        .btn.active {
          background-color: #6c757d !important;
          color: #fff !important;
          border-color: #6c757d !important;
        }

        @media (max-width: 480px) {
          .document-generator .col-md-12 > div[style*="background-color: rgb(229, 231, 235)"] {
            padding: 10px 4px !important;
          }
        }
      `}</style>
    </div>
  );
};

export default DocumentGenerator;