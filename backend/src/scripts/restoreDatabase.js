import dotenv from 'dotenv';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '../..');

dotenv.config({ path: path.join(backendRoot, '.env') });

const targetUri = process.argv[2] || process.env.TARGET_MONGODB_URI;
if (!targetUri) {
  console.error('❌ Missing target MongoDB URI.');
  console.log('Usage: node src/scripts/restoreDatabase.js "<NEW_MONGODB_URI>" [optionalBackupPath]');
  console.log('Example: node src/scripts/restoreDatabase.js "mongodb+srv://user:pass@cluster.mongodb.net/english_course"');
  process.exit(1);
}

const backupsRoot = path.join(backendRoot, 'data/backups');
let backupDir = process.argv[3];

if (!backupDir) {
  // Find the latest backup folder
  const folders = fs.readdirSync(backupsRoot)
    .filter(f => f.startsWith('backup_'))
    .sort()
    .reverse();

  if (folders.length === 0) {
    console.error('❌ No backup folders found in data/backups/');
    process.exit(1);
  }
  backupDir = path.join(backupsRoot, folders[0]);
}

const dumpPath = path.join(backupDir, 'english_course');
if (!fs.existsSync(dumpPath)) {
  console.error(`❌ Dump folder does not exist: ${dumpPath}`);
  process.exit(1);
}

console.log('🚀 Starting MongoDB restore...');
console.log(`📁 Source dump: ${dumpPath}`);
console.log(`🎯 Target URI: ${targetUri.replace(/:([^:@]+)@/, ':****@')}`);

try {
  execSync(`mongorestore --uri="${targetUri}" "${dumpPath}"`, { stdio: 'inherit' });
  console.log('\n✅ Restore completed successfully!');
} catch (error) {
  console.error('❌ Restore failed:', error.message);
  process.exit(1);
}
