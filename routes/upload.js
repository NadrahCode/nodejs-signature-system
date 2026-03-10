import express from 'express';
import multer from 'multer';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../config/db.js';
import axios from 'axios';
import FormData from 'form-data';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const upload = multer({ storage: multer.memoryStorage() });

// Utility: Generate token
const generateToken = () => crypto.randomBytes(16).toString('hex');

// Utility: Create digital signature
const createSignature = (content, docName, description) => {
  const crypto_module = crypto;
  
  const documentHash = crypto_module.createHash('sha256').update(content).digest('hex');
  const signatureHash = crypto_module.createHash('sha256').update(documentHash + docName + description).digest('hex');
  
  return {
    signature_hash: signatureHash,
    document_hash: documentHash,
    public_key: 'node-rsa-key',
    key_id: 'key_001',
    document_id: crypto_module.randomBytes(32).toString('hex'),
    checksum: crypto_module.createHash('sha256').update(signatureHash).digest('hex'),
    unix_timestamp: Math.floor(Date.now() / 1000)
  };
};

// Utility: Upload PDF to InfinityFree
const uploadPDFToInfinity = async (pdfPath, fileName) => {
  try {
    const fileStream = fs.createReadStream(pdfPath);
    const formData = new FormData();
    formData.append('file', fileStream, fileName);
    
    // Upload endpoint (you need to set this up on your InfinityFree)
    const response = await axios.post(
      process.env.INFINITYFREE_UPLOAD_URL || 'http://localhost:3000/api/store-pdf',
      formData,
      { headers: formData.getHeaders() }
    );
    
    return response.data;
  } catch (error) {
    console.error('PDF upload failed:', error.message);
    throw error;
  }
};

// POST /api/upload - Upload and sign document
router.post('/', upload.single('word_file'), async (req, res) => {
  try {
    const { doc_name, description, doc_source, doc_content } = req.body;
    const token = generateToken();
    
    // Validate input
    if (!doc_name) {
      return res.status(400).json({ error: 'Document name is required' });
    }
    
    if (doc_source === 'upload' && !req.file) {
      return res.status(400).json({ error: 'File is required' });
    }
    
    if (doc_source === 'text' && !doc_content) {
      return res.status(400).json({ error: 'Document content is required' });
    }
    
    // Get user from session (you'll need to implement auth)
    const userId = req.session?.userId || 1;
    const userName = req.session?.name || 'System';
    const userEmail = req.session?.email || 'system@example.com';
    
    // Extract content
    let extractedText = '';
    let content = '';
    
    if (doc_source === 'upload') {
      content = `UPLOADED:${req.file.originalname}`;
      extractedText = `Content from ${req.file.originalname}`;
    } else {
      content = doc_content;
      extractedText = doc_content;
    }
    
    // Create signature
    const signature = createSignature(content, doc_name, description);
    const hash_lock = crypto.createHash('sha256').update(`${token}|${signature.signature_hash}`).digest('hex').substring(0, 32);
    const format_lock = crypto.createHash('sha256').update(`${token}|format_lock_seed|PDF`).digest('hex').substring(0, 32);
    
    const locked_verification_url = `https://your-vercel-domain.vercel.app/api/verify?token=${token}&h=${hash_lock}&f=${format_lock}`;
    
    // Generate PDF with QR code
    const pdfPath = path.join('/tmp', `${token}.pdf`);
    const pdfDoc = new PDFDocument({ size: 'A4' });
    const writeStream = fs.createWriteStream(pdfPath);
    
    pdfDoc.pipe(writeStream);
    
    // PAGE 1: Document Content
    pdfDoc.fontSize(18).fillColor('#028090').text(doc_name, { align: 'center' });
    pdfDoc.moveTo(20, 50).lineTo(590, 50).stroke('#028090');
    
    if (description) {
      pdfDoc.fontSize(10).fillColor('#000000').text('Description:', { underline: true });
      pdfDoc.fontSize(10).text(description);
      pdfDoc.moveTo(20, pdfDoc.y + 5).lineTo(590, pdfDoc.y + 5).stroke('#ccc');
    }
    
    pdfDoc.fontSize(10).fillColor('#028090').text('Document Content:', { underline: true });
    pdfDoc.fontSize(10).fillColor('#000000').text(extractedText);
    
    // PAGE 2: Signature & QR
    pdfDoc.addPage();
    pdfDoc.fontSize(18).fillColor('#028090').text('Digital Signature Verification', { align: 'center' });
    pdfDoc.moveTo(20, pdfDoc.y + 10).lineTo(590, pdfDoc.y + 10).stroke('#028090');
    
    pdfDoc.fontSize(10).fillColor('#000000');
    pdfDoc.text(`Document Name: ${doc_name}`);
    pdfDoc.text(`Signed By: ${userName}`);
    pdfDoc.text(`Signer Email: ${userEmail}`);
    pdfDoc.text(`Signed On: ${new Date().toLocaleString()}`);
    pdfDoc.text('Algorithm: SHA-256');
    
    // QR Code
    const qrDataUrl = await QRCode.toDataURL(locked_verification_url, { errorCorrectionLevel: 'H' });
    pdfDoc.fontSize(10).fillColor('#028090').text('Scan to Verify Document (PDF Only)', { align: 'center' });
    
    // Convert data URL to buffer and embed in PDF
    const base64 = qrDataUrl.split(',')[1];
    const buffer = Buffer.from(base64, 'base64');
    pdfDoc.image(buffer, { width: 150, align: 'center' });
    
    pdfDoc.fontSize(8).fillColor('#028090').text(`Or visit: ${locked_verification_url}`, { align: 'center' });
    pdfDoc.fontSize(7).fillColor('#666').text('This document is digitally signed. Any modification will invalidate the signature.', { align: 'center' });
    
    pdfDoc.end();
    
    // Wait for PDF to be written
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });
    
    // Calculate file hash
    const fileHash = crypto.createHash('sha256').update(fs.readFileSync(pdfPath)).digest('hex');
    const finalFileName = `${token}.pdf`;
    
    // Upload to InfinityFree
    const uploadResponse = await uploadPDFToInfinity(pdfPath, finalFileName);
    
    // Save to database
    const connection = await pool.getConnection();
    try {
      await connection.execute(
        'INSERT INTO documents (doc_name, description, token, file_name, file_hash, source_type, content, signature_hash, public_key, key_id, signature_timestamp, document_id, document_hash, checksum, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [doc_name, description || '', token, finalFileName, fileHash, doc_source, content, signature.signature_hash, signature.public_key, signature.key_id, signature.unix_timestamp, signature.document_id, signature.document_hash, signature.checksum, userId]
      );
    } finally {
      connection.release();
    }
    
    // Clean up temp file
    fs.unlinkSync(pdfPath);
    
    res.json({
      success: true,
      message: 'Document signed successfully!',
      doc_id: token,
      download_url: `/api/download/${token}`
    });
    
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/download/:token - Download PDF
router.get('/download/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    // Get document from database
    const connection = await pool.getConnection();
    try {
      const [rows] = await connection.execute('SELECT * FROM documents WHERE token = ? LIMIT 1', [token]);
      
      if (!rows || rows.length === 0) {
        return res.status(404).json({ error: 'Document not found' });
      }
      
      const doc = rows[0];
      const pdfUrl = `${process.env.INFINITYFREE_STORAGE_PATH}${doc.file_name}`;
      
      // Stream PDF to client
      const response = await axios.get(pdfUrl, { responseType: 'stream' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${doc.doc_name}.pdf"`);
      response.data.pipe(res);
      
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
