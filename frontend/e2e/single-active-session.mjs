import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.SINGLE_SESSION_E2E_URL;
const email = process.env.SINGLE_SESSION_E2E_EMAIL;
const password = process.env.SINGLE_SESSION_E2E_PASSWORD;
if (!baseUrl || !email || !password) {
  throw new Error('Set SINGLE_SESSION_E2E_URL, SINGLE_SESSION_E2E_EMAIL, and SINGLE_SESSION_E2E_PASSWORD for the disposable staging E2E run.');
}

const browser = await chromium.launch({ headless: true });
const deviceOne = await browser.newContext();
const deviceTwo = await browser.newContext();
try {
  const login = async (context) => {
    const response = await context.request.post(`${baseUrl}/api/v1/auth/login`, { data: { email, password } });
    assert.equal(response.status(), 200);
    return response.json();
  };
  const firstLogin = await login(deviceOne);
  const firstToken = firstLogin.data.accessToken;
  const secondLogin = await login(deviceTwo);
  const secondToken = secondLogin.data.accessToken;
  assert.notEqual(firstToken, secondToken);

  const staleAccess = await deviceOne.request.get(`${baseUrl}/api/v1/auth/me`, { headers: { Authorization: `Bearer ${firstToken}` } });
  assert.equal(staleAccess.status(), 401);
  assert.equal((await staleAccess.json()).code, 'SESSION_REPLACED');

  const currentAccess = await deviceTwo.request.get(`${baseUrl}/api/v1/auth/me`, { headers: { Authorization: `Bearer ${secondToken}` } });
  assert.equal(currentAccess.status(), 200);
} finally {
  await deviceOne.close();
  await deviceTwo.close();
  await browser.close();
}
