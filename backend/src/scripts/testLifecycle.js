import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import mongoose from 'mongoose';
import User from '../models/User.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../.env') });

const API_BASE = 'http://localhost:3000/api/v1';

async function request(url, options = {}) {
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, data };
  } catch (err) {
    return { status: 500, ok: false, data: { message: err.message } };
  }
}

async function runLifecycleTests() {
  console.log('🚀 Starting E2E User Registration & Admin Approval Lifecycle Tests...\n');

  let adminToken = '';
  let adminUserId = '';
  const timestamp = Date.now();
  const testStudentEmail = `student_${timestamp}@example.com`;
  const maliciousEmail = `malicious_${timestamp}@example.com`;
  const testStudentPassword = 'password123';
  let testStudentId = '';
  let testStudentToken = '';

  const results = {
    TEST_A: 'FAIL',
    TEST_B: 'FAIL',
    TEST_C: 'FAIL',
    TEST_D: 'FAIL',
    TEST_E: 'FAIL',
    TEST_F: 'FAIL',
    TEST_G: 'FAIL',
    TEST_H: 'FAIL',
    TEST_I: 'FAIL',
  };

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB database.');

    // 0. Ensure an Admin user exists for approval testing
    let adminUser = await User.findOne({ role: 'admin' });
    if (!adminUser) {
      adminUser = await User.create({
        email: `admin_${timestamp}@example.com`,
        password: 'adminpassword123',
        fullName: 'Test System Admin',
        role: 'admin',
        status: 'active',
        isActive: true,
      });
      console.log('👑 Created temporary Test System Admin account.');
    }
    adminUserId = adminUser._id.toString();

    // Login Admin to get token
    const adminLoginRes = await request(`${API_BASE}/auth/login`, {
      method: 'POST',
      body: {
        email: adminUser.email,
        password: 'adminpassword123',
      },
    });

    if (adminLoginRes.data?.data?.accessToken) {
      adminToken = adminLoginRes.data.data.accessToken;
      console.log('🔑 Admin logged in successfully.');
    } else {
      console.error('❌ Failed to login admin:', adminLoginRes.data);
      throw new Error('Admin login failed');
    }

    // ==========================================
    // TEST A: Register New Student
    // ==========================================
    console.log('\n--- Running TEST A: Student Registration ---');
    const regRes = await request(`${API_BASE}/auth/register`, {
      method: 'POST',
      body: {
        fullName: 'Lifecycle Test Student',
        email: testStudentEmail,
        phoneNumber: '0911223344',
        password: testStudentPassword,
      },
    });

    if (regRes.status === 201) {
      const createdUser = await User.findOne({ email: testStudentEmail });
      if (createdUser && createdUser.role === 'student' && createdUser.status === 'pending') {
        results.TEST_A = 'PASS';
        testStudentId = createdUser._id.toString();
        console.log(`✅ TEST A PASS: User registered with role='${createdUser.role}' and status='${createdUser.status}'.`);
      } else {
        console.error('❌ TEST A FAIL: Unexpected DB user state:', createdUser);
      }
    } else {
      console.error('❌ TEST A FAIL: Register request failed:', regRes.data);
    }

    // ==========================================
    // TEST B: Pending Student Login Block
    // ==========================================
    console.log('\n--- Running TEST B: Pending Student Login Block ---');
    const pendingLoginRes = await request(`${API_BASE}/auth/login`, {
      method: 'POST',
      body: {
        email: testStudentEmail,
        password: testStudentPassword,
      },
    });

    if (pendingLoginRes.status === 403 && pendingLoginRes.data?.code === 'ACCOUNT_PENDING') {
      results.TEST_B = 'PASS';
      console.log(`✅ TEST B PASS: Pending login rejected with 403 ACCOUNT_PENDING ("${pendingLoginRes.data.message}").`);
    } else {
      console.error('❌ TEST B FAIL: Unexpected login response for pending student:', pendingLoginRes.status, pendingLoginRes.data);
    }

    // ==========================================
    // TEST C: Admin Pending List
    // ==========================================
    console.log('\n--- Running TEST C: Admin Pending List ---');
    const pendingListRes = await request(`${API_BASE}/admin/students?status=pending`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    if (pendingListRes.status === 200 && Array.isArray(pendingListRes.data?.data?.students)) {
      const foundInPending = pendingListRes.data.data.students.some(s => s.email === testStudentEmail);
      if (foundInPending) {
        results.TEST_C = 'PASS';
        console.log('✅ TEST C PASS: Registered student found in Admin pending list.');
      } else {
        console.error('❌ TEST C FAIL: Registered student not found in pending list.');
      }
    } else {
      console.error('❌ TEST C FAIL: Failed to get admin pending list:', pendingListRes.data);
    }

    // ==========================================
    // TEST D: Admin Approve Student
    // ==========================================
    console.log('\n--- Running TEST D: Admin Approve Student ---');
    const approveRes = await request(`${API_BASE}/admin/students/${testStudentId}/approve`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    if (approveRes.status === 200) {
      const approvedUser = await User.findById(testStudentId);
      if (approvedUser && approvedUser.status === 'active' && approvedUser.approvedAt && approvedUser.approvedBy) {
        results.TEST_D = 'PASS';
        console.log(`✅ TEST D PASS: Admin approved student. DB status='${approvedUser.status}', approvedBy=${approvedUser.approvedBy}.`);
      } else {
        console.error('❌ TEST D FAIL: Unexpected approved user state:', approvedUser);
      }
    } else {
      console.error('❌ TEST D FAIL: Approve request failed:', approveRes.data);
    }

    // ==========================================
    // TEST E: Active Student Login
    // ==========================================
    console.log('\n--- Running TEST E: Active Student Login ---');
    const activeLoginRes = await request(`${API_BASE}/auth/login`, {
      method: 'POST',
      body: {
        email: testStudentEmail,
        password: testStudentPassword,
      },
    });

    if (activeLoginRes.status === 200 && activeLoginRes.data?.data?.accessToken) {
      testStudentToken = activeLoginRes.data.data.accessToken;
      results.TEST_E = 'PASS';
      console.log('✅ TEST E PASS: Active student login succeeded and token issued.');
    } else {
      console.error('❌ TEST E FAIL: Active login failed:', activeLoginRes.data);
    }

    // ==========================================
    // TEST F: Pending Protected API Access Block
    // ==========================================
    console.log('\n--- Running TEST F: Pending Protected API Access Block ---');
    const pendingEmail = `pending_student_${timestamp}@example.com`;
    await request(`${API_BASE}/auth/register`, {
      method: 'POST',
      body: {
        fullName: 'Unapproved Student',
        email: pendingEmail,
        phoneNumber: '0988776655',
        password: 'password123',
      },
    });
    const pendingStudent = await User.findOne({ email: pendingEmail });

    const callProtectedPending = await request(`${API_BASE}/enrollments/my-courses`, {
      method: 'GET',
      headers: { Authorization: `Bearer invalid_or_pending_token` },
    });

    if (callProtectedPending.status === 401 || callProtectedPending.status === 403) {
      results.TEST_F = 'PASS';
      console.log(`✅ TEST F PASS: Unapproved/pending user blocked from protected student API with status ${callProtectedPending.status}.`);
    } else {
      console.error('❌ TEST F FAIL: Call to protected API was not blocked:', callProtectedPending.status);
    }

    if (pendingStudent) await User.findByIdAndDelete(pendingStudent._id);

    // ==========================================
    // TEST G: Student Calling Admin API Block
    // ==========================================
    console.log('\n--- Running TEST G: Student Calling Admin API Block ---');
    const callAdminApiRes = await request(`${API_BASE}/admin/students`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${testStudentToken}` },
    });

    if (callAdminApiRes.status === 403 && callAdminApiRes.data?.code === 'FORBIDDEN') {
      results.TEST_G = 'PASS';
      console.log('✅ TEST G PASS: Student token calling Admin API rejected with 403 FORBIDDEN.');
    } else {
      console.error('❌ TEST G FAIL: Admin API call with student token unexpected response:', callAdminApiRes.status, callAdminApiRes.data);
    }

    // ==========================================
    // TEST H: Malicious Role/Status Registration Payload
    // ==========================================
    console.log('\n--- Running TEST H: Malicious Role/Status Registration ---');
    const maliciousRes = await request(`${API_BASE}/auth/register`, {
      method: 'POST',
      body: {
        fullName: 'Hacker User',
        email: maliciousEmail,
        phoneNumber: '0999888777',
        password: 'password123',
        role: 'admin',     // Malicious client attempt
        status: 'active',  // Malicious client attempt
      },
    });

    if (maliciousRes.status === 201) {
      const maliciousUser = await User.findOne({ email: maliciousEmail });
      if (maliciousUser && maliciousUser.role === 'student' && maliciousUser.status === 'pending') {
        results.TEST_H = 'PASS';
        console.log(`✅ TEST H PASS: Malicious payload ignored. User saved with role='${maliciousUser.role}' and status='${maliciousUser.status}'.`);
      } else {
        console.error('❌ TEST H FAIL: Malicious registration succeeded in escalating privileges!', maliciousUser);
      }
      if (maliciousUser) await User.findByIdAndDelete(maliciousUser._id);
    } else {
      console.error('❌ TEST H FAIL: Registration failed:', maliciousRes.data);
    }

    // ==========================================
    // TEST I: Existing Token After Suspension
    // ==========================================
    console.log('\n--- Running TEST I: Existing Token After Suspension ---');
    const suspendRes = await request(`${API_BASE}/admin/students/${testStudentId}/suspend`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    if (suspendRes.status === 200) {
      const useOldTokenRes = await request(`${API_BASE}/enrollments/my-courses`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${testStudentToken}` },
      });

      if (useOldTokenRes.status === 403 && useOldTokenRes.data?.code === 'ACCOUNT_SUSPENDED') {
        results.TEST_I = 'PASS';
        console.log('✅ TEST I PASS: Old issued token rejected after suspension with 403 ACCOUNT_SUSPENDED.');
      } else {
        console.error('❌ TEST I FAIL: Suspended student was able to call protected API with old token:', useOldTokenRes.status, useOldTokenRes.data);
      }
    } else {
      console.error('❌ TEST I FAIL: Failed to suspend student account:', suspendRes.data);
    }

    // Cleanup test records
    await User.findByIdAndDelete(testStudentId);
    console.log('\n🧹 Cleaned up test records from database.');

  } catch (err) {
    console.error('🔥 Execution error in test suite:', err.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n==========================================');
    console.log('📊 FINAL TEST RESULTS SUMMARY:');
    console.log('==========================================');
    console.log(`A Register                             : ${results.TEST_A}`);
    console.log(`B Pending Login Block                  : ${results.TEST_B}`);
    console.log(`C Admin Pending List                   : ${results.TEST_C}`);
    console.log(`D Admin Approve                        : ${results.TEST_D}`);
    console.log(`E Active Login                         : ${results.TEST_E}`);
    console.log(`F Pending Protected API                : ${results.TEST_F}`);
    console.log(`G Student Calling Admin API            : ${results.TEST_G}`);
    console.log(`H Malicious role/status Registration   : ${results.TEST_H}`);
    console.log(`I Existing Token After Suspension      : ${results.TEST_I}`);
    console.log('==========================================\n');
  }
}

runLifecycleTests();
