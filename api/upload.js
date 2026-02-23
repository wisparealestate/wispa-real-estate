import multer from "multer";
import path from "path";
import fs from "fs";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import mime from "mime";

const S3_BUCKET = process.env.AWS_S3_BUCKET || null;
const s3 = S3_BUCKET ? new S3Client({ region: process.env.AWS_REGION }) : null;

// Set up storage engine
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(process.cwd(), "uploads");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const uniqueName = Date.now() + "-" + Math.round(Math.random() * 1e9) + ext;
    cb(null, uniqueName);
  },
});

const upload = multer({ storage });

export default upload;

// Helper to upload a file buffer to S3 and return public URL (if configured)
export async function uploadBufferToS3(buffer, filename, contentType) {
  if (!s3 || !S3_BUCKET) return null;
  const key = `uploads/${filename}`;
  const params = {
    Bucket: S3_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType || mime.getType(filename) || 'application/octet-stream',
    ACL: 'public-read'
  };
  await s3.send(new PutObjectCommand(params));
  const base = process.env.AWS_S3_BASE_URL || `https://${S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com`;
  return `${base}/${key}`;
}
