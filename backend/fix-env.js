// Script để tự động thêm MONGODB_URI và JWT secrets vào file .env nếu thiếu
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envPath = join(__dirname, '.env');

console.log('🔧 Fixing .env file...\n');

if (!existsSync(envPath)) {
  console.error('❌ File .env does not exist!');
  console.error(`📝 Creating new .env file at: ${envPath}`);
  
  // Create new .env file with template
  const template = `PORT=3000
NODE_ENV=development

# MongoDB Atlas Connection String
# THAY <db_password> BẰNG PASSWORD THỰC TẾ CỦA BẠN
MONGODB_URI=mongodb+srv://minhthuan20192020:<db_password>@cluster0.cgaadgm.mongodb.net/english_course?retryWrites=true&w=majority&appName=Cluster0

# JWT Configuration
JWT_SECRET=dev-secret-key-123456789012345678901234567890
JWT_REFRESH_SECRET=dev-refresh-secret-123456789012345678901234567890
JWT_EXPIRE=15m
JWT_REFRESH_EXPIRE=7d

FRONTEND_URL=http://localhost:5173
`;
  
  writeFileSync(envPath, template, 'utf8');
  console.log('✅ Created .env file with template');
  console.log('⚠️  Please update MONGODB_URI with your actual password!\n');
  process.exit(0);
}

// Read existing .env file
let envContent = readFileSync(envPath, 'utf8');
let needsUpdate = false;

// Check if MONGODB_URI exists
if (envContent.includes('MONGODB_URI=')) {
  console.log('✅ MONGODB_URI already exists in .env file');
  
  // Check if it's set to a value (not empty or placeholder)
  const mongoUriMatch = envContent.match(/MONGODB_URI=(.+)/);
  if (mongoUriMatch) {
    const uriValue = mongoUriMatch[1].trim();
    if (uriValue && !uriValue.includes('<db_password>') && uriValue !== 'undefined') {
      console.log('✅ MONGODB_URI has a value set');
    } else {
      console.log('⚠️  MONGODB_URI exists but may need to be updated');
      console.log('📝 Current value:', uriValue.substring(0, 50) + '...');
      console.log('📖 Please check MONGODB_SETUP.md for instructions');
    }
  }
} else {
  console.log('❌ MONGODB_URI not found in .env file');
  console.log('➕ Adding MONGODB_URI to .env file...');
  needsUpdate = true;
  
  // Add MONGODB_URI after NODE_ENV or at the beginning if not found
  if (envContent.includes('NODE_ENV=')) {
    envContent = envContent.replace(
      /(NODE_ENV=.*\n)/,
      `$1\n# MongoDB Atlas Connection String\n# THAY <db_password> BẰNG PASSWORD THỰC TẾ CỦA BẠN\nMONGODB_URI=mongodb+srv://minhthuan20192020:<db_password>@cluster0.cgaadgm.mongodb.net/english_course?retryWrites=true&w=majority&appName=Cluster0\n`
    );
  } else {
    envContent = `# MongoDB Atlas Connection String
# THAY <db_password> BẰNG PASSWORD THỰC TẾ CỦA BẠN
MONGODB_URI=mongodb+srv://minhthuan20192020:<db_password>@cluster0.cgaadgm.mongodb.net/english_course?retryWrites=true&w=majority&appName=Cluster0

${envContent}`;
  }
}

// Check and add JWT secrets if missing
let needsJwtSecrets = false;
if (!envContent.includes('JWT_SECRET=')) {
  needsJwtSecrets = true;
  console.log('❌ JWT_SECRET not found in .env file');
} else {
  const jwtSecretMatch = envContent.match(/JWT_SECRET=(.+)/);
  if (jwtSecretMatch && (!jwtSecretMatch[1].trim() || jwtSecretMatch[1].trim() === 'undefined')) {
    needsJwtSecrets = true;
    console.log('❌ JWT_SECRET is empty or undefined');
  }
}

if (!envContent.includes('JWT_REFRESH_SECRET=')) {
  needsJwtSecrets = true;
  console.log('❌ JWT_REFRESH_SECRET not found in .env file');
} else {
  const jwtRefreshMatch = envContent.match(/JWT_REFRESH_SECRET=(.+)/);
  if (jwtRefreshMatch && (!jwtRefreshMatch[1].trim() || jwtRefreshMatch[1].trim() === 'undefined')) {
    needsJwtSecrets = true;
    console.log('❌ JWT_REFRESH_SECRET is empty or undefined');
  }
}

if (needsJwtSecrets) {
  console.log('➕ Adding JWT secrets to .env file...');
  needsUpdate = true;
  
  // Add JWT secrets if not present
  if (!envContent.includes('JWT_SECRET=')) {
    if (!envContent.includes('# JWT Configuration')) {
      envContent += '\n# JWT Configuration\n';
    }
    envContent += 'JWT_SECRET=dev-secret-key-123456789012345678901234567890\n';
  } else {
    // Replace empty JWT_SECRET
    envContent = envContent.replace(/JWT_SECRET=.*/, 'JWT_SECRET=dev-secret-key-123456789012345678901234567890');
  }
  
  if (!envContent.includes('JWT_REFRESH_SECRET=')) {
    envContent += 'JWT_REFRESH_SECRET=dev-refresh-secret-123456789012345678901234567890\n';
  } else {
    // Replace empty JWT_REFRESH_SECRET
    envContent = envContent.replace(/JWT_REFRESH_SECRET=.*/, 'JWT_REFRESH_SECRET=dev-refresh-secret-123456789012345678901234567890');
  }
  
  if (!envContent.includes('JWT_EXPIRE=')) {
    envContent += 'JWT_EXPIRE=15m\n';
  }
  
  if (!envContent.includes('JWT_REFRESH_EXPIRE=')) {
    envContent += 'JWT_REFRESH_EXPIRE=7d\n';
  }
}

if (needsUpdate) {
  writeFileSync(envPath, envContent, 'utf8');
  console.log('✅ Updated .env file');
  if (needsJwtSecrets) {
    console.log('✅ Added JWT secrets');
  }
  console.log('\n');
} else {
  console.log('✅ Everything looks good!\n');
}
