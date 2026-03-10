# Digital Signature System - Node.js/Express Version

A modern Node.js/Express implementation of a digital signature system with PDF generation, QR code embedding, and document verification. Deployable on Vercel with MySQL database on InfinityFree.

## Features

- ✅ **PDF Generation** with embedded QR codes (disappears on conversion to Word)
- ✅ **Digital Signatures** using SHA-256 hashing
- ✅ **QR Code Verification** with format detection
- ✅ **Document Management** via MySQL
- ✅ **Vercel Ready** - deploy instantly
- ✅ **Remote PDF Storage** on InfinityFree

## Prerequisites

- Node.js 16+ installed locally
- MySQL database (InfinityFree or any provider)
- Vercel account (for deployment)
- Git installed

## Setup

### 1. Local Development

```bash
# Navigate to project folder
cd c:\nodejs-signature-system

# Install dependencies
npm install

# Create .env file (copy from .env.example)
cp .env.example .env

# Edit .env with your database details
# Update these values:
# DB_HOST, DB_USER, DB_PASSWORD, DB_NAME
# SESSION_SECRET (generate a random string)

# Start development server
npm run dev
```

The server will run on `http://localhost:3000`

### 2. Database Setup

Make sure your MySQL database has the `documents` and `users` tables. Use the same schema from your PHP version:

```sql
CREATE TABLE documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  doc_name VARCHAR(255) NOT NULL,
  description TEXT,
  token VARCHAR(255) UNIQUE NOT NULL,
  file_name VARCHAR(255),
  file_hash VARCHAR(255),
  source_type VARCHAR(50),
  content LONGTEXT,
  signature_hash VARCHAR(255),
  public_key TEXT,
  key_id VARCHAR(255),
  signature_timestamp INT,
  document_id VARCHAR(255),
  document_hash VARCHAR(255),
  checksum VARCHAR(255),
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(created_by) REFERENCES users(user_id)
);

CREATE TABLE users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255),
  email VARCHAR(255) UNIQUE,
  role VARCHAR(50),
  profile_img VARCHAR(255),
  ...
);

CREATE TABLE settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  setting_name VARCHAR(100) UNIQUE NOT NULL,
  setting_value TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### 3. API Endpoints

#### Upload & Sign Document
```
POST /api/upload
Body:
  - doc_name: string (required)
  - description: string (optional)
  - doc_source: 'upload' | 'text' (required)
  - word_file: file (if doc_source='upload')
  - doc_content: string (if doc_source='text')

Response:
  {
    "success": true,
    "message": "Document signed successfully!",
    "doc_id": "token",
    "download_url": "/api/upload/download/token"
  }
```

#### Verify Document
```
GET /api/verify?token=xyz&h=hash&f=format&t=timestamp

Response:
  {
    "status": "valid" | "tampered" | "no_hash",
    "format_status": "original_pdf" | "converted" | "unknown",
    "doc_info": { ... }
  }
```

#### Download PDF
```
GET /api/upload/download/:token
```

## Deployment to Vercel

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/digital-signature-system.git
git push -u origin main
```

### 2. Deploy to Vercel
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel
```

### 3. Set Environment Variables in Vercel Dashboard

In your Vercel project settings, add these secrets:
- `DB_HOST`: sql106.infinityfree.com
- `DB_USER`: if0_40720975
- `DB_PASSWORD`: Dslol321
- `DB_NAME`: if0_40720975_digitalsignature
- `SESSION_SECRET`: (generate a random secure string)
- `NODE_ENV`: production

### 4. Update Verification URL

After deploying to Vercel, update the QR code URL in `routes/upload.js`:
```javascript
const locked_verification_url = `https://YOUR_VERCEL_DOMAIN.vercel.app/api/verify?token=${token}&h=${hash_lock}&f=${format_lock}`;
```

## File Structure

```
.
├── server.js              # Main Express server
├── package.json           # Dependencies
├── vercel.json           # Vercel configuration
├── .env.example          # Environment variables template
├── .gitignore            # Git ignore rules
├── config/
│   └── db.js             # MySQL connection pool
├── routes/
│   ├── upload.js         # Document upload & signing
│   └── verify.js         # Document verification
├── utils/                # Utility functions
├── middleware/           # Express middleware
└── cert/                 # Digital signature certificates (RSA keys)
```

## Key Differences from PHP Version

| Feature | PHP | Node.js |
|---------|-----|---------|
| **Server** | Apache/InfinityFree | Vercel Serverless |
| **PDF Library** | TCPDF | PDFKit |
| **QR Library** | phpqrcode | qrcode.js |
| **Database** | Direct MySQL | MySQL2 (connection pool) |
| **Sessions** | PHP Sessions | express-session |
| **Deployment** | InfinityFree FTP | Vercel Git |

## Troubleshooting

### Database Connection Issues
- Verify DB credentials in `.env`
- Check firewall/IP whitelist on InfinityFree
- Ensure MySQL user has proper permissions

### PDF Generation Fails
- PDFKit requires write access to `/tmp` or similar
- Vercel provides `/tmp` automatically in serverless functions
- Verify file paths use absolute paths

### QR Code Not Displaying
- Check DPI settings in PDFKit
- Verify QRCode module is installed
- Check that Base64 conversion is correct

## Security Notes

- **RSA Certificates**: Store cert.crt and private.pem securely
- **Session Secret**: Generate a strong random string
- **Database Password**: Never commit to Git, use environment variables
- **HTTPS**: Vercel provides HTTPS automatically

## Future Improvements

- [ ] Authentication & session management
- [ ] Real RSA cryptographic signatures
- [ ] Email notifications
- [ ] Bulk document signing
- [ ] API documentation (Swagger)
- [ ] Test suite

## License

ISC

## Support

For issues or questions, refer to the original PHP version documentation in the InfinityFree folder.
