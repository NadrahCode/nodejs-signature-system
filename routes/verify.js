import express from 'express';
import crypto from 'crypto';
import pool from '../config/db.js';
import axios from 'axios';

const router = express.Router();

// GET /api/verify - Verify document via QR code parameters
router.get('/', async (req, res) => {
  try {
    const { token, h, f, t } = req.query;
    
    if (!token) {
      return res.status(400).json({ error: 'No document token provided' });
    }
    
    // Get document from database
    const connection = await pool.getConnection();
    try {
      const [rows] = await connection.execute(
        'SELECT d.*, u.name as signer_name, u.email as signer_email FROM documents d LEFT JOIN users u ON d.created_by = u.user_id WHERE d.token = ? LIMIT 1',
        [token]
      );
      
      if (!rows || rows.length === 0) {
        return res.status(404).json({ error: 'Document not found', status: 'error' });
      }
      
      const docInfo = rows[0];
      
      // Verify hash lock (integrity)
      const expectedLock = crypto.createHash('sha256').update(`${docInfo.token}|${docInfo.signature_hash}`).digest('hex').substring(0, 32);
      
      let integrityStatus = 'no_hash';
      if (!h) {
        integrityStatus = 'no_hash';
      } else if (h === expectedLock) {
        integrityStatus = 'valid';
      } else {
        integrityStatus = 'tampered';
      }
      
      // Verify format lock (PDF integrity)
      let formatStatus = 'unknown';
      if (f) {
        // Check if PDF file is still valid
        const pdfPath = `${process.env.INFINITYFREE_STORAGE_PATH}${docInfo.file_name}`;
        try {
          const response = await axios.head(pdfPath);
          if (response.status === 200) {
            // Additional check: verify file is still PDF
            const headResponse = await axios.get(pdfPath, { 
              headers: { Range: 'bytes=0-3' },
              responseType: 'arraybuffer'
            });
            const header = Buffer.from(headResponse.data).toString('utf8');
            formatStatus = header.includes('%PDF') ? 'original_pdf' : 'converted';
          }
        } catch (error) {
          formatStatus = 'unknown';
        }
      } else {
        // No format lock = likely converted document
        formatStatus = 'converted';
      }
      
      // Document info
      const result = {
        status: integrityStatus,
        format_status: formatStatus,
        doc_info: {
          doc_name: docInfo.doc_name,
          description: docInfo.description,
          created_at: docInfo.created_at,
          signer_name: docInfo.signer_name,
          signer_email: docInfo.signer_email,
          signature_timestamp: docInfo.signature_timestamp,
          algorithm: 'SHA-256',
          document_id: docInfo.document_id.substring(0, 32) + '...',
          checksum: docInfo.checksum
        }
      };
      
      res.json(result);
      
    } finally {
      connection.release();
    }
    
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/verify/upload - Upload file to verify integrity
router.post('/upload', async (req, res) => {
  try {
    const { token } = req.body;
    const file = req.files?.verify_file;
    
    if (!token || !file) {
      return res.status(400).json({ error: 'Token and file are required' });
    }
    
    const connection = await pool.getConnection();
    try {
      const [rows] = await connection.execute('SELECT file_hash FROM documents WHERE token = ? LIMIT 1', [token]);
      
      if (!rows || rows.length === 0) {
        return res.status(404).json({ error: 'Document not found' });
      }
      
      // Calculate uploaded file hash
      const crypto_module = crypto;
      const uploadedHash = crypto_module.createHash('sha256').update(file.data).digest('hex');
      const expectedHash = rows[0].file_hash;
      
      const result = uploadedHash === expectedHash ? 'match' : 'mismatch';
      
      res.json({ result, message: result === 'match' ? 'File matches original' : 'File does not match' });
      
    } finally {
      connection.release();
    }
    
  } catch (error) {
    console.error('Upload verification error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
