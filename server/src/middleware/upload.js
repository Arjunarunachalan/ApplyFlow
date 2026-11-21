import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// In Vercel serverless environments, the filesystem is read-only except for os.tmpdir().
// Locally, use server/uploads.
export const UPLOADS_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), "uploads")
  : path.resolve(__dirname, "../../uploads");
export const RESUMES_DIR = path.join(UPLOADS_DIR, "resumes");
export const IMPORT_TMP_DIR = path.join(UPLOADS_DIR, "tmp");

for (const dir of [UPLOADS_DIR, RESUMES_DIR, IMPORT_TMP_DIR]) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    console.warn(`[upload] Could not create directory ${dir}: ${err.message}`);
  }
}

const diskStorage = (destination) =>
  multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, destination),
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      cb(null, `${Date.now()}-${safe}`);
    },
  });

// CSVs land in a temp folder and are deleted by the controller once parsed.
export const csvUpload = multer({
  storage: diskStorage(IMPORT_TMP_DIR),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const isCsv =
      file.mimetype === "text/csv" ||
      file.mimetype === "application/vnd.ms-excel" ||
      file.mimetype === "text/plain" ||
      path.extname(file.originalname).toLowerCase() === ".csv";

    if (!isCsv) return cb(new Error("Only .csv files can be imported"));
    cb(null, true);
  },
});

export const resumeUpload = multer({
  storage: diskStorage(RESUMES_DIR),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const isPdf =
      file.mimetype === "application/pdf" ||
      path.extname(file.originalname).toLowerCase() === ".pdf";

    if (!isPdf) return cb(new Error("Only PDF resumes are accepted"));
    cb(null, true);
  },
});
