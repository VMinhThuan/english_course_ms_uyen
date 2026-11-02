import dotenv from 'dotenv';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '../..');

dotenv.config({ path: path.join(backendRoot, '.env') });

const sourceUri = process.env.MONGODB_URI;
if (!sourceUri) {
  console.error('❌ MONGODB_URI is not set in backend/.env');
  process.exit(1);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(backendRoot, 'data/backups', `backup_${timestamp}`);
fs.mkdirSync(backupDir, { recursive: true });

console.log('📦 Starting MongoDB backup...');
console.log(`📁 Target directory: ${backupDir}`);

try {
  // Read-only dump: does not mutate or lock data on source database
  execSync(`mongodump --uri="${sourceUri}" --out="${backupDir}"`, { stdio: 'inherit' });
  console.log('\n✅ Backup finished successfully!');
  console.log(`📂 Location: ${backupDir}`);
  console.log('\n👉 To restore this backup to a new MongoDB database:');
  console.log(`   mongorestore --uri="<NEW_MONGODB_URI>" "${backupDir}/english_course"`);
} catch (error) {
  console.error('❌ Backup failed:', error.message);
  process.exit(1);
}
