import assert from 'node:assert/strict';
import test from 'node:test';
import axios from 'axios';
import axiosInstance from '../src/api/axiosConfig.js';
import { createStudentVocabularyCatalogApi } from '../src/features/vocabulary-catalog/studentApi.js';

test('student catalog GET refreshes an expired access token and retries with the new token', async () => {
  const previousLocalStorage = globalThis.localStorage;
  const previousWindow = globalThis.window;
  const previousAdapter = axiosInstance.defaults.adapter;
  const previousPost = axios.post;
  const values = new Map([['accessToken', 'expired-access-token']]);
  const requests = [];
  let refreshRequest;

  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  globalThis.window = {
    __VOCAB_STUDENT_CATALOG_API_BASE__: 'https://api.example.test/api/v1/student/vocabulary-catalog',
    __VOCAB_STUDENT_CATALOG_HEADERS__: { 'X-Catalog-Test': 'enabled' },
    location: { pathname: '/student/vocabulary-catalog', search: '', replace: () => assert.fail('Unexpected login redirect') },
  };

  axios.post = async (url, _body, config) => {
    refreshRequest = { url, withCredentials: config.withCredentials };
    return { data: { data: { accessToken: 'refreshed-access-token' } } };
  };
  axiosInstance.defaults.adapter = async (config) => {
    const authorization = config.headers.get('Authorization');
    requests.push({
      baseURL: config.baseURL,
      url: config.url,
      authorization,
      params: config.params,
      testHeader: config.headers.get('X-Catalog-Test'),
      withCredentials: config.withCredentials,
    });

    if (authorization !== 'Bearer refreshed-access-token') {
      const response = {
        data: { status: 'error', message: 'Token expired' },
        status: 401,
        statusText: 'Unauthorized',
        headers: {},
        config,
        request: {},
      };
      throw new axios.AxiosError('Request failed with status code 401', 'ERR_BAD_REQUEST', config, {}, response);
    }

    return {
      data: { status: 'success', data: { items: [{ _id: 'tag-1' }], pagination: { page: 1 } } },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      request: {},
    };
  };

  try {
    const result = await createStudentVocabularyCatalogApi().listTags();

    assert.deepEqual(result, { items: [{ _id: 'tag-1' }], pagination: { page: 1 } });
    assert.equal(requests.length, 2);
    assert.equal(requests[0].authorization, 'Bearer expired-access-token');
    assert.equal(requests[1].authorization, 'Bearer refreshed-access-token');
    assert.equal(requests[0].baseURL, 'https://api.example.test/api/v1/student/vocabulary-catalog');
    assert.equal(requests[0].url, '/tags');
    assert.deepEqual(requests[0].params, { page: 1, limit: 100 });
    assert.equal(requests[0].testHeader, 'enabled');
    assert.equal(requests[0].withCredentials, true);
    assert.equal(refreshRequest.withCredentials, true);
    assert.match(refreshRequest.url, /\/auth\/refresh$/);
    assert.equal(values.get('accessToken'), 'refreshed-access-token');
  } finally {
    axiosInstance.defaults.adapter = previousAdapter;
    axios.post = previousPost;
    if (previousLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousLocalStorage;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
