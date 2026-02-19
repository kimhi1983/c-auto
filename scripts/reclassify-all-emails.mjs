#!/usr/bin/env node
/**
 * 전체 이메일 일괄 재분류 스크립트
 *
 * 사용법:
 *   node scripts/reclassify-all-emails.mjs
 *
 * 환경변수:
 *   API_URL - Workers API URL (기본값: https://c-auto-workers-api.kimhi1983.workers.dev)
 *   EMAIL - 로그인 이메일
 *   PASSWORD - 로그인 비밀번호
 */

const API_URL = process.env.API_URL || 'https://c-auto-workers-api.kimhi1983.workers.dev';
const EMAIL = process.env.EMAIL || 'admin@kpros.kr';
const PASSWORD = process.env.PASSWORD;

if (!PASSWORD) {
  console.error('❌ 오류: PASSWORD 환경변수가 설정되지 않았습니다.');
  console.error('사용법: PASSWORD=your_password node scripts/reclassify-all-emails.mjs');
  process.exit(1);
}

let token = null;

// ─── 로그인 ───
async function login() {
  console.log('🔐 로그인 중...');
  const res = await fetch(`${API_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`로그인 실패: ${res.status} ${err}`);
  }

  const data = await res.json();
  token = data.token;
  console.log('✅ 로그인 성공\n');
}

// ─── 전체 이메일 조회 ───
async function fetchAllEmails() {
  console.log('📧 전체 이메일 조회 중...');
  const res = await fetch(`${API_URL}/api/v1/emails?limit=1000`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`이메일 조회 실패: ${res.status}`);
  }

  const data = await res.json();
  console.log(`✅ 총 ${data.emails.length}개 이메일 조회 완료\n`);
  return data.emails;
}

// ─── 이메일 재분류 ───
async function reclassifyEmail(emailId, index, total) {
  const res = await fetch(`${API_URL}/api/v1/emails/${emailId}/reclassify`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`  ❌ [${index + 1}/${total}] ID ${emailId} 재분류 실패: ${res.status} ${err}`);
    return { success: false, emailId, error: `${res.status} ${err}` };
  }

  const data = await res.json();
  const category = data.category || '알 수 없음';
  const code = data.ai_summary ? JSON.parse(data.ai_summary).code : '';
  console.log(`  ✅ [${index + 1}/${total}] ID ${emailId} → ${code}.${category}`);
  return { success: true, emailId, category: `${code}.${category}` };
}

// ─── 일괄 재분류 실행 ───
async function reclassifyAll() {
  const emails = await fetchAllEmails();

  if (emails.length === 0) {
    console.log('⚠️  재분류할 이메일이 없습니다.');
    return;
  }

  console.log(`🚀 ${emails.length}개 이메일 일괄 재분류 시작...\n`);

  const results = {
    total: emails.length,
    success: 0,
    failed: 0,
    categories: {},
  };

  // 순차 처리 (API 부하 방지)
  for (let i = 0; i < emails.length; i++) {
    const email = emails[i];
    const result = await reclassifyEmail(email.id, i, emails.length);

    if (result.success) {
      results.success++;
      const cat = result.category;
      results.categories[cat] = (results.categories[cat] || 0) + 1;
    } else {
      results.failed++;
    }

    // 10건마다 잠시 대기 (API 부하 방지)
    if ((i + 1) % 10 === 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // ─── 결과 출력 ───
  console.log('\n' + '='.repeat(60));
  console.log('📊 재분류 완료 결과');
  console.log('='.repeat(60));
  console.log(`총 처리: ${results.total}건`);
  console.log(`성공: ${results.success}건`);
  console.log(`실패: ${results.failed}건`);
  console.log('\n카테고리별 분포:');

  const sortedCategories = Object.entries(results.categories).sort((a, b) => {
    const orderMap = { 'A': 1, 'B': 2, 'C': 3, 'D': 4, 'E': 5 };
    const aCode = a[0].split('.')[0];
    const bCode = b[0].split('.')[0];
    return (orderMap[aCode] || 99) - (orderMap[bCode] || 99);
  });

  for (const [category, count] of sortedCategories) {
    const percentage = ((count / results.success) * 100).toFixed(1);
    console.log(`  ${category}: ${count}건 (${percentage}%)`);
  }
  console.log('='.repeat(60));
}

// ─── 메인 실행 ───
(async () => {
  try {
    await login();
    await reclassifyAll();
    console.log('\n✅ 모든 작업이 완료되었습니다!');
  } catch (error) {
    console.error('\n❌ 오류 발생:', error.message);
    process.exit(1);
  }
})();
